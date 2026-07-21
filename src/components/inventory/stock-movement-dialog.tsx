"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowDownToLine, ArrowUpFromLine, Check, Loader2, PackagePlus, Scale, Trash2 } from "lucide-react";
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
import { useInventory } from "@/hooks/use-farm-data";
import { getRepository } from "@/core/repositories";
import { TODAY } from "@/core/data/seed";
import { cn } from "@/lib/utils";
import type { StockMovement } from "@/core/domain/types";

const KINDS = [
  { value: "in", icon: ArrowDownToLine, tone: "text-emerald-500" },
  { value: "out", icon: ArrowUpFromLine, tone: "text-blue-500" },
  { value: "waste", icon: Trash2, tone: "text-destructive" },
  { value: "adjustment", icon: Scale, tone: "text-amber-500" },
] as const;

const schema = z.object({
  itemId: z.string().min(1, "Pick an item"),
  kind: z.enum(["in", "out", "waste", "adjustment"]),
  quantity: z.coerce.number().refine((n) => n !== 0, "Enter a quantity"),
  reference: z.string().optional(),
  date: z.string().min(10),
});

type FormValues = z.infer<typeof schema>;

/**
 * Records stock in, stock out, waste or a count adjustment.
 *
 * Direction is the movement kind, never the sign of the number — the operator
 * types a plain positive quantity and picks "used" or "received". The one
 * exception is an adjustment, which is a signed correction to a miscount, so it
 * accepts a negative. The repository applies the delta to the item's stock in
 * the same transaction and refuses to let it go below zero.
 */
export function StockMovementDialog({
  trigger,
  itemId,
  defaultKind = "out",
}: {
  trigger?: React.ReactNode;
  itemId?: string;
  defaultKind?: FormValues["kind"];
}) {
  const { t, ln, locale, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const { data: items = [] } = useInventory();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { itemId: itemId ?? "", kind: defaultKind, quantity: 0, date: TODAY },
  });

  const kind = form.watch("kind");
  const selectedId = form.watch("itemId");
  const quantity = form.watch("quantity");
  const item = items.find((i) => i.id === selectedId);

  // Show the operator where this leaves the shelf, before they commit.
  const projected = React.useMemo(() => {
    if (!item) return null;
    const q = Number(quantity) || 0;
    const delta = kind === "in" ? Math.abs(q) : kind === "adjustment" ? q : -Math.abs(q);
    return { current: item.stock, next: item.stock + delta, delta, unit: item.unit };
  }, [item, kind, quantity]);

  const wouldGoNegative = projected != null && projected.next < 0;

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const move: Omit<StockMovement, "id" | "farmId"> = {
        itemId: values.itemId,
        kind: values.kind,
        quantity: values.quantity,
        reference: values.reference,
        date: values.date,
      };
      return getRepository().saveStockMovement(move);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(locale === "ar" ? "تم تسجيل حركة المخزون" : "Stock movement recorded");
      form.reset({ itemId: "", kind: defaultKind, quantity: 0, date: TODAY });
      setOpen(false);
    },
    // The repository throws with the item name and quantity on hand, which is
    // exactly the message the operator needs — pass it straight through.
    onError: (error) =>
      toast.error(
        error.message ||
          (locale === "ar" ? "تعذر الحفظ. حاول مرة أخرى." : "Couldn't save. Try again."),
      ),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <PackagePlus /> {t("inventory.recordMovement")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("inventory.recordMovement")}</DialogTitle>
          <DialogDescription>{t("inventory.recordMovementHint")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-3.5">
          <div className="grid grid-cols-4 gap-1.5">
            {KINDS.map(({ value, icon: Icon, tone }) => (
              <button
                key={value}
                type="button"
                onClick={() => form.setValue("kind", value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] font-medium transition",
                  kind === value
                    ? "border-primary/50 bg-primary/10"
                    : "border-input text-muted-foreground hover:bg-accent",
                )}
              >
                <Icon className={cn("size-4", kind === value && tone)} />
                {t(`inventory.movement.${value}`)}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>{t("inventory.item")}</Label>
            <Select
              value={selectedId}
              onValueChange={(v) => form.setValue("itemId", v, { shouldValidate: true })}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder={t("common.select")} />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {ln(i)} · {formatNumber(i.stock)} {i.unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.itemId && (
              <p className="text-[11px] text-destructive">{form.formState.errors.itemId.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qty">
                {t("common.quantity")} {item ? `(${item.unit})` : ""}
              </Label>
              <Input
                id="qty"
                type="number"
                step="any"
                inputMode="decimal"
                {...form.register("quantity")}
              />
              {form.formState.errors.quantity && (
                <p className="text-[11px] text-destructive">
                  {form.formState.errors.quantity.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mdate">{t("common.date")}</Label>
              <Input id="mdate" type="date" {...form.register("date")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ref">{t("inventory.reference")}</Label>
            <Input
              id="ref"
              placeholder={kind === "in" ? "PO-2043" : t("inventory.referenceHint")}
              {...form.register("reference")}
            />
          </div>

          {projected && Number(quantity) !== 0 && (
            <div
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2 text-[12px]",
                wouldGoNegative
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-border bg-muted/40",
              )}
            >
              <span className="text-muted-foreground">{t("inventory.afterMovement")}</span>
              <span className="tabular font-semibold">
                {formatNumber(projected.current)} → {formatNumber(projected.next)} {projected.unit}
              </span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending || wouldGoNegative}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
