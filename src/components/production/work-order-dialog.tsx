"use client";

import * as React from "react";
import { Factory, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
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
  useSaveWorkOrder,
  useWarehouses,
} from "@/hooks/use-farm-data";
import { checkWorkOrder, workOrderCost, type StockLookup } from "@/core/services/production";
import { TODAY } from "@/core/data/seed";
import type { WorkOrderLine } from "@/core/domain/types";

interface DraftLine extends WorkOrderLine {
  key: string;
}

const emptyLine = (): DraftLine => ({
  key: Math.random().toString(36).slice(2),
  source: "feed",
  itemId: "",
  quantity: 0,
});

/**
 * أمر شغل — turn inputs into an output and see what it cost.
 *
 * The cost per unit updates live as lines change, because that number is the
 * whole point: it's what the product should be priced against.
 */
export function WorkOrderDialog({ trigger }: { trigger: React.ReactNode }) {
  const { locale, formatCurrency, formatNumber } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: inventory = [] } = useInventory();
  const { data: feed = [] } = useFeedItems();
  const { data: warehouses = [] } = useWarehouses();
  const save = useSaveWorkOrder();

  const stock: StockLookup = React.useMemo(() => ({ inventory, feed }), [inventory, feed]);

  const [name, setName] = React.useState("");
  const [date, setDate] = React.useState(TODAY);
  const [warehouseId, setWarehouse] = React.useState("");
  const [overhead, setOverhead] = React.useState("");
  const [inputs, setInputs] = React.useState<DraftLine[]>([emptyLine()]);
  const [outputs, setOutputs] = React.useState<DraftLine[]>([emptyLine()]);

  const clean = (lines: DraftLine[]) =>
    lines.filter((l) => l.itemId && l.quantity > 0).map((l) => ({ source: l.source, itemId: l.itemId, quantity: l.quantity }));

  const draft = {
    inputs: clean(inputs),
    outputs: clean(outputs),
    overheadCost: Number(overhead) || 0,
    status: "planned" as const,
  };
  const cost = workOrderCost(draft, stock);
  const check = checkWorkOrder(draft, stock);
  const canSave = name.trim() && draft.inputs.length > 0 && draft.outputs.length > 0;

  const optionsFor = (source: WorkOrderLine["source"]) =>
    source === "feed"
      ? feed.map((f) => ({ id: f.id, label: ar ? f.nameAr : f.name, unit: f.unit }))
      : inventory.map((i) => ({ id: i.id, label: ar ? i.nameAr : i.name, unit: i.unit }));

  const submit = async () => {
    if (!canSave) return;
    try {
      await save.mutateAsync({
        date,
        name: name.trim(),
        status: "planned",
        inputs: draft.inputs,
        outputs: draft.outputs,
        overheadCost: draft.overheadCost || undefined,
        warehouseId: warehouseId || undefined,
      });
      toast.success(ar ? "تم إنشاء أمر الشغل." : "Work order created.");
      setName("");
      setInputs([emptyLine()]);
      setOutputs([emptyLine()]);
      setOverhead("");
      setOpen(false);
    } catch {
      toast.error(ar ? "تعذّر الحفظ." : "Couldn't save that.");
    }
  };

  const LineEditor = ({
    lines,
    setLines,
    label,
  }: {
    lines: DraftLine[];
    setLines: React.Dispatch<React.SetStateAction<DraftLine[]>>;
    label: string;
  }) => (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label>{label}</Label>
        <Button variant="ghost" size="sm" onClick={() => setLines((l) => [...l, emptyLine()])}>
          <Plus className="size-3.5" /> {ar ? "سطر" : "Line"}
        </Button>
      </div>
      <div className="space-y-1.5">
        {lines.map((line) => {
          const opts = optionsFor(line.source);
          return (
            <div key={line.key} className="flex items-center gap-1.5">
              <Select
                value={line.source}
                onValueChange={(v) =>
                  setLines((ls) =>
                    ls.map((l) =>
                      l.key === line.key
                        ? { ...l, source: v as WorkOrderLine["source"], itemId: "" }
                        : l,
                    ),
                  )
                }
              >
                <SelectTrigger className="h-8 w-24 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feed">{ar ? "علف" : "Feed"}</SelectItem>
                  <SelectItem value="inventory">{ar ? "مخزون" : "Stock"}</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={line.itemId}
                onValueChange={(v) =>
                  setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, itemId: v } : l)))
                }
              >
                <SelectTrigger className="h-8 flex-1 text-[12px]">
                  <SelectValue placeholder={ar ? "اختر صنفًا" : "Pick an item"} />
                </SelectTrigger>
                <SelectContent>
                  {opts.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-8 w-24 text-end text-[12px] tabular-nums"
                value={line.quantity || ""}
                onChange={(e) =>
                  setLines((ls) =>
                    ls.map((l) =>
                      l.key === line.key ? { ...l, quantity: Number(e.target.value) || 0 } : l,
                    ),
                  )
                }
              />

              <button
                onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== line.key) : ls))}
                disabled={lines.length <= 1}
                className="text-muted-foreground transition hover:text-destructive disabled:opacity-30"
                aria-label={ar ? "حذف" : "Remove"}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ar ? "أمر شغل" : "Work order"}</DialogTitle>
          <DialogDescription>
            {ar
              ? "تحويل مدخلات إلى منتج — تُحتسب تكلفة الوحدة تلقائيًا."
              : "Turn inputs into a product — the unit cost is worked out for you."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="wo-name">{ar ? "الوصف" : "What is being made"}</Label>
            <Input
              id="wo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={ar ? "مثال: خلط علف مركّز" : "e.g. Mix concentrate ration"}
            />
          </div>
          <div>
            <Label htmlFor="wo-date">{ar ? "التاريخ" : "Date"}</Label>
            <Input id="wo-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="wo-store">{ar ? "المخزن" : "Store"}</Label>
            <Select value={warehouseId} onValueChange={setWarehouse}>
              <SelectTrigger id="wo-store">
                <SelectValue placeholder={ar ? "اختياري" : "Optional"} />
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
        </div>

        <LineEditor lines={inputs} setLines={setInputs} label={ar ? "المدخلات" : "Inputs"} />
        <LineEditor lines={outputs} setLines={setOutputs} label={ar ? "المخرجات" : "Outputs"} />

        <div>
          <Label htmlFor="wo-overhead">{ar ? "تكاليف أخرى (عمالة، طاقة)" : "Overhead (labour, power)"}</Label>
          <Input
            id="wo-overhead"
            type="number"
            min={0}
            step="0.01"
            value={overhead}
            onChange={(e) => setOverhead(e.target.value)}
            className="tabular-nums"
          />
        </div>

        {/* The number this whole screen exists to produce. */}
        <div className="rounded-lg border border-primary/25 bg-primary/[0.05] px-3 py-2.5">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="text-muted-foreground">{ar ? "تكلفة المواد" : "Materials"}</span>
            <span className="tabular-nums">{formatCurrency(cost.materialCost)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[12.5px]">
            <span className="text-muted-foreground">{ar ? "الإجمالي" : "Total cost"}</span>
            <span className="tabular-nums">{formatCurrency(cost.totalCost)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between border-t border-border/60 pt-1.5 text-[13.5px] font-semibold">
            <span>{ar ? "تكلفة الوحدة" : "Cost per unit"}</span>
            <span className="tabular-nums">
              {formatCurrency(cost.unitCost)}
              {cost.outputQuantity > 0 && (
                <span className="ms-1 text-[11.5px] font-normal text-muted-foreground">
                  × {formatNumber(cost.outputQuantity)}
                </span>
              )}
            </span>
          </div>
        </div>

        {check.shortages.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2 text-[12.5px]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <span>
              {ar ? "المخزون غير كافٍ — يمكن الحفظ كخطة والتشغيل لاحقًا." : "Not enough stock — you can still save this as a plan and run it later."}
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={!canSave || save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Factory />}
            {ar ? "حفظ" : "Save order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
