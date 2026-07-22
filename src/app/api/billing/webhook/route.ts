import { NextResponse } from "next/server";

import { adminDb } from "@/lib/server/firebase-admin";
import { verifyWebhook, parseMerchantOrderId } from "@/lib/billing/paymob";
import { getPlan } from "@/lib/billing/plans";
import { sendEmail, receiptEmail } from "@/lib/server/email";

/**
 * Paymob transaction webhook.
 *
 * Paymob POSTs the processed transaction with an `hmac` query param. We verify
 * the signature, and on a successful payment flip the farm's subscription to
 * active for a 30-day period. Unverified or unsuccessful callbacks are acked
 * (200) but change nothing — retrying or replaying can't grant access.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERIOD_MS = 30 * 86_400_000;

export async function POST(req: Request) {
  const hmac = new URL(req.url).searchParams.get("hmac") ?? "";
  let payload: { obj?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const obj = payload.obj;
  if (!obj || !verifyWebhook(obj, hmac)) {
    // Bad signature — never trust it. Ack so Paymob stops retrying.
    return NextResponse.json({ ok: false, verified: false });
  }

  const success = obj.success === true;
  const order = obj.order as Record<string, unknown> | undefined;
  const merchantOrderId = order?.merchant_order_id as string | undefined;
  const parsed = merchantOrderId ? parseMerchantOrderId(merchantOrderId) : null;

  if (!success || !parsed) {
    return NextResponse.json({ ok: true, applied: false });
  }

  const plan = getPlan(parsed.tier);
  const now = new Date();
  const db = await adminDb();
  await db.doc(`farms/${parsed.farmId}`).set(
    {
      plan: parsed.tier,
      animalLimit: plan.herdLimit,
      subscription: {
        status: "active",
        tier: parsed.tier,
        trialEndsAt: null,
        currentPeriodEnd: new Date(now.getTime() + PERIOD_MS).toISOString(),
        provider: "paymob",
        providerRef: String(obj.id ?? ""),
      },
    },
    { merge: true },
  );

  // Emailed receipt (best-effort; no-op if email isn't configured).
  try {
    const owner = await db
      .collection(`farms/${parsed.farmId}/members`)
      .where("role", "==", "owner")
      .limit(1)
      .get();
    const email = owner.docs[0]?.data()?.email as string | undefined;
    if (email) {
      const amountEgp = Math.round(Number(obj.amount_cents ?? plan.amount) / 100);
      const { subject, html } = receiptEmail(plan.en.name, amountEgp, String(obj.id ?? ""));
      await sendEmail(email, subject, html);
    }
  } catch (err) {
    console.error("[billing/webhook] receipt email failed", err);
  }

  return NextResponse.json({ ok: true, applied: true });
}
