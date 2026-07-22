"use client";

import { getFirebase } from "@/infrastructure/firebase/client";
import { WEB_ORIGIN } from "@/lib/download";
import type { PlanTier } from "./plans";

// Billing runs server-side (Paymob secrets). The bundled desktop app has no API
// routes, so — like the AI advisor — it calls back to the hosted origin.
export interface CheckoutResult {
  /** False when Paymob isn't configured yet — the UI shows a "coming soon" note. */
  configured: boolean;
  /** Hosted payment page to send the owner to (when configured). */
  url?: string;
  /** A zero-cost downgrade was applied immediately — no payment needed. */
  applied?: boolean;
  error?: string;
}

async function authedFetch(path: string, body: unknown): Promise<Response> {
  const { auth } = getFirebase();
  const token = await auth.currentUser?.getIdToken();
  const endpoint =
    process.env.NEXT_PUBLIC_DESKTOP === "1" ? `${WEB_ORIGIN}${path}` : path;
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** Ask the server to start a plan change. Returns a payment URL, an immediate
 *  `applied` for a credit-covered downgrade, or `{ configured: false }`. */
export async function startCheckout(tier: PlanTier): Promise<CheckoutResult> {
  try {
    const res = await authedFetch("/api/billing/checkout", { tier });
    if (!res.ok) return { configured: true, error: `http-${res.status}` };
    return (await res.json()) as CheckoutResult;
  } catch {
    return { configured: true, error: "network" };
  }
}

/** Cancel (or resume) the subscription. Cancel keeps access until period end. */
export async function cancelSubscription(resume = false): Promise<{ ok: boolean }> {
  try {
    const res = await authedFetch("/api/billing/cancel", {
      action: resume ? "resume" : "cancel",
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
