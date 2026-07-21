"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/provider";
import { useInvoices, usePartners } from "@/hooks/use-farm-data";
import { getRepository, invoiceTotal } from "@/core/repositories";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/core/domain/types";

const STATUS_TONE: Record<Invoice["status"], string> = {
  draft: "text-muted-foreground border-border",
  sent: "text-blue-600 dark:text-blue-400 border-blue-500/40 bg-blue-500/10",
  partial: "text-amber-600 dark:text-amber-400 border-[var(--warning)]/40 bg-[var(--warning)]/10",
  paid: "text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  overdue: "text-destructive border-destructive/40 bg-destructive/10",
};

/** Newest first, and unpaid before settled — the ones needing action float up. */
function order(a: Invoice, b: Invoice) {
  const rank = (i: Invoice) => (i.status === "paid" ? 1 : 0);
  return rank(a) - rank(b) || b.issuedAt.localeCompare(a.issuedAt);
}

export function InvoicesCard() {
  const { t, ln, locale, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const { data: invoices = [] } = useInvoices();
  const { data: partners = [] } = usePartners();

  const customerName = (id: string) => {
    const p = partners.find((x) => x.id === id);
    return p ? ln(p) : id;
  };

  const markSent = useMutation({
    mutationFn: (id: string) => getRepository().setInvoiceStatus(id, "sent"),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(locale === "ar" ? "تم تحديدها كمُرسَلة" : "Marked as sent");
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = [...invoices].sort(order).slice(0, 12);

  return (
    <Card>
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <CardTitle>{t("partners.invoices")}</CardTitle>
        <Badge variant="outline">{formatNumber(invoices.length)}</Badge>
      </div>
      <CardContent className="space-y-1.5">
        {rows.map((inv) => {
          const total = invoiceTotal(inv);
          const outstanding = total - (inv.paidAmount ?? 0);
          return (
            <div
              key={inv.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border/70 p-3 sm:flex-nowrap"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13px] font-medium">
                  <span className="tabular">{inv.number}</span>
                  <Badge
                    variant="outline"
                    className={cn("h-5 px-1.5 text-[10.5px] capitalize", STATUS_TONE[inv.status])}
                  >
                    {t(`partners.${inv.status}`)}
                  </Badge>
                </p>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  {customerName(inv.customerId)} · {formatDate(inv.issuedAt, locale)}
                </p>
              </div>

              <div className="text-end">
                <p className="tabular text-[13px] font-semibold">EGP {formatNumber(total)}</p>
                {inv.status === "partial" && (
                  <p className="tabular text-[10.5px] text-[var(--warning)]">
                    {t("partners.outstandingAmt")} {formatNumber(outstanding)}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-1.5">
                {inv.status === "draft" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={markSent.isPending}
                    onClick={() => markSent.mutate(inv.id)}
                  >
                    <Send className="size-3.5" /> {t("partners.markSent")}
                  </Button>
                )}
                {inv.status !== "paid" && inv.status !== "draft" && (
                  <RecordPaymentDialog
                    invoice={inv}
                    trigger={
                      <Button size="sm">
                        <Wallet className="size-3.5" /> {t("partners.recordPayment")}
                      </Button>
                    }
                  />
                )}
              </div>
            </div>
          );
        })}
        {!rows.length && (
          <p className="py-8 text-center text-[12px] text-muted-foreground">
            {t("partners.noInvoices")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
