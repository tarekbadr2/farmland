"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import { PLANS, PLAN_ORDER, getPlan, formatEgp, type PlanTier } from "@/lib/billing/plans";
import { changeKind, proratedCharge } from "@/lib/billing/proration";
import { startCheckout } from "@/lib/billing/checkout";

/**
 * Plan picker — the three tiers side by side.
 *
 * Shared by the paywall and the settings billing card. Choosing a plan starts a
 * Paymob checkout; until Paymob is configured the server replies "not configured"
 * and we surface an honest "coming soon" note. When the farm is already on a paid
 * plan, switching shows the prorated amount due today, and a credit-covered
 * downgrade applies immediately with no payment.
 */
export function PlanPicker({
  currentTier,
  highlight = "pro",
  paidActive = false,
  periodEndsAt = null,
}: {
  currentTier?: PlanTier;
  highlight?: PlanTier;
  /** True when on an active paid plan — enables proration + change labels. */
  paidActive?: boolean;
  periodEndsAt?: string | null;
}) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState<PlanTier | null>(null);

  const choose = async (tier: PlanTier) => {
    setPending(tier);
    try {
      const res = await startCheckout(tier);
      if (res.applied) {
        await queryClient.invalidateQueries();
        toast.success(ar ? "تم تغيير خطتك." : "Your plan has been changed.");
        return;
      }
      if (res.configured && res.url) {
        window.location.href = res.url;
        return;
      }
      if (!res.configured) {
        toast.info(
          ar
            ? "الدفع عبر Paymob قيد الإعداد وسيتاح قريبًا. تواصل معنا لتفعيل اشتراكك."
            : "Paymob payments are being set up and will be available soon. Contact us to activate your subscription.",
        );
      } else {
        toast.error(ar ? "تعذّر بدء الدفع. حاول مرة أخرى." : "Couldn't start checkout. Try again.");
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" dir={ar ? "rtl" : "ltr"}>
      {PLAN_ORDER.map((tier) => {
        const plan = PLANS[tier];
        const meta = ar ? plan.ar : plan.en;
        const isCurrent = currentTier === tier;
        const featured = tier === highlight;
        const nf = (n: number) => n.toLocaleString(ar ? "ar-EG" : "en-US");

        // Proration preview when switching from an active paid plan.
        const kind = paidActive && currentTier ? changeKind(currentTier, tier) : "new";
        const due =
          paidActive && currentTier && !isCurrent
            ? proratedCharge(getPlan(currentTier), plan, periodEndsAt)
            : null;

        return (
          <Card key={tier} className={cnFeatured(featured)}>
            {featured && (
              <div className="absolute -top-2.5 start-4 flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                <Sparkles className="size-3" />
                {ar ? "الأكثر شيوعًا" : "Most popular"}
              </div>
            )}
            <div className="p-5">
              <p className="text-[15px] font-semibold">{meta.name}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{meta.tagline}</p>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-lg font-semibold tracking-tight tabular-nums">
                  {formatEgp(plan.amount, ar ? "ar" : "en")}
                </span>
                <span className="text-[12px] text-muted-foreground">{ar ? "/ شهر" : "/ mo"}</span>
              </div>

              {/* Prorated amount due today when changing plans */}
              {due !== null && (
                <p className="mt-1 text-[11.5px] font-medium text-primary">
                  {due === 0
                    ? ar
                      ? "بدون رسوم — مغطّى برصيدك"
                      : "No charge — covered by credit"
                    : ar
                      ? `≈ ${formatEgp(due, "ar")} مستحقّة اليوم`
                      : `≈ ${formatEgp(due, "en")} due today`}
                </p>
              )}

              <ul className="mt-4 space-y-2 text-[13px]">
                <Feature>{ar ? `حتى ${nf(plan.herdLimit)} رأس` : `Up to ${nf(plan.herdLimit)} head`}</Feature>
                <Feature>{ar ? `${nf(plan.aiQuota)} سؤال للمساعد الذكي / شهر` : `${nf(plan.aiQuota)} AI questions / mo`}</Feature>
                <Feature>{ar ? `${nf(plan.seats)} مقعد للفريق` : `${nf(plan.seats)} team seats`}</Feature>
              </ul>

              <Button
                className="mt-5 w-full"
                variant={featured ? "default" : "outline"}
                disabled={isCurrent || pending !== null}
                onClick={() => choose(tier)}
              >
                {pending === tier ? <Loader2 className="animate-spin" /> : null}
                {kind === "upgrade" && pending !== tier ? <ArrowUp className="size-4" /> : null}
                {kind === "downgrade" && pending !== tier ? <ArrowDown className="size-4" /> : null}
                {isCurrent
                  ? ar ? "خطتك الحالية" : "Current plan"
                  : kind === "upgrade"
                    ? ar ? "ترقية" : "Upgrade"
                    : kind === "downgrade"
                      ? ar ? "تخفيض" : "Downgrade"
                      : ar ? "اختر هذه الخطة" : "Choose plan"}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}

function cnFeatured(featured: boolean): string {
  return featured
    ? "relative overflow-visible border-primary/40 ring-1 ring-primary/25"
    : "relative overflow-visible";
}
