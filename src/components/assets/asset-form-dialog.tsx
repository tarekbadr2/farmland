"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
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
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/menu";
import { getRepository } from "@/core/repositories";
import { useI18n } from "@/lib/i18n/provider";
import { qk } from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import type { Asset, AssetCategory } from "@/core/domain/types";

export const ASSET_CATEGORIES: { value: AssetCategory; en: string; ar: string }[] = [
  { value: "land", en: "Land", ar: "أرض" },
  { value: "building", en: "Building", ar: "مبنى" },
  { value: "machine", en: "Machine", ar: "آلة" },
  { value: "equipment", en: "Equipment", ar: "معدات" },
  { value: "vehicle", en: "Vehicle", ar: "مركبة" },
  { value: "other", en: "Other", ar: "أخرى" },
];

/** Add or edit a fixed asset. Land is non-depreciating, so the useful-life field
 *  is hidden for it. */
export function AssetFormDialog({ asset, trigger }: { asset?: Asset; trigger: React.ReactNode }) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const queryClient = useQueryClient();
  const editing = Boolean(asset);

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(asset?.name ?? "");
  const [nameAr, setNameAr] = React.useState(asset?.nameAr ?? "");
  const [category, setCategory] = React.useState<AssetCategory>(asset?.category ?? "machine");
  const [acquiredDate, setAcquiredDate] = React.useState(asset?.acquiredDate ?? TODAY);
  const [cost, setCost] = React.useState(String(asset?.cost ?? ""));
  const [salvage, setSalvage] = React.useState(asset?.salvageValue != null ? String(asset.salvageValue) : "");
  const [life, setLife] = React.useState(asset?.usefulLifeYears != null ? String(asset.usefulLifeYears) : "");
  const [location, setLocation] = React.useState(asset?.location ?? "");
  const [notes, setNotes] = React.useState(asset?.notes ?? "");

  const save = useMutation({
    mutationFn: () =>
      getRepository().saveAsset({
        id: asset?.id,
        name: name.trim(),
        nameAr: nameAr.trim() || undefined,
        category,
        acquiredDate,
        cost: Number(cost) || 0,
        salvageValue: salvage ? Number(salvage) : undefined,
        usefulLifeYears: category === "land" ? undefined : life ? Number(life) : undefined,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        status: asset?.status ?? "active",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.assets });
      setOpen(false);
      toast.success(editing ? (ar ? "تم تحديث الأصل" : "Asset updated") : (ar ? "تمت إضافة الأصل" : "Asset added"));
    },
    onError: () => toast.error(ar ? "تعذّر الحفظ." : "Couldn't save."),
  });

  const del = useMutation({
    mutationFn: () => getRepository().deleteAsset(asset!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.assets });
      setOpen(false);
      toast.success(ar ? "تم حذف الأصل" : "Asset deleted");
    },
    onError: () => toast.error(ar ? "تعذّر الحذف." : "Couldn't delete."),
  });

  const busy = save.isPending || del.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg" showClose={!busy}>
        <DialogHeader>
          <DialogTitle>{editing ? (ar ? "تعديل أصل" : "Edit asset") : (ar ? "أصل جديد" : "New asset")}</DialogTitle>
          <DialogDescription>
            {ar ? "الأراضي والمباني والآلات والمعدات والمركبات." : "Land, buildings, machinery, equipment and vehicles."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && cost) save.mutate();
          }}
          className="space-y-4"
          dir={ar ? "rtl" : "ltr"}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "الاسم" : "Name"}</Label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "الاسم بالعربية" : "Arabic name"}</Label>
              <Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "الفئة" : "Category"}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as AssetCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {ar ? c.ar : c.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "تاريخ الشراء" : "Acquired"}</Label>
              <Input type="date" value={acquiredDate} onChange={(e) => setAcquiredDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "التكلفة (ج.م)" : "Cost (EGP)"}</Label>
              <Input type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "القيمة المتبقية (ج.م)" : "Salvage value (EGP)"}</Label>
              <Input type="number" inputMode="decimal" value={salvage} onChange={(e) => setSalvage(e.target.value)} placeholder="0" />
            </div>
            {category !== "land" && (
              <div className="space-y-1.5">
                <Label className="text-[12.5px]">{ar ? "العمر الإنتاجي (سنوات)" : "Useful life (years)"}</Label>
                <Input type="number" inputMode="numeric" value={life} onChange={(e) => setLife(e.target.value)} placeholder="10" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "الموقع (اختياري)" : "Location (optional)"}</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12.5px]">{ar ? "ملاحظات" : "Notes"}</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter className="sm:justify-between">
            {editing ? (
              <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={() => del.mutate()}>
                {del.isPending ? <Loader2 className="animate-spin" /> : <Trash2 className="size-4" />}
                {ar ? "حذف" : "Delete"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                {ar ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" disabled={busy || !name.trim() || !cost}>
                {save.isPending ? <Loader2 className="animate-spin" /> : null}
                {ar ? "حفظ" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
