"use client";

import * as React from "react";
import { FileSpreadsheet } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import { useMovements, useWarehouses } from "@/hooks/use-farm-data";
import { stockLedger } from "@/core/services/warehouse";
import { downloadTableXlsx } from "@/lib/export";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { InventoryItem, StockMovement } from "@/core/domain/types";

const KIND_EN: Record<StockMovement["kind"], string> = {
  in: "In",
  out: "Out",
  adjustment: "Adjustment",
  waste: "Waste",
};
const KIND_AR: Record<StockMovement["kind"], string> = {
  in: "وارد",
  out: "صادر",
  adjustment: "تسوية",
  waste: "هالك",
};

/**
 * حركة صنف — one item's movements oldest-first with a running quantity.
 *
 * Reads straight from the movement log, so it can never disagree with what the
 * stock level was built from. The running total ends at whatever the movements
 * account for, which for an item whose opening stock predates the log won't
 * equal today's on-hand figure — shown plainly rather than papered over.
 */
export function StockLedgerDialog({
  item,
  onClose,
}: {
  item: InventoryItem | null;
  onClose: () => void;
}) {
  const { locale, formatNumber } = useI18n();
  const ar = locale === "ar";
  const { data: movements = [] } = useMovements();
  const { data: warehouses = [] } = useWarehouses();
  const [warehouseId, setWarehouse] = React.useState<string>("all");

  const { rows, closing } = React.useMemo(
    () =>
      item
        ? stockLedger(item.id, movements, {
            warehouseId: warehouseId === "all" ? undefined : warehouseId,
          })
        : { rows: [], closing: 0 },
    [item, movements, warehouseId],
  );

  const storeName = (id?: string) => {
    const w = warehouses.find((x) => x.id === id);
    return w ? (ar ? w.nameAr : w.name) : ar ? "الرئيسي" : "Main";
  };

  const name = item ? (ar ? item.nameAr : item.name) : "";
  // The movements can't fully explain the on-hand figure when opening stock
  // predates the log; flag it rather than imply the ledger is the whole story.
  const matchesOnHand = item ? Math.abs(closing - item.stock) < 0.001 : true;

  const exportLedger = () => {
    if (!item) return;
    downloadTableXlsx(
      `stock-ledger-${item.id}`,
      `${ar ? "حركة صنف" : "Stock ledger"} — ${name}`,
      rows.map((r) => ({
        [ar ? "التاريخ" : "Date"]: r.movement.date,
        [ar ? "النوع" : "Type"]: ar ? KIND_AR[r.movement.kind] : KIND_EN[r.movement.kind],
        [ar ? "المخزن" : "Store"]: storeName(r.movement.warehouseId),
        [ar ? "المرجع" : "Reference"]: r.movement.reference ?? "",
        [ar ? "الكمية" : "Qty"]: r.delta,
        [ar ? "الرصيد" : "Balance"]: r.running,
      })),
    );
  };

  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {ar ? "حركة صنف" : "Stock ledger"} — {name}
          </DialogTitle>
          <DialogDescription>
            {item
              ? ar
                ? `الرصيد الحالي ${formatNumber(item.stock)} ${item.unit}.`
                : `On hand: ${formatNumber(item.stock)} ${item.unit}.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {warehouses.length > 1 && (
          <div className="w-52">
            <Select value={warehouseId} onValueChange={setWarehouse}>
              <SelectTrigger className="h-8 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{ar ? "كل المخازن" : "All stores"}</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {ar ? w.nameAr : w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-muted/60 text-[11.5px] text-muted-foreground">
              <tr>
                <th className="p-2 text-start font-medium">{ar ? "التاريخ" : "Date"}</th>
                <th className="p-2 text-start font-medium">{ar ? "النوع" : "Type"}</th>
                <th className="p-2 text-start font-medium">{ar ? "المرجع" : "Reference"}</th>
                <th className="w-24 p-2 text-end font-medium">{ar ? "الكمية" : "Qty"}</th>
                <th className="w-24 p-2 text-end font-medium">{ar ? "الرصيد" : "Balance"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.movement.id}_${i}`} className="border-t border-border/60">
                  <td className="p-2 whitespace-nowrap text-muted-foreground">
                    {formatDate(r.movement.date, locale)}
                  </td>
                  <td className="p-2">
                    {ar ? KIND_AR[r.movement.kind] : KIND_EN[r.movement.kind]}
                    {warehouses.length > 1 && warehouseId === "all" && (
                      <span className="ms-1 text-[10.5px] text-muted-foreground">
                        · {storeName(r.movement.warehouseId)}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    <span className="block max-w-[16rem] truncate text-muted-foreground">
                      {r.movement.reference ?? "—"}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "p-2 text-end tabular-nums",
                      r.delta > 0 ? "text-primary" : "text-destructive",
                    )}
                  >
                    {r.delta > 0 ? `+${formatNumber(r.delta)}` : formatNumber(r.delta)}
                  </td>
                  <td className="p-2 text-end font-medium tabular-nums">{formatNumber(r.running)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    {ar ? "لا توجد حركة مسجّلة." : "No recorded movements."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={exportLedger} disabled={!rows.length}>
            <FileSpreadsheet /> {ar ? "تصدير Excel" : "Export Excel"}
          </Button>
          {item && !matchesOnHand && rows.length > 0 && (
            <p className="text-[11.5px] text-muted-foreground">
              {ar
                ? `الحركات تفسّر ${formatNumber(closing)} ${item.unit}؛ الفرق رصيد افتتاحي سابق للسجل.`
                : `Movements account for ${formatNumber(closing)} ${item.unit}; the rest is opening stock from before the log.`}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
