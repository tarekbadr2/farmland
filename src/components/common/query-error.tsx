"use client";

import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Full-panel read-error state for aggregate/KPI screens.
 *
 * These pages compute their cards and charts from query data that defaults to
 * empty — so on a failed read they would paint "0 animals, EGP 0", which on a
 * system of record reads as catastrophic data loss. Gate the page body on the
 * queries' combined error flag and render this instead: it says plainly that the
 * load failed (this is NOT an empty farm) and offers a retry. Mirrors the
 * DataTable error state so list and dashboard screens fail the same way.
 */
export function QueryErrorState({ onRetry }: { onRetry?: () => void }) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  return (
    <div
      role="alert"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <TriangleAlert className="size-6" />
      </span>
      <p className="text-[15px] font-medium">
        {ar ? "تعذّر تحميل البيانات" : "Couldn't load this data"}
      </p>
      <p className="max-w-sm text-[13px] text-muted-foreground">
        {ar
          ? "هذه ليست بيانات فارغة — فشل التحميل. تحقّق من الاتصال وأعد المحاولة."
          : "This isn't empty data — the load failed. Check your connection and retry."}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          {ar ? "إعادة المحاولة" : "Retry"}
        </Button>
      )}
    </div>
  );
}
