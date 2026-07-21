"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2, Plus } from "lucide-react";
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
import { useI18n } from "@/lib/i18n/provider";
import { useZones } from "@/hooks/use-farm-data";
import { getRepository } from "@/core/repositories";
import { TODAY } from "@/core/data/seed";
import { diffDays } from "@/lib/date";
import type { Animal } from "@/core/domain/types";

const BREEDS = [
  "egyptian_baladi",
  "murrah",
  "nili_ravi",
  "jafarabadi",
  "crossbreed",
] as const;

// Horn status and temperament have no dictionary namespace of their own; the
// labels are bilingual pairs kept inline rather than inventing an i18n section
// for two five-item enums.
const HORNS: { value: string; en: string; ar: string }[] = [
  { value: "horned", en: "Horned", ar: "بقرون" },
  { value: "polled", en: "Polled", ar: "بلا قرون" },
  { value: "dehorned", en: "Dehorned", ar: "منزوعة القرون" },
];
const TEMPERAMENTS: { value: string; en: string; ar: string }[] = [
  { value: "calm", en: "Calm", ar: "هادئ" },
  { value: "docile", en: "Docile", ar: "وديع" },
  { value: "nervous", en: "Nervous", ar: "متوتر" },
  { value: "aggressive", en: "Aggressive", ar: "عدواني" },
];

const schema = z.object({
  tag: z.string().min(1, "Required").regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  rfid: z.string().optional(),
  name: z.string().min(1, "Required"),
  nameAr: z.string().optional(),
  sex: z.enum(["female", "male"]),
  breed: z.enum(BREEDS),
  dateOfBirth: z.string().min(10),
  weightKg: z.coerce.number().min(0).max(1500),
  bodyConditionScore: z.coerce.number().min(1).max(5),
  hornStatus: z.enum(["horned", "polled", "dehorned"]),
  color: z.string().optional(),
  temperament: z.enum(["calm", "docile", "nervous", "aggressive"]),
  penId: z.string().min(1, "Required"),
  microchip: z.string().optional(),
  acquiredFrom: z.enum(["born_on_farm", "purchased"]),
  valuation: z.coerce.number().min(0),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Create or edit one animal.
 *
 * A calf is inferred from age rather than asked — under a year is a calf — so
 * there's one fewer field to get wrong, and the derived flags (`isCalf`, the
 * lowercased search keys) are computed here rather than trusted from input.
 * Health, milk and reproduction state are never edited on this form: those are
 * consequences of recorded events, and a free-text override would let the herd
 * drift away from what actually happened to it.
 */
export function AnimalFormDialog({
  trigger,
  animal,
}: {
  trigger?: React.ReactNode;
  animal?: Animal;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const { data: zones = [] } = useZones();
  const pens = zones.filter((z) => z.kind === "pen" || z.kind === "barn" || z.kind === "quarantine");
  const editing = Boolean(animal);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: animal
      ? {
          tag: animal.tag,
          rfid: animal.rfid,
          name: animal.name,
          nameAr: animal.nameAr,
          sex: animal.sex,
          breed: animal.breed,
          dateOfBirth: animal.dateOfBirth,
          weightKg: animal.weightKg,
          bodyConditionScore: animal.bodyConditionScore,
          hornStatus: animal.hornStatus,
          color: animal.color,
          temperament: animal.temperament,
          penId: animal.penId,
          microchip: animal.microchip,
          acquiredFrom: animal.acquiredFrom ?? "born_on_farm",
          valuation: animal.valuation,
          notes: animal.notes,
        }
      : {
          sex: "female",
          breed: "murrah",
          dateOfBirth: TODAY,
          weightKg: 40,
          bodyConditionScore: 3,
          hornStatus: "horned",
          temperament: "calm",
          acquiredFrom: "born_on_farm",
          valuation: 0,
        },
  });

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const ageDays = diffDays(TODAY, values.dateOfBirth);
      const isCalf = ageDays < 365;

      const patch: Partial<Animal> & { id?: string } = {
        ...animal, // preserve state we don't edit here (health, milk, repro)
        id: animal?.id,
        tag: values.tag.trim(),
        rfid: values.rfid?.trim() ?? "",
        name: values.name.trim(),
        nameAr: values.nameAr?.trim() || values.name.trim(),
        sex: values.sex,
        breed: values.breed,
        dateOfBirth: values.dateOfBirth,
        weightKg: values.weightKg,
        bodyConditionScore: values.bodyConditionScore,
        hornStatus: values.hornStatus,
        color: values.color ?? "",
        temperament: values.temperament,
        penId: values.penId,
        microchip: values.microchip,
        acquiredFrom: values.acquiredFrom,
        acquiredAt: animal?.acquiredAt ?? TODAY,
        valuation: values.valuation,
        notes: values.notes,
        isCalf,
      };

      // Sensible defaults for a brand-new record so it isn't born broken.
      if (!editing) {
        patch.status = "active";
        patch.healthScore = 100;
        patch.lactationNumber = 0;
        patch.milkStatus = isCalf ? "heifer" : values.sex === "male" ? "not_applicable" : "dry";
        patch.reproStatus = isCalf || values.sex === "male" ? "not_applicable" : "open";
        patch.avgDailyMilkL = 0;
        patch.lifetimeMilkL = 0;
      }

      return getRepository().saveAnimal(patch);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries();
      toast.success(
        editing
          ? locale === "ar"
            ? "تم تحديث السجل"
            : "Animal updated"
          : locale === "ar"
            ? `تمت إضافة ${saved.tag}`
            : `${saved.tag} added to the herd`,
      );
      if (!editing) form.reset();
      setOpen(false);
    },
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
            <Plus /> {t("animals.newAnimal")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? t("animals.editAnimal") : t("animals.newAnimal")}
          </DialogTitle>
          <DialogDescription>
            {editing ? t("animals.editAnimalHint") : t("animals.newAnimalHint")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
          {/* Identity */}
          <Section title={t("animals.identity")}>
            <Field label={t("animals.tag")} error={form.formState.errors.tag?.message}>
              <Input placeholder="EG-1234" {...form.register("tag")} />
            </Field>
            <Field label={t("animals.rfid")}>
              <Input {...form.register("rfid")} />
            </Field>
            <Field label={t("animals.microchip")}>
              <Input {...form.register("microchip")} />
            </Field>
            <Field label={`${t("animals.title")} (EN)`} error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} />
            </Field>
            <Field label={`${t("animals.title")} (ع)`}>
              <Input dir="rtl" {...form.register("nameAr")} />
            </Field>
            <Field label={t("animals.sex")}>
              <SelectField
                value={form.watch("sex")}
                onChange={(v) => form.setValue("sex", v as FormValues["sex"])}
                options={[
                  { value: "female", label: t("status.female") },
                  { value: "male", label: t("status.male") },
                ]}
              />
            </Field>
          </Section>

          {/* Physical */}
          <Section title={t("animals.physical")}>
            <Field label={t("animals.breed")}>
              <SelectField
                value={form.watch("breed")}
                onChange={(v) => form.setValue("breed", v as FormValues["breed"])}
                options={BREEDS.map((b) => ({ value: b, label: t(`breeds.${b}`) }))}
              />
            </Field>
            <Field label={t("animals.dateOfBirth")} error={form.formState.errors.dateOfBirth?.message}>
              <Input type="date" {...form.register("dateOfBirth")} />
            </Field>
            <Field label={`${t("animals.weight")} (kg)`}>
              <Input type="number" step="1" {...form.register("weightKg")} />
            </Field>
            <Field label={t("animals.bcs")}>
              <Input type="number" step="0.25" {...form.register("bodyConditionScore")} />
            </Field>
            <Field label={t("animals.hornStatus")}>
              <SelectField
                value={form.watch("hornStatus")}
                onChange={(v) => form.setValue("hornStatus", v as FormValues["hornStatus"])}
                options={HORNS.map((h) => ({ value: h.value, label: locale === "ar" ? h.ar : h.en }))}
              />
            </Field>
            <Field label={t("animals.temperament")}>
              <SelectField
                value={form.watch("temperament")}
                onChange={(v) => form.setValue("temperament", v as FormValues["temperament"])}
                options={TEMPERAMENTS.map((tm) => ({
                  value: tm.value,
                  label: locale === "ar" ? tm.ar : tm.en,
                }))}
              />
            </Field>
            <Field label={t("animals.color")}>
              <Input {...form.register("color")} />
            </Field>
          </Section>

          {/* Placement */}
          <Section title={t("animals.status")}>
            <Field label={t("animals.pen")} error={form.formState.errors.penId?.message}>
              <SelectField
                value={form.watch("penId")}
                placeholder={t("common.select")}
                onChange={(v) => form.setValue("penId", v, { shouldValidate: true })}
                options={pens.map((p) => ({ value: p.id, label: locale === "ar" ? p.nameAr : p.name }))}
              />
            </Field>
            <Field label={t("animals.acquiredFrom")}>
              <SelectField
                value={form.watch("acquiredFrom")}
                onChange={(v) => form.setValue("acquiredFrom", v as FormValues["acquiredFrom"])}
                options={[
                  { value: "born_on_farm", label: t("animals.bornOnFarm") },
                  { value: "purchased", label: t("animals.purchased") },
                ]}
              />
            </Field>
            <Field label={t("animals.valuation")}>
              <Input type="number" step="100" {...form.register("valuation")} />
            </Field>
          </Section>

          <Field label={t("common.notes")}>
            <Textarea rows={2} {...form.register("notes")} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px]">{label}</Label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
}: {
  value?: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
