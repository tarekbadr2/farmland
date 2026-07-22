"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/provider";
import { useBilling } from "@/hooks/use-billing";
import { PlanPicker } from "@/components/billing/plan-picker";
import { cancelSubscription } from "@/lib/billing/checkout";
import { formatDate } from "@/lib/date";
import type { SubscriptionStatus } from "@/core/domain/types";

const STATUS_LABEL: Record<
  SubscriptionStatus | "legacy",
  { en: string; ar: string; variant: "success" | "warning" | "destructive" | "default" }
> = {
  trialing: { en: "Free trial", ar: "فترة تجريبية", variant: "warning" },
  active: { en: "Active", ar: "نشط", variant: "success" },
  past_due: { en: "Past due", ar: "متأخر", variant: "destructive" },
  canceled: { en: "Canceled", ar: "ملغى", variant: "destructive" },
  legacy: { en: "Active", ar: "نشط", variant: "success" },
};

export function BillingSettings() {
  const { locale, formatNumber } = useI18n();
  const { entitlement: e } = useBilling();
  const queryClient = useQueryClient();
  const ar = locale === "ar";
  const plan = ar ? e.plan.ar : e.plan.en;
  const status = STATUS_LABEL[e.status];

  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const usagePct = e.aiQuota > 0 ? Math.min(100, Math.round((e.aiUsed / e.aiQuota) * 100)) : 0;
  const periodDate = e.periodEndsAt ? formatDate(e.periodEndsAt, locale) : null;

  const doCancel = async (resume: boolean) => {
    setBusy(true);
    try {
      const res = await cancelSubscription(resume);
      if (!res.ok) throw new Error();
      await queryClient.invalidateQueries();
      setCancelOpen(false);
      toast.success(
        resume
          ? ar ? "تم استئناف اشتراكك." : "Your subscription is resumed."
          : ar ? "تم إلغاء الاشتراك — يبقى نشطًا حتى نهاية الفترة." : "Subscription canceled — active until the period ends.",
      );
    } catch {
      toast.error(ar ? "تعذّر تنفيذ الطلب. حاول مرة أخرى." : "Couldn't complete that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* ----------------------------- Current plan ----------------------------- */}
      <Card>
        <div className="px-5 pb-2 pt-4">
          <CardTitle>{ar ? "اشتراكك" : "Your subscription"}</CardTitle>
          <CardDescription>{ar ? "الخطة والفوترة" : "Plan & billing"}</CardDescription>
        </div>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[15px] font-semibold">{plan.name}</p>
                <p className="text-[12px] text-muted-foreground">
                  {e.trialing
                    ? ar
                      ? `متبقّي ${formatNumber(e.trialDaysLeft)} ${e.trialDaysLeft === 1 ? "يوم" : "أيام"} في التجربة`
                      : `${e.trialDaysLeft} ${e.trialDaysLeft === 1 ? "day" : "days"} left in trial`
                    : e.canceledGrace && periodDate
                      ? ar ? `ينتهي في ${periodDate}` : `Ends ${periodDate}`
                      : e.paidActive && periodDate
                        ? ar ? `يتجدّد في ${periodDate}` : `Renews ${periodDate}`
                        : plan.tagline}
                </p>
              </div>
              <Badge variant={status.variant}>{ar ? status.ar : status.en}</Badge>
            </div>
          </div>

          {/* AI usage this month */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles className="size-3.5 text-primary" />
                {ar ? "استخدام المساعد الذكي هذا الشهر" : "AI usage this month"}
              </span>
              <span className="tabular text-muted-foreground">
                {formatNumber(e.aiUsed)} / {formatNumber(e.aiQuota)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={usagePct >= 100 ? "h-full bg-destructive" : "h-full bg-primary"}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            {e.aiExhausted && (
              <p className="mt-1.5 text-[11.5px] text-destructive">
                {ar
                  ? "استُنفدت حصة هذا الشهر — رقِّ خطتك لمزيد من الأسئلة."
                  : "This month's quota is used up — upgrade for more questions."}
              </p>
            )}
          </div>

          {/* Cancel / resume */}
          {e.canceledGrace ? (
            <Button variant="outline" className="w-full" disabled={busy} onClick={() => doCancel(true)}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {ar ? "استئناف الاشتراك" : "Resume subscription"}
            </Button>
          ) : e.paidActive ? (
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setCancelOpen(true)}>
              {ar ? "إلغاء الاشتراك" : "Cancel subscription"}
            </Button>
          ) : null}

          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            <CreditCard className="me-1 inline size-3.5 align-text-bottom" />
            {ar
              ? "الدفع عبر Paymob (بطاقة أو محفظة). كل البيانات معزولة لكل مزرعة في قواعد Firestore."
              : "Payments via Paymob (card or wallet). All data is isolated per farm in Firestore rules."}
          </p>
        </CardContent>
      </Card>

      {/* ------------------------------- Plan picker ---------------------------- */}
      <Card className="lg:col-span-2">
        <div className="px-5 pb-2 pt-4">
          <CardTitle>{ar ? "الخطط" : "Plans"}</CardTitle>
          <CardDescription>
            {e.paidActive
              ? ar ? "غيّر خطتك — تُحتسب الفروق بالتناسب." : "Change your plan — the difference is prorated."
              : ar ? "اختر خطة للبدء." : "Choose a plan to get started."}
          </CardDescription>
        </div>
        <CardContent>
          <PlanPicker currentTier={e.tier} paidActive={e.paidActive} periodEndsAt={e.periodEndsAt} />
        </CardContent>
      </Card>

      {/* Cancel confirmation */}
      <Dialog open={cancelOpen} onOpenChange={(o) => !busy && setCancelOpen(o)}>
        <DialogContent showClose={!busy}>
          <DialogHeader>
            <DialogTitle>{ar ? "إلغاء الاشتراك؟" : "Cancel subscription?"}</DialogTitle>
            <DialogDescription>
              {ar
                ? `ستحتفظ بكامل الميزات حتى ${periodDate ?? "نهاية فترتك"}، وبعدها يتوقّف الوصول حتى تشترك من جديد. لن تُفقد أي بيانات.`
                : `You'll keep full access until ${periodDate ?? "the end of your period"}, after which access pauses until you subscribe again. No data is lost.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>
              {ar ? "تراجع" : "Never mind"}
            </Button>
            <Button variant="destructive" onClick={() => doCancel(false)} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {ar ? "إلغاء الاشتراك" : "Cancel subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
