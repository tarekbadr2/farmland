/**
 * Subscription plans.
 *
 * Flat tiers by herd size, each with its own monthly AI-question quota (the AI
 * advisor runs on Claude, so usage is the real cost driver). Prices are in EGP
 * and are PLACEHOLDERS — tune them here in one place; the picker, settings, and
 * checkout all read from this table. Amounts are the monthly price in piastres
 * (EGP × 100) because Paymob — like most processors — charges in the minor unit.
 */

export type PlanTier = "starter" | "growth" | "pro" | "enterprise" | "scale";

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
    amount: 150_000, // EGP 1,500 / mo
    herdLimit: 500,
    aiQuota: 100,
    seats: 3,
    en: { name: "Starter", tagline: "Small herds getting organized." },
    ar: { name: "المبتدئ", tagline: "للقطعان الصغيرة التي تبدأ التنظيم." },
  },
  growth: {
    tier: "growth",
    amount: 400_000, // EGP 4,000 / mo
    herdLimit: 2_500,
    aiQuota: 300,
    seats: 10,
    en: { name: "Growth", tagline: "Growing farms with a full team." },
    ar: { name: "النمو", tagline: "للمزارع المتنامية بفريق كامل." },
  },
  pro: {
    tier: "pro",
    amount: 700_000, // EGP 7,000 / mo
    herdLimit: 5_000,
    aiQuota: 700,
    seats: 25,
    en: { name: "Professional", tagline: "Serious multi-pen operations." },
    ar: { name: "احترافي", tagline: "لعمليات متعددة الحظائر." },
  },
  enterprise: {
    tier: "enterprise",
    amount: 1_500_000, // EGP 15,000 / mo
    herdLimit: 15_000,
    aiQuota: 2_000,
    seats: 100,
    en: { name: "Enterprise", tagline: "Large operations, many sites." },
    ar: { name: "المؤسسات", tagline: "للعمليات الكبيرة متعددة المواقع." },
  },
  scale: {
    tier: "scale",
    amount: 4_000_000, // EGP 40,000 / mo
    herdLimit: 50_000,
    aiQuota: 6_000,
    seats: 1_000,
    en: { name: "Scale", tagline: "Nationwide herds at full scale." },
    ar: { name: "التوسّع", tagline: "لأكبر القطعان على مستوى وطني." },
  },
};

export const PLAN_ORDER: PlanTier[] = ["starter", "growth", "pro", "enterprise", "scale"];

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
