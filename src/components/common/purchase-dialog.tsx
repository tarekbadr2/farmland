"use client";

import * as React from "react";
import { Loader2, ShoppingCart } from "lucide-react";
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
  useFeedItems,
  useInventory,
  usePartners,
  useRecordPurchase,
} from "@/hooks/use-farm-data";
import { purchaseTotal } from "@/core/services/automation";
import { TODAY } from "@/core/data/seed";
import type { Transaction } from "@/core/domain/types";

/**
 * Record a stock purchase. One form does all three jobs the farm used to do by
 * hand: raise the stock level, remember what was paid per unit, and book the
 * spend as an expense (which posts itself to the ledger).
 */
export function PurchaseDialog({
  kind,
  trigger,
  itemId: fixedItemId,
}: {
  kind: "feed" | "inventory";
  trigger: React.ReactNode;
  itemId?: string;
}) {
  const { locale, formatCurrency } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: feedItems = [] } = useFeedItems();
  const { data: inventory = [] } = useInventory();
  const { data: partners = [] } = usePartners();
  const record = useRecordPurchase();

  const items = kind === "feed" ? feedItems : inventory;
  const suppliers = partners.filter((p) => p.kind === "supplier");

  const [itemId, setItemId] = React.useState(fixedItemId ?? "");
  const [quantity, setQuantity] = React.useState("");
  const [unitCost, setUnitCost] = React.useState("");
  const [date, setDate] = React.useState(TODAY);
  const [supplierId, setSupplierId] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<Transaction["paymentMethod"]>("cash");

  const selected = items.find((i) => i.id === itemId);
  const unit = selected?.unit ?? "";
  const qty = Number(quantity) || 0;
  const cost = Number(unitCost) || 0;
  const total = purchaseTotal({ quantity: qty, unitCost: cost });

  // Default the price to what the item last cost, so a repeat order is one field.
  React.useEffect(() => {
    if (!selected) return;
    const last =
      "costPerUnit" in selected ? selected.costPerUnit : (selected as { unitCost: number }).unitCost;
    if (last && !unitCost) setUnitCost(String(last));
  }, [selected, unitCost]);

  const submit = async () => {
    if (!itemId || qty <= 0 || cost <= 0) return;
    try {
      await record.mutateAsync({
        kind,
        itemId,
        quantity: qty,
        unitCost: cost,
        date,
        supplierId: supplierId || undefined,
        paymentMethod,
      });
      toast.success(
        ar
          ? `تم التسجيل — أُضيفت للمخزون و${formatCurrency(total)} للمصروفات.`
          : `Recorded — stock raised and ${formatCurrency(total)} booked to expenses.`,
      );
      setQuantity("");
      setUnitCost("");
      setOpen(false);
    } catch {
      toast.error(ar ? "تعذّر تسجيل الشراء." : "Couldn't record that purchase.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !record.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {ar ? "تسجيل شراء" : "Record a purchase"}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? "يرفع المخزون ويسجّل التكلفة في المصروفات ودفتر اليومية تلقائيًا."
              : "Raises stock and books the cost to expenses and the ledger automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {!fixedItemId && (
            <div>
              <Label>{ar ? "الصنف" : "Item"}</Label>
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger>
                  <SelectValue placeholder={ar ? "اختر صنفًا" : "Pick an item"} />
                </SelectTrigger>
                <SelectContent>
                  {items.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {ar ? i.nameAr : i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>
                {ar ? "الكمية" : "Quantity"} {unit ? `(${unit})` : ""}
              </Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div>
              <Label>{ar ? "سعر الوحدة" : "Price per unit"}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
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
          </div>

          <div>
            <Label>{ar ? "المورّد (اختياري)" : "Supplier (optional)"}</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder={ar ? "اختر مورّدًا" : "Pick a supplier"} />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {ar ? s.nameAr : s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-primary/25 bg-primary/[0.05] px-3 py-2.5">
            <span className="text-[13px] font-medium">{ar ? "الإجمالي" : "Total"}</span>
            <span className="text-[15px] font-semibold tabular-nums">{formatCurrency(total)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={record.isPending}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={record.isPending || !itemId || qty <= 0 || cost <= 0}>
            {record.isPending ? <Loader2 className="animate-spin" /> : <ShoppingCart />}
            {ar ? "تسجيل" : "Record purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
