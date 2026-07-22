"use client";

import Link from "next/link";
import { Clock, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { useBilling } from "@/hooks/use-billing";

/**
 * Slim trial / lapsed-subscription strip under the topbar. Shows the trial
 * countdown while it runs, and a "choose a plan" nudge once it lapses (when hard
 * enforcement is off — otherwise the paywall has already taken over).
 */
export function TrialBanner() {
  const { locale } = useI18n();
  const { bypassed } = useAuth();
  const { entitlement } = useBilling();
  const ar = locale === "ar";

  if (bypassed) return null;

  const trialing = entitlement.trialing;
  const lapsed = entitlement.blocked; // trial ended / canceled, enforcement off
  if (!trialing && !lapsed) return null;

  const days = entitlement.trialDaysLeft;
  const daysLabel = ar
    ? `${days.toLocaleString("ar-EG")} ${days === 1 ? "يوم" : "أيام"}`
    : `${days} ${days === 1 ? "day" : "days"}`;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/25 bg-amber-500/[0.08] px-4 py-2 sm:px-6"
      dir={ar ? "rtl" : "ltr"}
    >
      {trialing ? (
        <Clock className="size-4 shrink-0 text-amber-600 dark:text-amber-500" />
      ) : (
        <Sparkles className="size-4 shrink-0 text-amber-600 dark:text-amber-500" />
      )}
      <p className="text-[13px] font-medium">
        {trialing
          ? ar
            ? `متبقّي ${daysLabel} في فترتك التجريبية`
            : `${daysLabel} left in your free trial`
          : ar
            ? "انتهت فترتك التجريبية"
            : "Your free trial has ended"}
        <span className="ms-2 font-normal text-muted-foreground">
          {ar ? "— اختر خطة للاحتفاظ بكامل الميزات." : "— choose a plan to keep full access."}
        </span>
      </p>
      <Button asChild variant="outline" size="sm" className="ms-auto">
        <Link href="/settings#billing">{ar ? "عرض الخطط" : "View plans"}</Link>
      </Button>
    </div>
  );
}
