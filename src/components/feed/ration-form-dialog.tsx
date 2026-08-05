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
import { useFeedItems, useSaveRation } from "@/hooks/use-farm-data";
import { percentTotal, isBalancedMix, resolveFeeding } from "@/core/services/rations";
import { cn } from "@/lib/utils";
import type { FeedRation } from "@/core/domain/types";

type TargetGroup = FeedRation["targetGroup"];

const GROUPS: { value: TargetGroup; en: string; ar: string }[] = [
  { value: "lactating", en: "Lactating", ar: "حلابة" },
  { value: "dry", en: "Dry", ar: "جافة" },
  { value: "heifers", en: "Heifers", ar: "عشار" },
  { value: "calves", en: "Calves", ar: "عجول" },
  { value: "bulls", en: "Bulls", ar: "طلائق" },
];

interface Row {
  key: string;
  feedItemId: string;
  percent: string;
}

const emptyRow = (): Row => ({
  key: Math.random().toString(36).slice(2),
  feedItemId: "",
  percent: "",
});

/**
 * Build or edit a feed formula. The blend is entered as percentages by weight —
 * because the recipe is re-tuned constantly while the per-head amount barely
 * moves — and must total 100 before it can be saved. Cost is never typed: it's
 * derived live from each ingredient's current price, so the formula re-prices
 * itself whenever feed prices change.
 */
export function RationFormDialog({
  trigger,
  ration,
}: {
  trigger: React.ReactNode;
  ration?: FeedRation;
}) {
  const { locale, formatCurrency, formatNumber } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: feeds = [] } = useFeedItems();
  const save = useSaveRation();
  const editing = Boolean(ration);

  const [name, setName] = React.useState(ration?.name ?? "");
  const [nameAr, setNameAr] = React.useState(ration?.nameAr ?? "");
  const [group, setGroup] = React.useState<TargetGroup>(ration?.targetGroup ?? "lactating");
  const [kgPerHead, setKgPerHead] = React.useState(String(ration?.kgPerHead ?? ""));
  const [rows, setRows] = React.useState<Row[]>(
    ration?.components.length
      ? ration.components.map((c) => ({
          key: Math.random().toString(36).slice(2),
          feedItemId: c.feedItemId,
          percent: String(c.percent),
        }))
      : [emptyRow(), emptyRow()],
  );

  // Re-seed the form each time it's reopened for a different ration.
  React.useEffect(() => {
    if (!open) return;
    setName(ration?.name ?? "");
    setNameAr(ration?.nameAr ?? "");
    setGroup(ration?.targetGroup ?? "lactating");
    setKgPerHead(String(ration?.kgPerHead ?? ""));
    setRows(
      ration?.components.length
        ? ration.components.map((c) => ({
            key: Math.random().toString(36).slice(2),
            feedItemId: c.feedItemId,
            percent: String(c.percent),
          }))
        : [emptyRow(), emptyRow()],
    );
  }, [open, ration]);

  const patch = (key: string, next: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...next } : r)));

  const components = rows
    .filter((r) => r.feedItemId && Number(r.percent) > 0)
    .map((r) => ({ feedItemId: r.feedItemId, percent: Number(r.percent) }));

  const total = percentTotal(rows.map((r) => ({ percent: Number(r.percent) || 0 })));
  const balanced = isBalancedMix(components);
  const totalKg = Number(kgPerHead) || 0;

  // Preview blended cost from live prices — the same math the log path uses.
  const preview = React.useMemo(() => {
    if (!components.length || totalKg <= 0) return null;
    const draft = { kgPerHead: totalKg, components } as FeedRation;
    const perHead = resolveFeeding(draft, 1, feeds).totalCost;
    return { perHead, perKg: totalKg > 0 ? perHead / totalKg : 0 };
  }, [components, totalKg, feeds]);

  const canSave =
    name.trim().length > 0 && totalKg > 0 && components.length > 0 && balanced && !save.isPending;

  const submit = async () => {
    if (!canSave) return;
    try {
      await save.mutateAsync({
        ...(ration?.id ? { id: ration.id } : {}),
        name: name.trim(),
        nameAr: nameAr.trim() || name.trim(),
        targetGroup: group,
        kgPerHead: totalKg,
        components,
      });
      toast.success(ar ? "تم حفظ التركيبة." : "Formula saved.");
      setOpen(false);
    } catch (e) {
      const detail = (e as { code?: string })?.code || (e as Error)?.message || "";
      toast.error(ar ? `تعذّر حفظ التركيبة: ${detail}` : `Couldn't save the formula: ${detail}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? (ar ? "تعديل التركيبة" : "Edit formula") : ar ? "تركيبة جديدة" : "New formula"}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? "المكوّنات بالنسبة المئوية من الوزن — يجب أن يكون المجموع 100٪."
              : "Ingredients are percentages of the mix by weight — they must total 100%."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ration-name">{ar ? "الاسم (إنجليزي)" : "Name (English)"}</Label>
            <Input id="ration-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ration-name-ar">{ar ? "الاسم (عربي)" : "Name (Arabic)"}</Label>
            <Input id="ration-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
          </div>
          <div>
            <Label htmlFor="ration-group">{ar ? "الفئة المستهدفة" : "Target group"}</Label>
            <Select value={group} onValueChange={(v) => setGroup(v as TargetGroup)}>
              <SelectTrigger id="ration-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUPS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {ar ? g.ar : g.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="ration-kg-per-head">{ar ? "إجمالي كجم/رأس" : "Total kg per head"}</Label>
            <Input
              id="ration-kg-per-head"
              type="number"
              min={0}
              step="0.1"
              value={kgPerHead}
              onChange={(e) => setKgPerHead(e.target.value)}
              className="tabular-nums"
            />
          </div>
        </div>

        {/* -------------------------------- Blend --------------------------------- */}
        <div className="mt-2 max-h-[34vh] overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-muted/60 text-[12px] text-muted-foreground">
              <tr>
                <th className="p-2 text-start font-medium">{ar ? "المكوّن" : "Ingredient"}</th>
                <th className="w-24 p-2 text-end font-medium">%</th>
                <th className="w-24 p-2 text-end font-medium">{ar ? "كجم/رأس" : "kg/head"}</th>
                <th className="w-10 p-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const kg = totalKg * ((Number(row.percent) || 0) / 100);
                return (
                  <tr key={row.key} className="border-t border-border/70">
                    <td className="p-1.5">
                      <Select
                        value={row.feedItemId}
                        onValueChange={(v) => patch(row.key, { feedItemId: v })}
                      >
                        <SelectTrigger className="h-8 text-[12.5px]">
                          <SelectValue placeholder={ar ? "اختر مكوّنًا" : "Pick an ingredient"} />
                        </SelectTrigger>
                        <SelectContent>
                          {feeds.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {ar ? f.nameAr : f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.1"
                        className="h-8 text-end text-[12.5px]"
                        value={row.percent}
                        onChange={(e) => patch(row.key, { percent: e.target.value })}
                      />
                    </td>
                    <td className="tabular-nums p-1.5 text-end text-muted-foreground">
                      {kg > 0 ? formatNumber(Math.round(kg * 100) / 100) : "—"}
                    </td>
                    <td className="p-1.5 text-center">
                      <button
                        onClick={() =>
                          setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== row.key) : rs))
                        }
                        className="text-muted-foreground transition hover:text-destructive disabled:opacity-30"
                        disabled={rows.length <= 1}
                        aria-label={ar ? "حذف" : "Remove"}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
            <Plus /> {ar ? "مكوّن" : "Add ingredient"}
          </Button>

          <div className="flex items-center gap-3 text-[12.5px]">
            {preview && (
              <span className="text-muted-foreground">
                {ar ? "التكلفة" : "Cost"}{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatCurrency(Math.round(preview.perHead * 100) / 100)}/{ar ? "رأس" : "head"}
                </span>{" "}
                · {formatCurrency(Math.round(preview.perKg * 100) / 100)}/{ar ? "كجم" : "kg"}
              </span>
            )}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-medium",
                balanced ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
              )}
            >
              {formatNumber(total)}%
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={!canSave}>
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            {ar ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
