/**
 * Entitlement resolution.
 *
 * One pure function turns a farm's subscription + usage into the yes/no facts
 * the UI needs: is the trial still running, how many days are left, is access
 * blocked, and how much of the AI quota is spent. No React, no Firebase — just
 * arithmetic over the farm document, so it's trivial to reason about and test.
 */

import type { Farm, SubscriptionStatus } from "@/core/domain/types";
import { getPlan, type Plan, type PlanTier } from "./plans";

const DAY = 86_400_000;

/** Calendar-month key, e.g. "2026-07". Usage counters reset when this changes. */
export function isoMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Days a past-due subscription keeps working past its period end before the
 *  hard gate — room for a failed payment to be retried. */
const PAST_DUE_GRACE_DAYS = 3;

export interface Entitlement {
  status: SubscriptionStatus | "legacy";
  tier: PlanTier;
  plan: Plan;
  trialing: boolean;
  /** Whole days left in the trial (0 when not trialing / expired). */
  trialDaysLeft: number;
  /** True on an active paid plan (used to decide whether a change prorates). */
  paidActive: boolean;
  /** Canceled but still inside the paid period (access continues until it ends). */
  canceledGrace: boolean;
  /** ISO end of the current paid period, if any. */
  periodEndsAt: string | null;
  /** Access should be hard-gated (trial ended and not on an active plan). */
  blocked: boolean;
  aiUsed: number;
  aiQuota: number;
  aiRemaining: number;
  aiExhausted: boolean;
}

export function resolveEntitlement(farm: Farm | undefined, now = new Date()): Entitlement {
  const sub = farm?.subscription;
  const tier: PlanTier = sub?.tier ?? "starter";
  const plan = getPlan(tier);
  const aiQuota = plan.aiQuota;
  const aiUsed = farm?.aiUsage?.month === isoMonth(now) ? farm.aiUsage.count : 0;
  const aiFacts = {
    aiUsed,
    aiQuota,
    aiRemaining: Math.max(0, aiQuota - aiUsed),
    aiExhausted: aiUsed >= aiQuota,
  };

  // Grandfathered: farms created before billing existed have no subscription and
  // are never blocked.
  if (!sub) {
    return {
      status: "legacy", tier, plan, trialing: false, trialDaysLeft: 0,
      paidActive: false, canceledGrace: false, periodEndsAt: null, blocked: false, ...aiFacts,
    };
  }

  const ms = now.getTime();
  const trialEnd = sub.trialEndsAt ? Date.parse(sub.trialEndsAt) : 0;
  const periodEnd = sub.currentPeriodEnd ? Date.parse(sub.currentPeriodEnd) : 0;
  const withinPeriod = periodEnd > ms;

  const trialing = sub.status === "trialing" && trialEnd > ms;
  const trialDaysLeft = trialing ? Math.max(0, Math.ceil((trialEnd - ms) / DAY)) : 0;
  const paidActive = sub.status === "active" && (!periodEnd || withinPeriod);
  // A canceled plan runs out its paid period; a past-due one gets a short grace.
  const canceledGrace = sub.status === "canceled" && withinPeriod;
  const pastDueGrace = sub.status === "past_due" && periodEnd + PAST_DUE_GRACE_DAYS * DAY > ms;
  const blocked = !paidActive && !trialing && !canceledGrace && !pastDueGrace;

  return {
    status: sub.status, tier, plan, trialing, trialDaysLeft,
    paidActive, canceledGrace,
    periodEndsAt: sub.currentPeriodEnd ?? null,
    blocked, ...aiFacts,
  };
}

/** Is hard billing enforcement turned on? Off by default so the trial/paywall
 *  ship visible-but-non-blocking until Paymob is wired and prices are final. */
export function isBillingEnforced(): boolean {
  return process.env.NEXT_PUBLIC_BILLING_ENFORCED === "1";
}
