"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import { useTransactions, useRetryFailedPostings } from "@/hooks/use-farm-data";

/**
 * Unposted-transaction alert.
 *
 * When a transaction saves but its ledger entry fails to write, the repository
 * flags it `postingFailed` so the money row survives — but until now nothing
 * read that flag, so the general ledger could drift from the cash records with
 * no indication. This surfaces the count on the accounting and finance screens
 * and offers a one-click re-post (idempotent — posting is keyed on the
 * transaction id). Renders nothing when everything is posted.
 */
export function UnpostedBanner() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const { data: txns } = useTransactions();
  const retry = useRetryFailedPostings();

  const count = React.useMemo(
    () => (txns ?? []).filter((t) => t.postingFailed).length,
    [txns],
  );

  if (count === 0) return null;

  const onRetry = () =>
    retry.mutate(undefined, {
      onSuccess: (n) =>
        toast.success(
          ar
            ? `تمت إعادة ترحيل ${n.toLocaleString("ar-EG")} حركة إلى دفتر الأستاذ.`
            : `Re-posted ${n} transaction${n === 1 ? "" : "s"} to the ledger.`,
        ),
      onError: () =>
        toast.error(ar ? "تعذّرت إعادة الترحيل — حاول مجددًا." : "Re-posting failed — try again."),
    });

  const countLabel = ar ? count.toLocaleString("ar-EG") : String(count);

  return (
    <div
      role="alert"
      dir={ar ? "rtl" : "ltr"}
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-destructive/30 bg-destructive/[0.07] px-4 py-3"
    >
      <AlertTriangle className="size-4 shrink-0 text-destructive" />
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium">
          {ar
            ? `${countLabel} حركة لم تُرحَّل إلى دفتر الأستاذ`
            : `${countLabel} transaction${count === 1 ? "" : "s"} not posted to the ledger`}
        </p>
        <p className="text-[12px] text-muted-foreground">
          {ar
            ? "الحركات محفوظة لكن القيود المحاسبية لم تُكتب — قد لا يتطابق ميزان المراجعة حتى إعادة الترحيل."
            : "The transactions are saved, but their journal entries weren't written — the trial balance may not reconcile until they're re-posted."}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="ms-auto"
        onClick={onRetry}
        disabled={retry.isPending}
      >
        {retry.isPending
          ? ar
            ? "جارٍ إعادة الترحيل…"
            : "Re-posting…"
          : ar
            ? "إعادة الترحيل"
            : "Re-post now"}
      </Button>
    </div>
  );
}
