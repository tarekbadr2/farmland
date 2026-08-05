"use client";

import * as React from "react";
import { ArrowLeftRight, ClipboardCheck, Loader2 } from "lucide-react";
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
  useInventory,
  useRecordStocktake,
  useMovements,
  useTransferStock,
  useWarehouses,
} from "@/hooks/use-farm-data";
import { stockInWarehouse } from "@/core/services/warehouse";
import { TODAY } from "@/core/data/seed";
import { cn } from "@/lib/utils";

/**
 * اذن تحويل — move stock from one store to another.
 *
 * The farm's total doesn't change, so the only thing that can go wrong is
 * moving more than the source store actually holds — which is why the form
 * shows that figure and blocks going past it.
 */
export function TransferStockDialog({ trigger }: { trigger: React.ReactNode }) {
  const { locale, formatNumber } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: items = [] } = useInventory();
  const { data: warehouses = [] } = useWarehouses();
  const { data: movements = [] } = useMovements();
  const transfer = useTransferStock();

  const [itemId, setItemId] = React.useState("");
  const [fromId, setFrom] = React.useState("");
  const [toId, setTo] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [date, setDate] = React.useState(TODAY);

  const item = items.find((i) => i.id === itemId);
  const available = item && fromId ? stockInWarehouse(item, fromId, movements) : 0;
  const qty = Number(quantity) || 0;
  const tooMuch = qty > available;
  const canSave = itemId && fromId && toId && fromId !== toId && qty > 0 && !tooMuch;

  const submit = async () => {
    if (!canSave) return;
    try {
      await transfer.mutateAsync({
        itemId,
        fromWarehouseId: fromId,
        toWarehouseId: toId,
        quantity: qty,
        date,
      });
      toast.success(ar ? "تم التحويل." : "Stock transferred.");
      setQuantity("");
      setOpen(false);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      toast.error(
        code === "insufficient-in-store"
          ? ar ? "الكمية أكبر مما في المخزن المصدر." : "That's more than the source store holds."
          : code === "same-store"
            ? ar ? "اختر مخزنين مختلفين." : "Pick two different stores."
            : ar ? "تعذّر التحويل." : "Couldn't transfer that.",
      );
    }
  };

  const storeName = (id: string) => {
    const w = warehouses.find((x) => x.id === id);
    return w ? (ar ? w.nameAr : w.name) : id;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !transfer.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar ? "إذن تحويل مخزني" : "Transfer stock"}</DialogTitle>
          <DialogDescription>
            {ar
              ? "نقل صنف بين المخازن — إجمالي المزرعة لا يتغيّر."
              : "Move an item between stores — the farm's total doesn't change."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label htmlFor="transfer-item">{ar ? "الصنف" : "Item"}</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger id="transfer-item">
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="transfer-from">{ar ? "من مخزن" : "From store"}</Label>
              <Select value={fromId} onValueChange={setFrom}>
                <SelectTrigger id="transfer-from">
                  <SelectValue placeholder={ar ? "اختر" : "Pick one"} />
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
            <div>
              <Label htmlFor="transfer-to">{ar ? "إلى مخزن" : "To store"}</Label>
              <Select value={toId} onValueChange={setTo}>
                <SelectTrigger id="transfer-to">
                  <SelectValue placeholder={ar ? "اختر" : "Pick one"} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses
                    .filter((w) => w.id !== fromId)
                    .map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {ar ? w.nameAr : w.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="transfer-quantity">
                {ar ? "الكمية" : "Quantity"} {item ? `(${item.unit})` : ""}
              </Label>
              <Input
                id="transfer-quantity"
                type="number"
                min={0}
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={cn("tabular-nums", tooMuch && "border-destructive")}
              />
            </div>
            <div>
              <Label htmlFor="transfer-date">{ar ? "التاريخ" : "Date"}</Label>
              <Input id="transfer-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {item && fromId && (
            <p className={cn("text-[12px]", tooMuch ? "text-destructive" : "text-muted-foreground")}>
              {ar
                ? `المتاح في ${storeName(fromId)}: ${formatNumber(available)} ${item.unit}`
                : `Available in ${storeName(fromId)}: ${formatNumber(available)} ${item.unit}`}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={transfer.isPending}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={!canSave || transfer.isPending}>
            {transfer.isPending ? <Loader2 className="animate-spin" /> : <ArrowLeftRight />}
            {ar ? "تحويل" : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * جرد المخازن — count a store and correct what doesn't match.
 *
 * Only lines whose count differs from the expected figure produce an
 * adjustment, so a clean count writes nothing at all.
 */
export function StocktakeDialog({ trigger }: { trigger: React.ReactNode }) {
  const { locale, formatNumber } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: items = [] } = useInventory();
  const { data: warehouses = [] } = useWarehouses();
  const { data: movements = [] } = useMovements();
  const record = useRecordStocktake();

  const [warehouseId, setWarehouse] = React.useState("");
  const [date, setDate] = React.useState(TODAY);
  const [counts, setCounts] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (warehouses.length && !warehouseId) {
      setWarehouse((warehouses.find((w) => w.isDefault) ?? warehouses[0]).id);
    }
  }, [warehouses, warehouseId]);

  // Only items this store actually holds are worth counting.
  const held = React.useMemo(
    () =>
      warehouseId
        ? items
            .map((i) => ({ item: i, expected: stockInWarehouse(i, warehouseId, movements) }))
            .filter((r) => r.expected !== 0)
        : [],
    [items, warehouseId, movements],
  );

  const variances = held
    .map((r) => ({ ...r, counted: counts[r.item.id] === undefined ? null : Number(counts[r.item.id]) }))
    .filter((r) => r.counted !== null && r.counted !== r.expected);

  const submit = async () => {
    const lines = held
      .filter((r) => counts[r.item.id] !== undefined && counts[r.item.id] !== "")
      .map((r) => ({ itemId: r.item.id, counted: Number(counts[r.item.id]) }));
    if (!lines.length) return;
    try {
      const written = await record.mutateAsync({ warehouseId, date, lines });
      toast.success(
        written.length
          ? ar ? `تم تسوية ${written.length} صنف.` : `${written.length} item(s) adjusted.`
          : ar ? "الجرد مطابق — لا تسويات." : "Count matches — nothing to adjust.",
      );
      setCounts({});
      setOpen(false);
    } catch {
      toast.error(ar ? "تعذّر حفظ الجرد." : "Couldn't save the stocktake.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !record.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ar ? "جرد مخزن" : "Stocktake"}</DialogTitle>
          <DialogDescription>
            {ar
              ? "اكتب الكمية الفعلية على الرف — تُسجَّل تسوية للفروق فقط."
              : "Enter what's actually on the shelf — only differences are adjusted."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="stocktake-store">{ar ? "المخزن" : "Store"}</Label>
            <Select value={warehouseId} onValueChange={setWarehouse}>
              <SelectTrigger id="stocktake-store">
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
          <div>
            <Label htmlFor="stocktake-date">{ar ? "التاريخ" : "Date"}</Label>
            <Input id="stocktake-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-muted/60 text-[11.5px] text-muted-foreground">
              <tr>
                <th className="p-2 text-start font-medium">{ar ? "الصنف" : "Item"}</th>
                <th className="w-24 p-2 text-end font-medium">{ar ? "المتوقع" : "Expected"}</th>
                <th className="w-28 p-2 text-end font-medium">{ar ? "الفعلي" : "Counted"}</th>
                <th className="w-24 p-2 text-end font-medium">{ar ? "الفرق" : "Variance"}</th>
              </tr>
            </thead>
            <tbody>
              {held.map(({ item, expected }) => {
                const raw = counts[item.id];
                const counted = raw === undefined || raw === "" ? null : Number(raw);
                const variance = counted === null ? null : counted - expected;
                return (
                  <tr key={item.id} className="border-t border-border/60">
                    <td className="p-2">{ar ? item.nameAr : item.name}</td>
                    <td className="p-2 text-end tabular-nums text-muted-foreground">
                      {formatNumber(expected)}
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 text-end text-[12.5px] tabular-nums"
                        value={raw ?? ""}
                        onChange={(e) => setCounts((c) => ({ ...c, [item.id]: e.target.value }))}
                      />
                    </td>
                    <td
                      className={cn(
                        "p-2 text-end tabular-nums",
                        variance == null
                          ? "text-muted-foreground"
                          : variance === 0
                            ? "text-muted-foreground"
                            : variance > 0
                              ? "text-primary"
                              : "text-destructive",
                      )}
                    >
                      {variance == null ? "—" : variance > 0 ? `+${formatNumber(variance)}` : formatNumber(variance)}
                    </td>
                  </tr>
                );
              })}
              {held.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    {ar ? "لا يوجد مخزون في هذا المخزن." : "This store holds no stock."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <span className="me-auto self-center text-[12.5px] text-muted-foreground">
            {ar
              ? `${formatNumber(variances.length)} فرق`
              : `${variances.length} difference${variances.length === 1 ? "" : "s"}`}
          </span>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={record.isPending}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={record.isPending}>
            {record.isPending ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
            {ar ? "حفظ الجرد" : "Save stocktake"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
