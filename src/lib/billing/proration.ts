/**
 * Proration for mid-cycle plan changes.
 *
 * When a paying farm switches plans partway through its 30-day period, we credit
 * the unused value of the current plan against the new plan's price and charge
 * the difference today; the period then resets to a fresh 30 days on payment.
 * A downgrade whose credit covers the new plan costs nothing and is applied at
 * once. All amounts are in piastres (EGP × 100). Pure — no I/O.
 */

import { PLAN_ORDER, type Plan, type PlanTier } from "./plans";

export type ChangeKind = "new" | "upgrade" | "downgrade" | "same";

const DAY = 86_400_000;
const PERIOD_DAYS = 30;

export function changeKind(current: PlanTier | null | undefined, next: PlanTier): ChangeKind {
  if (!current) return "new";
  if (current === next) return "same";
  return PLAN_ORDER.indexOf(next) > PLAN_ORDER.indexOf(current) ? "upgrade" : "downgrade";
}

/** Unused value (piastres) left on the current plan for the days remaining. */
export function unusedCredit(
  currentPlan: Plan,
  periodEndISO: string | null | undefined,
  now = new Date(),
): number {
  if (!periodEndISO) return 0;
  const msLeft = Date.parse(periodEndISO) - now.getTime();
  if (msLeft <= 0) return 0;
  const daysLeft = Math.min(PERIOD_DAYS, msLeft / DAY);
  return Math.round((currentPlan.amount / PERIOD_DAYS) * daysLeft);
}

/** Amount (piastres) to charge today to switch to `nextPlan`, crediting unused
 *  time on the current plan. Zero when the credit covers the new plan. */
export function proratedCharge(
  currentPlan: Plan,
  nextPlan: Plan,
  periodEndISO: string | null | undefined,
  now = new Date(),
): number {
  return Math.max(0, nextPlan.amount - unusedCredit(currentPlan, periodEndISO, now));
}
