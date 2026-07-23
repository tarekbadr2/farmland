"use client";

import * as React from "react";
import { FileSpreadsheet } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import { useAccounts, useJournalEntries } from "@/hooks/use-farm-data";
import { partnerStatement } from "@/core/services/accounting";
import { downloadTableXlsx } from "@/lib/export";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Partner } from "@/core/domain/types";

/**
 * كشف حساب — one party's receivable/payable movements in date order.
 *
 * Reads straight from the ledger rather than a separate balances table, so the
 * statement can never disagree with the books. Positive means they owe the
 * farm; negative means the farm owes them.
 */
export function PartnerStatementDialog({
  partner,
  trigger,
}: {
  partner: Partner;
  trigger: React.ReactNode;
}) {
  const { locale, formatCurrency } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: accounts = [] } = useAccounts();
  const { data: entries = [] } = useJournalEntries();

  const { rows, closing } = React.useMemo(
    () => (open ? partnerStatement(partner.id, accounts, entries) : { rows: [], closing: 0 }),
    [open, partner.id, accounts, entries],
  );

  const name = ar ? partner.nameAr : partner.name;
  const owesUs = closing > 0;

  const exportStatement = () => {
    downloadTableXlsx(
      `statement-${partner.id}`,
      `${ar ? "كشف حساب" : "Statement"} — ${name}`,
      rows.map((r) => ({
        [ar ? "التاريخ" : "Date"]: r.entry.date,
        [ar ? "رقم القيد" : "Entry"]: r.entry.number,
        [ar ? "البيان" : "Description"]: r.entry.description,
        [ar ? "مدين" : "Debit"]: r.debit || "",
        [ar ? "دائن" : "Credit"]: r.credit || "",
        [ar ? "الرصيد" : "Balance"]: r.running,
      })),
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {ar ? "كشف حساب" : "Statement"} — {name}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? "حركة الحساب من دفتر اليومية."
              : "Account movements straight from the journal."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-muted/60 text-[11.5px] text-muted-foreground">
              <tr>
                <th className="p-2 text-start font-medium">{ar ? "التاريخ" : "Date"}</th>
                <th className="p-2 text-start font-medium">{ar ? "البيان" : "Description"}</th>
                <th className="w-24 p-2 text-end font-medium">{ar ? "مدين" : "Debit"}</th>
                <th className="w-24 p-2 text-end font-medium">{ar ? "دائن" : "Credit"}</th>
                <th className="w-28 p-2 text-end font-medium">{ar ? "الرصيد" : "Balance"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.entry.id}_${i}`} className="border-t border-border/60">
                  <td className="p-2 whitespace-nowrap text-muted-foreground">
                    {formatDate(r.entry.date, locale)}
                  </td>
                  <td className="p-2">
                    <span className="block truncate">{r.entry.description}</span>
                    <span className="text-[10.5px] text-muted-foreground">{r.entry.number}</span>
                  </td>
                  <td className="p-2 text-end tabular-nums">{r.debit ? formatCurrency(r.debit) : "—"}</td>
                  <td className="p-2 text-end tabular-nums">{r.credit ? formatCurrency(r.credit) : "—"}</td>
                  <td className="p-2 text-end font-medium tabular-nums">{formatCurrency(r.running)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    {ar ? "لا توجد حركة." : "No movement on this account."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={exportStatement} disabled={!rows.length}>
            <FileSpreadsheet /> {ar ? "تصدير Excel" : "Export Excel"}
          </Button>
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-muted-foreground">
              {owesUs ? (ar ? "مستحق لنا" : "Owed to the farm") : ar ? "مستحق عليها" : "Owed by the farm"}
            </span>
            <span className={cn("text-[15px] font-semibold tabular-nums", !owesUs && "text-destructive")}>
              {formatCurrency(Math.abs(closing))}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
