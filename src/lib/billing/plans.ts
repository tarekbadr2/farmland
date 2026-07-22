/**
 * Subscription plans.
 *
 * Flat tiers by herd size, each with its own monthly AI-question quota (the AI
 * advisor runs on Claude, so usage is the real cost driver). Prices are in EGP
 * and are PLACEHOLDERS — tune them here in one place; the picker, settings, and
 * checkout all read from this table. Amounts are the monthly price in piastres
 * (EGP × 100) because Paymob — like most processors — charges in the minor unit.
 */

export type PlanTier = "starter" | "growth" | "enterprise";

export interface Plan {
  tier: PlanTier;
  /** Monthly price in piastres (EGP × 100). */
  amount: number;
  /** Max head of cattle the plan allows. */
  herdLimit: number;
  /** AI advisor questions included per calendar month. */
  aiQuota: number;
  /** Team seats included. */
  seats: number;
  en: { name: string; tagline: string };
  ar: { name: string; tagline: string };
}

export const PLANS: Record<PlanTier, Plan> = {
  starter: {
    tier: "starter",
    amount: 149_900, // EGP 1,499 / mo
    herdLimit: 200,
    aiQuota: 100,
    seats: 3,
    en: { name: "Starter", tagline: "Small herds getting organized." },
    ar: { name: "المبتدئ", tagline: "للقطعان الصغيرة التي تبدأ التنظيم." },
  },
  growth: {
    tier: "growth",
    amount: 399_900, // EGP 3,999 / mo
    herdLimit: 1_000,
    aiQuota: 500,
    seats: 10,
    en: { name: "Growth", tagline: "Scaling farms with a full team." },
    ar: { name: "النمو", tagline: "للمزارع المتوسّعة بفريق كامل." },
  },
  enterprise: {
    tier: "enterprise",
    amount: 899_900, // EGP 8,999 / mo
    herdLimit: 100_000,
    aiQuota: 2_000,
    seats: 1_000,
    en: { name: "Enterprise", tagline: "Large operations, unlimited scale." },
    ar: { name: "المؤسسات", tagline: "للعمليات الكبيرة بلا حدود." },
  },
};

export const PLAN_ORDER: PlanTier[] = ["starter", "growth", "enterprise"];

export const TRIAL_DAYS = 7;

/** Format a plan's piastre amount as a human EGP string. */
export function formatEgp(amountPiastres: number, locale: "en" | "ar"): string {
  const egp = amountPiastres / 100;
  const n = egp.toLocaleString(locale === "ar" ? "ar-EG" : "en-US");
  return locale === "ar" ? `${n} ج.م` : `EGP ${n}`;
}

export function getPlan(tier: PlanTier | undefined | null): Plan {
  return PLANS[tier ?? "starter"] ?? PLANS.starter;
}
