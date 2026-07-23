"use client";

import * as React from "react";
import { ArrowRightLeft, Loader2, Search, TriangleAlert } from "lucide-react";
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
import { useAnimals, useRecordLivestockTransfer, useZones } from "@/hooks/use-farm-data";
import { checkTransfer, isMovable, transferableZones } from "@/core/services/livestock";
import { TODAY } from "@/core/data/seed";
import { cn } from "@/lib/utils";
import type { TransferReason } from "@/core/domain/types";

const REASONS: { value: TransferReason; en: string; ar: string }[] = [
  { value: "regrouping", en: "Regrouping", ar: "إعادة تجميع" },
  { value: "medical", en: "Medical / isolation", ar: "علاج أو عزل" },
  { value: "dry_off", en: "Drying off", ar: "تجفيف" },
  { value: "calving", en: "Calving", ar: "ولادة" },
  { value: "sale_prep", en: "Preparing for sale", ar: "تجهيز للبيع" },
  { value: "other", en: "Other", ar: "أخرى" },
];

/**
 * اذن تحويل رؤوس — move head into a pen as a recorded document.
 *
 * Capacity is shown but never blocks: isolating a sick group into a full pen is
 * a real thing farms do, and refusing it would just push someone to edit the
 * records by hand — the untracked change this document exists to replace.
 */
export function TransferAnimalsDialog({ trigger }: { trigger: React.ReactNode }) {
  const { locale, formatNumber } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: page } = useAnimals({ pageSize: 100_000 });
  const { data: zones = [] } = useZones();
  const record = useRecordLivestockTransfer();

  const animals = React.useMemo(() => page?.items ?? [], [page]);
  const destinations = React.useMemo(() => transferableZones(zones), [zones]);

  const [toZoneId, setToZone] = React.useState("");
  const [date, setDate] = React.useState(TODAY);
  const [reason, setReason] = React.useState<TransferReason>("regrouping");
  const [notes, setNotes] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());

  // Only animals still in the herd can move.
  const movable = React.useMemo(() => animals.filter(isMovable), [animals]);
  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? movable.filter(
          (a) =>
            a.tag.toLowerCase().includes(q) ||
            (a.name ?? "").toLowerCase().includes(q) ||
            (a.nameAr ?? "").includes(search.trim()),
        )
      : movable;
    return list.slice(0, 200);
  }, [movable, search]);

  // Memoised: a fresh array each render would re-run the check on every keystroke.
  const animalIds = React.useMemo(() => [...picked], [picked]);
  const check = React.useMemo(
    () => checkTransfer({ toZoneId, animalIds }, animals, zones),
    [toZoneId, animalIds, animals, zones],
  );

  const zoneName = (id: string) => {
    const z = zones.find((x) => x.id === id);
    return z ? (ar ? z.nameAr : z.name) : "—";
  };

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    if (!check.ok) return;
    try {
      await record.mutateAsync({ toZoneId, animalIds, date, reason, notes: notes.trim() || undefined });
      toast.success(
        ar
          ? `تم تحويل ${formatNumber(animalIds.length)} رأس إلى ${zoneName(toZoneId)}.`
          : `${animalIds.length} head moved to ${zoneName(toZoneId)}.`,
      );
      setPicked(new Set());
      setNotes("");
      setOpen(false);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      toast.error(
        code === "already-in-zone"
          ? ar ? "هذه الرؤوس موجودة بالفعل في هذا الحظيرة." : "Those head are already in that pen."
          : ar ? "تعذّر تنفيذ التحويل." : "Couldn't record that transfer.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !record.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ar ? "إذن تحويل رؤوس" : "Transfer head"}</DialogTitle>
          <DialogDescription>
            {ar
              ? "نقل الرؤوس بين الحظائر كمستند مسجّل."
              : "Move animals between pens as a recorded document."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>{ar ? "إلى" : "To pen"}</Label>
            <Select value={toZoneId} onValueChange={setToZone}>
              <SelectTrigger>
                <SelectValue placeholder={ar ? "اختر" : "Pick one"} />
              </SelectTrigger>
              <SelectContent>
                {destinations.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {ar ? z.nameAr : z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{ar ? "السبب" : "Reason"}</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as TransferReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {ar ? r.ar : r.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{ar ? "التاريخ" : "Date"}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-8"
            placeholder={ar ? "ابحث برقم أو اسم" : "Search by tag or name"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-[38vh] overflow-y-auto rounded-lg border border-border">
          {visible.map((a) => {
            const chosen = picked.has(a.id);
            const here = a.penId === toZoneId;
            return (
              <button
                key={a.id}
                onClick={() => toggle(a.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border/60 px-3 py-2 text-start text-[12.5px] transition hover:bg-accent/40",
                  chosen && "bg-primary/[0.07]",
                )}
              >
                <span
                  className={cn(
                    "size-4 shrink-0 rounded border",
                    chosen ? "border-primary bg-primary" : "border-input",
                  )}
                />
                <span className="tabular-nums font-medium">{a.tag}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {ar ? a.nameAr : a.name}
                </span>
                <span className={cn("text-[11.5px]", here ? "text-muted-foreground/60" : "text-muted-foreground")}>
                  {zoneName(a.penId)}
                  {here ? ` · ${ar ? "بالفعل هنا" : "already here"}` : ""}
                </span>
              </button>
            );
          })}
          {visible.length === 0 && (
            <p className="py-8 text-center text-[12.5px] text-muted-foreground">
              {ar ? "لا نتائج." : "No matches."}
            </p>
          )}
        </div>

        <div>
          <Label>{ar ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {/* Capacity is advisory — shown plainly, never a blocker. */}
        {toZoneId && animalIds.length > 0 && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]",
              check.overCapacity
                ? "border-amber-500/40 bg-amber-500/[0.07]"
                : "border-border bg-muted/40",
            )}
          >
            {check.overCapacity && <TriangleAlert className="size-4 shrink-0 text-amber-500" />}
            <span>
              {zoneName(toZoneId)}: {formatNumber(check.occupancyBefore)} →{" "}
              <span className="font-semibold">{formatNumber(check.occupancyAfter)}</span>
              {check.capacity > 0 ? ` / ${formatNumber(check.capacity)}` : ""}
              {check.overCapacity ? ` — ${ar ? "فوق السعة" : "over capacity"}` : ""}
            </span>
          </div>
        )}

        <DialogFooter>
          <span className="me-auto self-center text-[12.5px] text-muted-foreground">
            {ar
              ? `${formatNumber(animalIds.length)} رأس محدّد`
              : `${animalIds.length} selected`}
          </span>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={record.isPending}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={!check.ok || record.isPending}>
            {record.isPending ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
            {ar ? "تحويل" : "Transfer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
