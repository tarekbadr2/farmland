"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";
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
import { getRepository } from "@/core/repositories";
import { useI18n } from "@/lib/i18n/provider";
import { TODAY } from "@/core/data/seed";
import type { Animal, AnimalDisposal } from "@/core/domain/types";

type DisposeType = "sold" | "died" | "culled";

/**
 * Records an animal leaving the herd — sold, died or culled.
 *
 * A sale posts the linked income automatically; a death or cull just closes the
 * animal out. Either way the animal drops off the active herd and its cost
 * ledger is finalised.
 */
export function DisposeAnimalDialog({ animal, trigger }: { animal: Animal; trigger: React.ReactNode }) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const queryClient = useQueryClient();

  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<DisposeType>("sold");
  const [date, setDate] = React.useState(TODAY);
  const [weight, setWeight] = React.useState(String(animal.weightKg ?? ""));
  const [proceeds, setProceeds] = React.useState("");
  const [note, setNote] = React.useState("");

  const mut = useMutation({
    mutationFn: (d: AnimalDisposal) => getRepository().disposeAnimal(animal.id, d),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      setOpen(false);
      toast.success(
        type === "sold"
          ? ar ? "تم تسجيل البيع." : "Sale recorded."
          : ar ? "تم تسجيل الخروج." : "Recorded.",
      );
    },
    onError: () => toast.error(ar ? "تعذّر الحفظ. حاول مرة أخرى." : "Couldn't save. Try again."),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const disposal: AnimalDisposal = {
      type,
      date,
      weightKg: weight ? Number(weight) : undefined,
      proceeds: type === "sold" && proceeds ? Number(proceeds) : undefined,
      note: note.trim() || undefined,
    };
    mut.mutate(disposal);
  };

  const TYPE_LABEL: Record<DisposeType, { en: string; ar: string }> = {
    sold: { en: "Sold", ar: "بيع" },
    died: { en: "Died", ar: "نفوق" },
    culled: { en: "Culled", ar: "استبعاد" },
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !mut.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md" showClose={!mut.isPending}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="size-4 text-muted-foreground" />
            {ar ? "تسجيل خروج من القطيع" : "Record herd exit"}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? "سجّل بيع الحيوان أو نفوقه أو استبعاده. يُحسب هذا في حساب منفصل."
              : "Record a sale, death or cull. This posts to its own account."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" dir={ar ? "rtl" : "ltr"}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dispose-type" className="text-[12.5px]">{ar ? "النوع" : "Type"}</Label>
              <Select value={type} onValueChange={(v) => setType(v as DisposeType)}>
                <SelectTrigger id="dispose-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["sold", "died", "culled"] as const).map((k) => (
                    <SelectItem key={k} value={k}>
                      {ar ? TYPE_LABEL[k].ar : TYPE_LABEL[k].en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dispose-date" className="text-[12.5px]">{ar ? "التاريخ" : "Date"}</Label>
              <Input id="dispose-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dispose-weight" className="text-[12.5px]">{ar ? "الوزن (كجم)" : "Weight (kg)"}</Label>
              <Input
                id="dispose-weight"
                type="number"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="0"
              />
            </div>
            {type === "sold" && (
              <div className="space-y-1.5">
                <Label htmlFor="dispose-proceeds" className="text-[12.5px]">{ar ? "قيمة البيع (ج.م)" : "Sale price (EGP)"}</Label>
                <Input
                  id="dispose-proceeds"
                  type="number"
                  inputMode="decimal"
                  value={proceeds}
                  onChange={(e) => setProceeds(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dispose-note" className="text-[12.5px]">{ar ? "ملاحظة (اختياري)" : "Note (optional)"}</Label>
            <Input id="dispose-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={ar ? "المشتري، السبب…" : "Buyer, reason…"} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={mut.isPending}>
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" variant={type === "sold" ? "default" : "destructive"} disabled={mut.isPending}>
              {mut.isPending ? <Loader2 className="animate-spin" /> : null}
              {ar ? "تسجيل" : "Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
