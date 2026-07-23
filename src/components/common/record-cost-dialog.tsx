"use client";

import * as React from "react";
import { Loader2, Receipt } from "lucide-react";
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
import { usePartners, useRecordCost } from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import type { ID, Transaction, TxnCategory } from "@/core/domain/types";

/**
 * Records a non-stock cost — machine maintenance, transport, wages, rent.
 *
 * The caller fixes the category, so the person filling it in never has to know
 * which expense account it lands in. Saving books the expense and posts the
 * journal entry in one go.
 */
export function RecordCostDialog({
  category,
  title,
  trigger,
  assetId,
  employeeId,
  animalId,
  defaultDescription = "",
  defaultAmount,
}: {
  category: TxnCategory;
  title: string;
  trigger: React.ReactNode;
  assetId?: ID;
  employeeId?: ID;
  animalId?: ID;
  defaultDescription?: string;
  defaultAmount?: number;
}) {
  const { locale, formatCurrency } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: partners = [] } = usePartners();
  const record = useRecordCost();

  const [amount, setAmount] = React.useState(defaultAmount ? String(defaultAmount) : "");
  const [date, setDate] = React.useState(TODAY);
  const [description, setDescription] = React.useState(defaultDescription);
  const [partnerId, setPartnerId] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<Transaction["paymentMethod"]>("cash");

  React.useEffect(() => {
    if (!open) return;
    setAmount(defaultAmount ? String(defaultAmount) : "");
    setDescription(defaultDescription);
  }, [open, defaultAmount, defaultDescription]);

  const value = Number(amount) || 0;

  const submit = async () => {
    if (value <= 0 || !description.trim()) return;
    try {
      await record.mutateAsync({
        category,
        amount: value,
        date,
        description: description.trim(),
        paymentMethod,
        assetId,
        employeeId,
        animalId,
        partnerId: partnerId || undefined,
      });
      toast.success(
        ar
          ? `تم تسجيل ${formatCurrency(value)} في المصروفات.`
          : `${formatCurrency(value)} booked to expenses.`,
      );
      setOpen(false);
    } catch {
      toast.error(ar ? "تعذّر تسجيل التكلفة." : "Couldn't record that cost.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !record.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {ar
              ? "يُسجَّل في المصروفات ويُرحَّل إلى دفتر اليومية تلقائيًا."
              : "Booked to expenses and posted to the ledger automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label>{ar ? "البيان" : "Description"}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
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
            <div>
              <Label>{ar ? "طريقة الدفع" : "Payment"}</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as Transaction["paymentMethod"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{ar ? "نقدًا" : "Cash"}</SelectItem>
                  <SelectItem value="bank">{ar ? "بنك" : "Bank"}</SelectItem>
                  <SelectItem value="credit">{ar ? "آجل" : "On credit"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{ar ? "الجهة (اختياري)" : "Paid to (optional)"}</Label>
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
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={record.isPending}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={record.isPending || value <= 0 || !description.trim()}>
            {record.isPending ? <Loader2 className="animate-spin" /> : <Receipt />}
            {ar ? "تسجيل" : "Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
