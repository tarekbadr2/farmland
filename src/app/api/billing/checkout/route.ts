import { NextResponse } from "next/server";

import { verifyBearer, adminDb } from "@/lib/server/firebase-admin";
import { resolveUserFarmId, canManageBilling } from "@/lib/server/resolve-farm";
import { isConfigured, createCheckoutUrl } from "@/lib/billing/paymob";
import { PLANS, getPlan, type PlanTier } from "@/lib/billing/plans";
import { changeKind, proratedCharge } from "@/lib/billing/proration";
import type { Farm } from "@/core/domain/types";

/**
 * Starts (or applies) a plan change for the caller's farm.
 *
 * - New / upgrade / trial→paid: returns a Paymob payment URL for the amount due
 *   (prorated against unused time when already on a paid plan). When Paymob
 *   isn't configured yet it returns `{ configured: false }` and charges nothing.
 * - Downgrade fully covered by unused credit (amount due = 0): applied
 *   immediately, no payment, `{ applied: true }`.
 *
 * Gated behind a Firebase ID token; CORS-enabled for the bundled desktop app.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, { ...init, headers: { ...CORS, ...(init?.headers ?? {}) } });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  let caller;
  try {
    caller = await verifyBearer(req.headers.get("authorization"));
  } catch {
    return json({ configured: true, error: "auth-unavailable" }, { status: 503 });
  }
  if (!caller) return json({ error: "unauthorized" }, { status: 401 });

  let body: { tier?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid-json" }, { status: 400 });
  }
  const tier = body.tier as PlanTier;
  if (!tier || !PLANS[tier]) return json({ error: "invalid-tier" }, { status: 400 });

  // Resolve the caller's farm and its current subscription.
  const db = await adminDb();
  const userSnap = await db.doc(`users/${caller.uid}`).get();
  const farmId = userSnap.exists ? resolveUserFarmId(userSnap.data()) : null;
  if (!farmId) return json({ error: "no-farm" }, { status: 400 });

  // Only an owner/settings-admin may start checkout or change the plan.
  const memberSnap = await db.doc(`farms/${farmId}/members/${caller.uid}`).get();
  if (!canManageBilling(memberSnap.data())) return json({ error: "forbidden" }, { status: 403 });

  const farmRef = db.doc(`farms/${farmId}`);
  const farmSnap = await farmRef.get();
  const farm = farmSnap.exists ? ({ id: farmSnap.id, ...farmSnap.data() } as Farm) : undefined;
  const sub = farm?.subscription;
  const now = new Date();
  const paidActive =
    sub?.status === "active" &&
    (!sub.currentPeriodEnd || Date.parse(sub.currentPeriodEnd) > now.getTime());

  // Amount due today: prorated when switching within a paid period, else full.
  const nextPlan = getPlan(tier);
  const amountDue = paidActive
    ? proratedCharge(getPlan(sub!.tier), nextPlan, sub!.currentPeriodEnd, now)
    : nextPlan.amount;

  if (paidActive && changeKind(sub!.tier, tier) === "same") {
    return json({ error: "same-plan" }, { status: 400 });
  }

  // Credit covers it (a downgrade) → apply now, no payment, keep the period.
  if (paidActive && amountDue === 0) {
    await farmRef.set(
      {
        plan: tier,
        animalLimit: nextPlan.herdLimit,
        subscription: { ...sub, tier },
      },
      { merge: true },
    );
    return json({ applied: true, tier });
  }

  if (!isConfigured()) return json({ configured: false });

  try {
    const url = await createCheckoutUrl(
      tier,
      {
        farmId,
        email: caller.email ?? "",
        name: (userSnap.data()!.name as string) ?? caller.email ?? "Farm Owner",
      },
      amountDue,
    );
    return json({ configured: true, url });
  } catch (err) {
    console.error("[billing/checkout] failed:", err);
    return json({ configured: true, error: "checkout-failed" }, { status: 502 });
  }
}
