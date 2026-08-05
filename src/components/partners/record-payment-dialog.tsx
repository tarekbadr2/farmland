"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import { getRepository } from "@/core/repositories";
import { invoiceTotal } from "@/core/repositories";
import { TODAY } from "@/core/data/seed";
import { round } from "@/lib/utils";
import type { Invoice } from "@/core/domain/types";

/**
 * Records a payment against one invoice.
 *
 * Defaults to the full outstanding balance — the common case is "they paid the
 * bill" — but accepts a partial. The amount is capped at what's owed, because an
 * invoice can't be more than paid, and posting the income is the repository's
 * job so this dialog can't forget to.
 */
export function RecordPaymentDialog({
  invoice,
  trigger,
}: {
  invoice: Invoice;
  trigger: React.ReactNode;
}) {
  const { t, locale, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const total = invoiceTotal(invoice);
  const outstanding = round(total - (invoice.paidAmount ?? 0), 2);

  const [amount, setAmount] = React.useState(String(outstanding));
  const [method, setMethod] = React.useState<"cash" | "bank" | "credit">("bank");

  React.useEffect(() => {
    if (open) setAmount(String(outstanding));
  }, [open, outstanding]);

  const numeric = Math.min(Number(amount) || 0, outstanding);

  const pay = useMutation({
    mutationFn: () =>
      getRepository().recordInvoicePayment({
        invoiceId: invoice.id,
        amount: numeric,
        date: TODAY,
        paymentMethod: method,
      }),
    onSuccess: () => {
      // Payment touches invoices, transactions and partner balances.
      queryClient.invalidateQueries();
      toast.success(
        numeric >= outstanding
          ? locale === "ar"
            ? `تم سداد الفاتورة ${invoice.number}`
            : `Invoice ${invoice.number} settled`
          : locale === "ar"
            ? `تم تسجيل ${formatNumber(numeric)}`
            : `Recorded ${formatNumber(numeric)}`,
      );
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("partners.recordPayment")}</DialogTitle>
          <DialogDescription>
            {invoice.number} · {t("partners.outstandingAmt")} EGP {formatNumber(outstanding)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">{t("partners.amountReceived")}</Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-method">{t("finance.paymentMethod")}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger id="payment-method" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["cash", "bank", "credit"] as const).map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`finance.method.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {numeric >= outstanding && outstanding > 0 && (
            <p className="rounded-lg bg-[color-mix(in_oklab,var(--success)_12%,transparent)] px-3 py-2 text-[11.5px] text-[var(--success)]">
              {t("partners.fullyPaid")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={numeric <= 0 || pay.isPending} onClick={() => pay.mutate()}>
            {pay.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            {t("partners.recordPayment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
