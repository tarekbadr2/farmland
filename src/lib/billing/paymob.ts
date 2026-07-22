import "server-only";

import crypto from "node:crypto";
import { getPlan, PLAN_ORDER, type PlanTier } from "./plans";

/**
 * Paymob integration seam (server-only).
 *
 * Implements Paymob's classic Accept flow — auth → order → payment key → hosted
 * iframe URL — and the webhook HMAC check. Everything is gated on configuration:
 * with no keys set, `isConfigured()` is false and the checkout route degrades to
 * an honest "coming soon" instead of calling anything. Add these to the server
 * env (NEVER NEXT_PUBLIC_, never pasted into chat) to go live:
 *
 *   PAYMOB_API_KEY          — secret API key
 *   PAYMOB_INTEGRATION_ID   — card/wallet integration id (payment method)
 *   PAYMOB_IFRAME_ID        — hosted iframe id used to build the redirect URL
 *   PAYMOB_HMAC_SECRET      — HMAC secret for verifying webhook callbacks
 */

const BASE = "https://accept.paymob.com/api";

export function isConfigured(): boolean {
  return Boolean(
    process.env.PAYMOB_API_KEY &&
      process.env.PAYMOB_INTEGRATION_ID &&
      process.env.PAYMOB_IFRAME_ID &&
      process.env.PAYMOB_HMAC_SECRET,
  );
}

interface Billing {
  farmId: string;
  email: string;
  name: string;
}

/** Run the full Accept flow and return a hosted payment-page URL. `amountCents`
 *  overrides the plan price (used for a prorated mid-cycle upgrade). */
export async function createCheckoutUrl(
  tier: PlanTier,
  billing: Billing,
  amountCents?: number,
): Promise<string> {
  const plan = getPlan(tier);
  const amount = amountCents ?? plan.amount;
  const apiKey = process.env.PAYMOB_API_KEY!;
  const integrationId = Number(process.env.PAYMOB_INTEGRATION_ID!);
  const iframeId = process.env.PAYMOB_IFRAME_ID!;

  // 1) Auth token.
  const auth = await post(`${BASE}/auth/tokens`, { api_key: apiKey });
  const token = auth.token as string;

  // 2) Order. merchant_order_id ties the payment back to the farm + plan.
  const order = await post(`${BASE}/ecommerce/orders`, {
    auth_token: token,
    delivery_needed: false,
    amount_cents: amount,
    currency: "EGP",
    merchant_order_id: `${billing.farmId}:${tier}:${Date.now()}`,
    items: [],
  });

  // 3) Payment key.
  const [firstName, ...rest] = (billing.name || "Farm Owner").split(" ");
  const key = await post(`${BASE}/acceptance/payment_keys`, {
    auth_token: token,
    amount_cents: amount,
    expiration: 3600,
    order_id: order.id,
    currency: "EGP",
    integration_id: integrationId,
    billing_data: {
      email: billing.email || "owner@example.com",
      first_name: firstName || "Farm",
      last_name: rest.join(" ") || "Owner",
      phone_number: "+20000000000",
      apartment: "NA", floor: "NA", street: "NA", building: "NA",
      shipping_method: "NA", postal_code: "NA", city: "NA",
      country: "EG", state: "NA",
    },
  });

  return `${BASE}/acceptance/iframes/${iframeId}?payment_token=${key.token as string}`;
}

/**
 * Verify a Paymob transaction webhook. Paymob signs a fixed, alphabetically-
 * ordered subset of the transaction object with HMAC-SHA512; we recompute it and
 * compare against the `hmac` query parameter.
 */
export function verifyWebhook(obj: Record<string, unknown>, hmac: string): boolean {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (!secret || !hmac) return false;
  const s = (v: unknown) => (v === true ? "true" : v === false ? "false" : String(v ?? ""));
  const ordered = [
    "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction",
    "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded",
    "is_standalone_payment", "is_voided", "order.id", "owner", "pending",
    "source_data.pan", "source_data.sub_type", "source_data.type", "success",
  ];
  const get = (path: string) =>
    path.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], obj);
  const concatenated = ordered.map((p) => s(get(p))).join("");
  const digest = crypto.createHmac("sha512", secret).update(concatenated).digest("hex");
  // Constant-time compare.
  const a = Buffer.from(digest);
  const b = Buffer.from(hmac);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Parse `merchant_order_id` = "farmId:tier:ts" back into its parts. */
export function parseMerchantOrderId(id: string): { farmId: string; tier: PlanTier } | null {
  const [farmId, tier] = String(id).split(":");
  if (!farmId || !(PLAN_ORDER as string[]).includes(tier)) return null;
  return { farmId, tier: tier as PlanTier };
}

async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Paymob ${url} → ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}
