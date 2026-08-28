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
  usePurchases,
  useRecordPurchase,
  useWarehouses,
} from "@/hooks/use-farm-data";
import { purchaseTotal } from "@/core/services/automation";
import { defaultWarehouse } from "@/core/services/warehouse";
import { lastSupplierPrice } from "@/core/services/purchasing";
import { TODAY } from "@/core/data/seed";
import type { PaymentMethod, PaymentSplit } from "@/core/domain/types";

/** Immediate-payment methods a split can allocate to, plus credit. Order drives
 *  the split rows and the primary-method pick (first non-credit wins ties). */
const SPLIT_METHODS: PaymentMethod[] = ["cash", "bank", "card", "credit"];

const round2 = (n: number) => Math.round(n * 100) / 100;

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
  const { data: warehouses = [] } = useWarehouses();
  const { data: purchases = [] } = usePurchases();
  const record = useRecordPurchase();

  const items = kind === "feed" ? feedItems : inventory;
  const suppliers = partners.filter((p) => p.kind === "supplier");

  const [itemId, setItemId] = React.useState(fixedItemId ?? "");
  const [quantity, setQuantity] = React.useState("");
  const [unitCost, setUnitCost] = React.useState("");
  const [date, setDate] = React.useState(TODAY);
  const [supplierId, setSupplierId] = React.useState("");
  const [warehouseId, setWarehouseId] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>("cash");
  // Split payment: allocate the total across methods (part cash/bank/card, part
  // credit). Off by default — the single `paymentMethod` covers the whole amount.
  const [split, setSplit] = React.useState(false);
  const [buckets, setBuckets] = React.useState<Record<PaymentMethod, string>>({
    cash: "",
    bank: "",
    card: "",
    credit: "",
  });
  const setBucket = (m: PaymentMethod, v: string) =>
    setBuckets((b) => ({ ...b, [m]: v }));

  // Default the destination store once warehouses load.
  React.useEffect(() => {
    if (!warehouseId && warehouses.length) setWarehouseId(defaultWarehouse(warehouses)?.id ?? "");
  }, [warehouses, warehouseId]);

  const selected = items.find((i) => i.id === itemId);
  const unit = selected?.unit ?? "";
  const qty = Number(quantity) || 0;
  const cost = Number(unitCost) || 0;
  const total = purchaseTotal({ quantity: qty, unitCost: cost });

  const methodLabel = (m: PaymentMethod) =>
    m === "cash"
      ? ar ? "نقدًا" : "Cash"
      : m === "bank"
        ? ar ? "تحويل بنكي" : "Bank transfer"
        : m === "card"
          ? ar ? "فيزا / بطاقة" : "Visa / card"
          : ar ? "آجل (على الحساب)" : "On credit";

  // Split allocation: what's been assigned across methods, and the shortfall.
  const allocated = round2(
    SPLIT_METHODS.reduce((s, m) => s + (Number(buckets[m]) || 0), 0),
  );
  const remainder = round2(total - allocated);
  const splitBalanced = total > 0 && remainder === 0;

  // Default the price to what the item last cost, so a repeat order is one field.
  React.useEffect(() => {
    if (!selected) return;
    const last =
      "costPerUnit" in selected ? selected.costPerUnit : (selected as { unitCost: number }).unitCost;
    if (last && !unitCost) setUnitCost(String(last));
  }, [selected, unitCost]);

  // Picking a supplier fills in what THEY last charged for this item, so a
  // repeat order from a known supplier pre-fills their price.
  React.useEffect(() => {
    if (!itemId || !supplierId) return;
    const sp = lastSupplierPrice(purchases, supplierId, itemId);
    if (sp) setUnitCost(String(sp));
  }, [itemId, supplierId, purchases]);

  const submit = async () => {
    if (!itemId || qty <= 0 || cost <= 0) return;

    // A split must reconcile to the total before it can post; the button is
    // disabled otherwise, this is the belt-and-braces guard.
    let payments: PaymentSplit[] | undefined;
    let method: PaymentMethod = paymentMethod;
    if (split) {
      if (!splitBalanced) return;
      payments = SPLIT_METHODS.map((m) => ({ method: m, amount: round2(Number(buckets[m]) || 0) })).filter(
        (p) => p.amount > 0,
      );
      // Representative method for display/filtering: the biggest slice, with a
      // non-credit slice winning ties (SPLIT_METHODS lists credit last).
      method = [...payments].sort((a, b) => b.amount - a.amount)[0]?.method ?? paymentMethod;
    }

    try {
      await record.mutateAsync({
        kind,
        itemId,
        quantity: qty,
        unitCost: cost,
        date,
        supplierId: supplierId || undefined,
        warehouseId: warehouseId || undefined,
        paymentMethod: method,
        payments,
      });
      toast.success(
        ar
          ? `تم التسجيل — أُضيفت للمخزون و${formatCurrency(total)} للمصروفات.`
          : `Recorded — stock raised and ${formatCurrency(total)} booked to expenses.`,
      );
      setQuantity("");
      setUnitCost("");
      setBuckets({ cash: "", bank: "", card: "", credit: "" });
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
              <Label htmlFor="purchase-item">{ar ? "الصنف" : "Item"}</Label>
              <Select value={itemId} onValueChange={setItemId}>
                <SelectTrigger id="purchase-item">
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
              <Label htmlFor="purchase-quantity">
                {ar ? "الكمية" : "Quantity"} {unit ? `(${unit})` : ""}
              </Label>
              <Input
                id="purchase-quantity"
                type="number"
                min={0}
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div>
              <Label htmlFor="purchase-unit-cost">{ar ? "سعر الوحدة" : "Price per unit"}</Label>
              <Input
                id="purchase-unit-cost"
                type="number"
                min={0}
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div>
              <Label htmlFor="purchase-date">{ar ? "التاريخ" : "Date"}</Label>
              <Input id="purchase-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {!split && (
              <div>
                <Label htmlFor="purchase-payment">{ar ? "طريقة الدفع" : "Payment"}</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                  <SelectTrigger id="purchase-payment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPLIT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {methodLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Split the payment across methods — part cash/bank/card, part on
              credit. The credit slice goes to the supplier's balance. */}
          <div className="rounded-lg border border-border/70">
            <button
              type="button"
              onClick={() => setSplit((s) => !s)}
              className="flex w-full items-center justify-between px-3 py-2 text-[13px] font-medium"
            >
              <span>{ar ? "تقسيم الدفع" : "Split payment"}</span>
              <span className="text-[12px] text-muted-foreground">
                {split ? (ar ? "إخفاء" : "Hide") : (ar ? "دفع بأكثر من طريقة" : "Pay with more than one method")}
              </span>
            </button>
            {split && (
              <div className="border-t border-border/70 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {SPLIT_METHODS.map((m) => (
                    <div key={m}>
                      <Label htmlFor={`split-${m}`}>{methodLabel(m)}</Label>
                      <Input
                        id={`split-${m}`}
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={buckets[m]}
                        onChange={(e) => setBucket(m, e.target.value)}
                        className="tabular-nums"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-[12.5px]">
                  <span className="text-muted-foreground">
                    {ar ? "الموزّع" : "Allocated"}{" "}
                    <span className="tabular-nums text-foreground">{formatCurrency(allocated)}</span>{" "}
                    / {formatCurrency(total)}
                  </span>
                  {remainder !== 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setBucket(
                          "credit",
                          String(round2((Number(buckets.credit) || 0) + remainder)),
                        )
                      }
                      className="font-medium text-primary hover:underline"
                    >
                      {remainder > 0
                        ? ar
                          ? `الباقي ${formatCurrency(remainder)} ← آجل`
                          : `${formatCurrency(remainder)} left → credit`
                        : ar
                          ? `زائد ${formatCurrency(-remainder)}`
                          : `over by ${formatCurrency(-remainder)}`}
                    </button>
                  ) : (
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                      {ar ? "مضبوط" : "Balanced"}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="purchase-supplier">{ar ? "المورّد (اختياري)" : "Supplier (optional)"}</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger id="purchase-supplier">
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
            {/* Which store the goods land in — only worth asking with >1 store. */}
            {warehouses.length > 1 && (
              <div>
                <Label htmlFor="purchase-store">{ar ? "المخزن" : "Store"}</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger id="purchase-store">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {ar ? w.nameAr : w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
          <Button
            onClick={submit}
            disabled={record.isPending || !itemId || qty <= 0 || cost <= 0 || (split && !splitBalanced)}
          >
            {record.isPending ? <Loader2 className="animate-spin" /> : <ShoppingCart />}
            {ar ? "تسجيل" : "Record purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
