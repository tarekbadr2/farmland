"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
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
import { useAccounts, usePartners, useSaveCheque, useSetChequeStatus } from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import { addDays } from "@/lib/date";
import type { Cheque, ChequeKind } from "@/core/domain/types";

/**
 * Record a cheque — one taken from a customer (ورقة قبض) or written to a
 * supplier (ورقة دفع). Saving posts the entry that moves the debt into notes,
 * so the register and the ledger start out agreeing.
 */
export function ChequeDialog({ kind, trigger }: { kind: ChequeKind; trigger: React.ReactNode }) {
  const { locale, formatCurrency } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: partners = [] } = usePartners();
  const save = useSaveCheque();
  const receivable = kind === "receivable";

  const [chequeNo, setChequeNo] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [issuedDate, setIssued] = React.useState(TODAY);
  const [dueDate, setDue] = React.useState(addDays(TODAY, 30));
  const [partnerId, setPartnerId] = React.useState("");
  const [bankName, setBank] = React.useState("");

  const value = Number(amount) || 0;
  const canSave = chequeNo.trim() && value > 0 && dueDate;

  const submit = async () => {
    if (!canSave) return;
    try {
      await save.mutateAsync({
        kind,
        chequeNumber: chequeNo.trim(),
        amount: value,
        issuedDate,
        dueDate,
        partnerId: partnerId || undefined,
        bankName: bankName.trim() || undefined,
        status: "held",
      });
      toast.success(
        receivable
          ? ar ? "تم تسجيل ورقة القبض." : "Cheque recorded."
          : ar ? "تم تسجيل ورقة الدفع." : "Cheque recorded.",
      );
      setChequeNo("");
      setAmount("");
      setOpen(false);
    } catch (e) {
      const detail = (e as { code?: string })?.code || (e as Error)?.message || "";
      toast.error(ar ? `تعذّر تسجيل الشيك: ${detail}` : `Couldn't record that cheque: ${detail}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {receivable ? (ar ? "ورقة قبض" : "Cheque received") : ar ? "ورقة دفع" : "Cheque issued"}
          </DialogTitle>
          <DialogDescription>
            {receivable
              ? ar
                ? "شيك من عميل — يُحوَّل الدين إلى أوراق قبض حتى التحصيل."
                : "A customer's cheque — their debt becomes a note until it clears."
              : ar
                ? "شيك صادر لمورّد — يُحوَّل الالتزام إلى أوراق دفع حتى السداد."
                : "A cheque you wrote — the debt becomes a note until it's paid."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{ar ? "رقم الشيك" : "Cheque number"}</Label>
              <Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} className="tabular-nums" />
            </div>
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
              <Label>{ar ? "تاريخ التحرير" : "Issued"}</Label>
              <Input type="date" value={issuedDate} onChange={(e) => setIssued(e.target.value)} />
            </div>
            <div>
              <Label>{ar ? "تاريخ الاستحقاق" : "Due date"}</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>{receivable ? (ar ? "العميل" : "Customer") : ar ? "المورّد" : "Supplier"}</Label>
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

          <div>
            <Label>{ar ? "البنك (اختياري)" : "Bank (optional)"}</Label>
            <Input value={bankName} onChange={(e) => setBank(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <span className="text-[13px] font-medium">{ar ? "القيمة" : "Face value"}</span>
            <span className="text-[15px] font-semibold tabular-nums">{formatCurrency(value)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={!canSave || save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            {ar ? "تسجيل" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Settle a held cheque: collect it into a treasury, or mark it returned unpaid.
 * Collecting asks where the money landed, because that's the one thing the
 * ledger can't infer.
 */
export function ChequeSettleDialog({
  cheque,
  mode,
  trigger,
}: {
  cheque: Cheque;
  mode: "collect" | "bounce";
  trigger: React.ReactNode;
}) {
  const { locale, formatCurrency } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: accounts = [] } = useAccounts();
  const setStatus = useSetChequeStatus();
  const collecting = mode === "collect";

  const treasuries = React.useMemo(() => {
    const roots = accounts.filter((a) => a.systemKey === "cash" || a.systemKey === "bank");
    const rootIds = new Set(roots.map((r) => r.id));
    return accounts
      .filter((a) => !a.isGroup && (rootIds.has(a.id) || (a.parentId && rootIds.has(a.parentId))))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts]);

  const [treasuryAccountId, setTreasury] = React.useState("");
  const [date, setDate] = React.useState(TODAY);

  React.useEffect(() => {
    if (treasuries.length && !treasuryAccountId) setTreasury(treasuries[0].id);
  }, [treasuries, treasuryAccountId]);

  const submit = async () => {
    try {
      await setStatus.mutateAsync({
        id: cheque.id,
        status: collecting ? "collected" : "bounced",
        treasuryAccountId: collecting ? treasuryAccountId : undefined,
        date,
      });
      toast.success(
        collecting
          ? ar ? "تم تحصيل الشيك." : "Cheque collected."
          : ar ? "تم رد الشيك — عاد الدين على الطرف." : "Cheque returned — the debt is back on the party.",
      );
      setOpen(false);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      toast.error(
        code === "already-settled"
          ? ar ? "هذا الشيك مسوّى بالفعل." : "That cheque is already settled."
          : ar ? "تعذّر تنفيذ الطلب." : "Couldn't complete that.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !setStatus.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {collecting
              ? ar ? "تحصيل الشيك" : "Collect cheque"
              : ar ? "رد الشيك" : "Return cheque unpaid"}
          </DialogTitle>
          <DialogDescription>
            {cheque.chequeNumber} · {formatCurrency(cheque.amount)}
            {" — "}
            {collecting
              ? ar ? "تتحوّل الورقة إلى نقدية." : "The note becomes money."
              : ar ? "يعود الدين إلى الطرف الأصلي." : "The debt returns to the original party."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {collecting && (
            <div>
              <Label>{ar ? "إلى الخزينة / البنك" : "Into cash box / bank"}</Label>
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
          )}
          <div>
            <Label>{ar ? "التاريخ" : "Date"}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={setStatus.isPending}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            variant={collecting ? "default" : "destructive"}
            onClick={submit}
            disabled={setStatus.isPending || (collecting && !treasuryAccountId)}
          >
            {setStatus.isPending ? <Loader2 className="animate-spin" /> : null}
            {collecting ? (ar ? "تحصيل" : "Collect") : ar ? "رد" : "Return unpaid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
