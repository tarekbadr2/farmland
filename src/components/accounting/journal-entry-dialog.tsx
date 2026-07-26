"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { useAccounts, useSaveJournalEntry, useFiscalYears } from "@/hooks/use-farm-data";
import { entryTotals } from "@/core/services/accounting";
import { TODAY } from "@/core/data/seed";
import { cn } from "@/lib/utils";
import type { JournalLine } from "@/core/domain/types";

interface DraftLine extends JournalLine {
  key: string;
}

const emptyLine = (): DraftLine => ({
  key: Math.random().toString(36).slice(2),
  accountId: "",
  debit: 0,
  credit: 0,
});

/**
 * Hand-keyed journal entry (قيد يومية). Debits and credits must match before it
 * can be saved — the footer shows the running difference so the imbalance is
 * visible while typing rather than as an error at the end.
 */
export function JournalEntryDialog({ trigger }: { trigger: React.ReactNode }) {
  const { locale, formatCurrency } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: accounts = [] } = useAccounts();
  const { data: years = [] } = useFiscalYears();
  const save = useSaveJournalEntry();

  const [date, setDate] = React.useState(TODAY);
  const [description, setDescription] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([emptyLine(), emptyLine()]);

  // You post to leaves, never to a group header.
  const postable = React.useMemo(
    () => accounts.filter((a) => !a.isGroup && a.active).sort((a, b) => a.code.localeCompare(b.code)),
    [accounts],
  );
  const openYear = years.find((y) => y.status === "open");

  const totals = entryTotals(lines);
  const canSave = totals.balanced && description.trim().length > 0 && lines.every((l) => !(l.debit || l.credit) || l.accountId);

  const patch = (key: string, next: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...next } : l)));

  const reset = () => {
    setDate(TODAY);
    setDescription("");
    setReference("");
    setLines([emptyLine(), emptyLine()]);
  };

  const submit = async (status: "draft" | "posted") => {
    const clean = lines
      .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0))
      .map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description, partnerId: l.partnerId, animalId: l.animalId }));
    try {
      await save.mutateAsync({
        date,
        description: description.trim(),
        reference: reference.trim() || undefined,
        fiscalYearId: openYear?.id,
        status,
        lines: clean,
        sourceKind: "manual",
      });
      toast.success(
        status === "posted"
          ? ar ? "تم ترحيل القيد." : "Entry posted to the ledger."
          : ar ? "تم حفظ المسودة." : "Draft saved.",
      );
      reset();
      setOpen(false);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      const detail = (e as { code?: string })?.code || code || "";
      toast.error(
        code === "year-closed"
          ? ar ? "السنة المالية مغلقة." : "That fiscal year is closed."
          : code === "unbalanced"
            ? ar ? "القيد غير متوازن." : "The entry doesn't balance."
            : ar ? `تعذّر الحفظ: ${detail}` : `Couldn't save that: ${detail}`,
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{ar ? "قيد يومية جديد" : "New journal entry"}</DialogTitle>
          <DialogDescription>
            {ar
              ? "يجب أن يتساوى إجمالي المدين مع إجمالي الدائن."
              : "Total debits must equal total credits."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>{ar ? "التاريخ" : "Date"}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>{ar ? "البيان" : "Description"}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={ar ? "مثال: سداد فاتورة أعلاف" : "e.g. Paid feed supplier invoice"}
            />
          </div>
        </div>

        <div className="mt-1">
          <Label>{ar ? "المرجع (اختياري)" : "Reference (optional)"}</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>

        {/* ------------------------------- Lines -------------------------------- */}
        <div className="mt-3 max-h-[38vh] overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-muted/60 text-[12px] text-muted-foreground">
              <tr>
                <th className="p-2 text-start font-medium">{ar ? "الحساب" : "Account"}</th>
                <th className="w-32 p-2 text-end font-medium">{ar ? "مدين" : "Debit"}</th>
                <th className="w-32 p-2 text-end font-medium">{ar ? "دائن" : "Credit"}</th>
                <th className="w-10 p-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className="border-t border-border/70">
                  <td className="p-1.5">
                    <Select
                      value={line.accountId}
                      onValueChange={(v) => patch(line.key, { accountId: v })}
                    >
                      <SelectTrigger className="h-8 text-[12.5px]">
                        <SelectValue placeholder={ar ? "اختر حسابًا" : "Pick an account"} />
                      </SelectTrigger>
                      <SelectContent>
                        {postable.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} · {ar ? a.nameAr : a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-8 text-end text-[12.5px]"
                      value={line.debit || ""}
                      // A line lives on one side only — typing a debit clears the credit.
                      onChange={(e) =>
                        patch(line.key, { debit: Number(e.target.value) || 0, credit: 0 })
                      }
                    />
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-8 text-end text-[12.5px]"
                      value={line.credit || ""}
                      onChange={(e) =>
                        patch(line.key, { credit: Number(e.target.value) || 0, debit: 0 })
                      }
                    />
                  </td>
                  <td className="p-1.5 text-center">
                    <button
                      onClick={() => setLines((ls) => (ls.length > 2 ? ls.filter((l) => l.key !== line.key) : ls))}
                      className="text-muted-foreground transition hover:text-destructive disabled:opacity-30"
                      disabled={lines.length <= 2}
                      aria-label={ar ? "حذف السطر" : "Remove line"}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus /> {ar ? "سطر" : "Add line"}
          </Button>

          <div className="flex items-center gap-4 text-[12.5px]">
            <span className="text-muted-foreground">
              {ar ? "مدين" : "Debit"}{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {formatCurrency(totals.debit)}
              </span>
            </span>
            <span className="text-muted-foreground">
              {ar ? "دائن" : "Credit"}{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {formatCurrency(totals.credit)}
              </span>
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-medium",
                totals.balanced
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {totals.balanced
                ? ar ? "متوازن" : "Balanced"
                : `${ar ? "الفرق" : "Off by"} ${formatCurrency(Math.abs(totals.difference))}`}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => submit("draft")} disabled={save.isPending || !description.trim()}>
            {ar ? "حفظ كمسودة" : "Save draft"}
          </Button>
          <Button onClick={() => submit("posted")} disabled={!canSave || save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            {ar ? "ترحيل" : "Post entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
