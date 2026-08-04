"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";
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
import {
  useAccounts,
  useFiscalYears,
  useJournalEntries,
  usePartners,
  useSaveJournalEntry,
} from "@/hooks/use-farm-data";
import {
  journalEntryFromVoucher,
  nextSequence,
  voucherNumber,
  type VoucherKind,
} from "@/core/services/posting";
import { TODAY } from "@/core/data/seed";
import { cn } from "@/lib/utils";

/**
 * سند قبض / سند صرف — a cash receipt or payment voucher.
 *
 * Money always moves between a treasury (cash box or bank) and one other
 * account, so the form asks only for those two plus an amount. It builds and
 * posts the journal entry itself, which keeps vouchers and the ledger in step
 * by construction rather than by discipline.
 */
export function VoucherDialog({ kind, trigger }: { kind: VoucherKind; trigger: React.ReactNode }) {
  const { locale, formatCurrency } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: accounts = [] } = useAccounts();
  const { data: entries = [] } = useJournalEntries();
  const { data: partners = [] } = usePartners();
  const { data: years = [] } = useFiscalYears();
  const save = useSaveJournalEntry();

  const receipt = kind === "receipt";

  // Treasuries are the cash/bank accounts and anything nested under them.
  const treasuries = React.useMemo(() => {
    const roots = accounts.filter((a) => a.systemKey === "cash" || a.systemKey === "bank");
    const rootIds = new Set(roots.map((r) => r.id));
    return accounts
      .filter((a) => !a.isGroup && (rootIds.has(a.id) || (a.parentId && rootIds.has(a.parentId))))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts]);

  // What the money was for: everything postable that isn't the treasury itself.
  const counterAccounts = React.useMemo(
    () =>
      accounts
        .filter((a) => !a.isGroup && a.active && !treasuries.some((t) => t.id === a.id))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accounts, treasuries],
  );

  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(TODAY);
  const [treasuryAccountId, setTreasury] = React.useState("");
  const [counterAccountId, setCounter] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [partnerId, setPartnerId] = React.useState("");

  React.useEffect(() => {
    if (treasuries.length && !treasuryAccountId) setTreasury(treasuries[0].id);
  }, [treasuries, treasuryAccountId]);

  const value = Number(amount) || 0;
  const openYear = years.find((y) => y.status === "open");
  const canSave = value > 0 && treasuryAccountId && counterAccountId && description.trim();

  const submit = async () => {
    if (!canSave) return;
    // Counting would re-issue the same number once the ledger read is capped.
    const seq = nextSequence(entries.map((e) => e.number), receipt ? "RV" : "PV", date.slice(0, 4));
    const number = voucherNumber(kind, date, seq);
    const built = journalEntryFromVoucher(
      { kind, date, amount: value, treasuryAccountId, counterAccountId, description: description.trim(), partnerId: partnerId || undefined },
      "", // farmId is applied by the repository
      number,
    );
    if (!built) {
      toast.error(ar ? "تحقّق من الحسابات والمبلغ." : "Check the accounts and amount.");
      return;
    }
    try {
      await save.mutateAsync({
        date: built.date,
        description: built.description,
        reference: built.reference,
        number,
        status: "posted",
        lines: built.lines,
        sourceKind: "voucher",
        fiscalYearId: openYear?.id,
      });
      toast.success(
        receipt
          ? ar ? `تم قبض ${formatCurrency(value)}.` : `Received ${formatCurrency(value)}.`
          : ar ? `تم صرف ${formatCurrency(value)}.` : `Paid ${formatCurrency(value)}.`,
      );
      setAmount("");
      setDescription("");
      setOpen(false);
    } catch (e) {
      console.error("[voucher-save]", e);
      const msg = e instanceof Error ? e.message : String(e);
      const detail = msg.slice(0, 300);
      toast.error(
        msg === "offline-needs-connection"
          ? ar
            ? "أنت غير متصل — أعد الاتصال لتسجيل هذا السند. تُحفظ بقية التغييرات دون اتصال."
            : "You're offline — reconnect to record this voucher. Everything else saves offline."
          : msg === "year-closed"
            ? ar ? "السنة المالية مغلقة." : "That fiscal year is closed."
            : ar ? `تعذّر حفظ السند: ${detail}` : `Couldn't save the voucher: ${detail}`,
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {receipt ? (ar ? "سند قبض" : "Receipt voucher") : ar ? "سند صرف" : "Payment voucher"}
          </DialogTitle>
          <DialogDescription>
            {receipt
              ? ar ? "نقدية واردة إلى الخزينة أو البنك." : "Money coming into a cash box or bank."
              : ar ? "نقدية صادرة من الخزينة أو البنك." : "Money going out of a cash box or bank."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label>{ar ? "البيان" : "Description"}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                receipt
                  ? ar ? "مثال: تحصيل من عميل" : "e.g. Collected from a customer"
                  : ar ? "مثال: سداد لمورّد" : "e.g. Paid a supplier"
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{ar ? "المبلغ" : "Amount"}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div>
              <Label>{ar ? "التاريخ" : "Date"}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>{ar ? "الخزينة / البنك" : "Cash box / bank"}</Label>
            <Select value={treasuryAccountId} onValueChange={setTreasury}>
              <SelectTrigger>
                <SelectValue placeholder={ar ? "اختر" : "Pick one"} />
              </SelectTrigger>
              <SelectContent>
                {treasuries.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} · {ar ? a.nameAr : a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{receipt ? (ar ? "مقابل (الإيراد/العميل)" : "For (income / customer)") : ar ? "مقابل (المصروف/المورّد)" : "For (expense / supplier)"}</Label>
            <Select value={counterAccountId} onValueChange={setCounter}>
              <SelectTrigger>
                <SelectValue placeholder={ar ? "اختر حسابًا" : "Pick an account"} />
              </SelectTrigger>
              <SelectContent>
                {counterAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} · {ar ? a.nameAr : a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{ar ? "الطرف (اختياري)" : "Party (optional)"}</Label>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger>
                <SelectValue placeholder={ar ? "اختر" : "Pick one"} />
              </SelectTrigger>
              <SelectContent>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {ar ? p.nameAr : p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            className={cn(
              "flex items-center justify-between rounded-lg border px-3 py-2.5",
              receipt ? "border-primary/25 bg-primary/[0.05]" : "border-destructive/25 bg-destructive/[0.05]",
            )}
          >
            <span className="flex items-center gap-1.5 text-[13px] font-medium">
              {receipt ? <ArrowDownLeft className="size-4 text-primary" /> : <ArrowUpRight className="size-4 text-destructive" />}
              {receipt ? (ar ? "وارد" : "Money in") : ar ? "صادر" : "Money out"}
            </span>
            <span className="text-[15px] font-semibold tabular-nums">{formatCurrency(value)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={!canSave || save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            {ar ? "ترحيل السند" : "Post voucher"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
