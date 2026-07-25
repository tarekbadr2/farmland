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

const schema = z.object({
  tag: z.string().min(1, "Required").regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  sex: z.enum(["female", "male"]),
  breed: z.enum(BREEDS),
  dateOfBirth: z.string().min(10),
  weightKg: z.coerce.number().min(0).max(1500),
  penId: z.string().min(1, "Required"),
  microchip: z.string().optional(),
  acquiredFrom: z.enum(["born_on_farm", "purchased"]),
  /** Date the animal entered the farm — only meaningful when purchased. */
  acquiredAt: z.string().optional(),
  valuation: z.coerce.number().min(0),
  purpose: z.enum(["dairy", "meat", "breeding"]).optional(),
  acquisitionCost: z.coerce.number().min(0).optional(),
  acquisitionWeightKg: z.coerce.number().min(0).max(1500).optional(),
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
          sex: animal.sex,
          breed: animal.breed,
          dateOfBirth: animal.dateOfBirth,
          weightKg: animal.weightKg,
          penId: animal.penId,
          acquiredFrom: animal.acquiredFrom ?? "born_on_farm",
          acquiredAt: animal.acquiredAt,
          valuation: animal.valuation,
          purpose: animal.purpose,
          acquisitionCost: animal.acquisitionCost,
          acquisitionWeightKg: animal.acquisitionWeightKg,
          notes: animal.notes,
        }
      : {
          sex: "female",
          breed: "murrah",
          dateOfBirth: TODAY,
          weightKg: 40,
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
        // The tag IS the animal's identity now — name mirrors it so every list,
        // report and detail view that shows a name shows the tag. rfid/microchip
        // are no longer collected; preserve anything already on the record.
        name: values.tag.trim(),
        nameAr: values.tag.trim(),
        rfid: animal?.rfid ?? "",
        microchip: animal?.microchip,
        sex: values.sex,
        breed: values.breed,
        dateOfBirth: values.dateOfBirth,
        weightKg: values.weightKg,
        penId: values.penId,
        acquiredFrom: values.acquiredFrom,
        // Farm-entry date: the chosen date for a purchase, else the birth date
        // (a born-on-farm animal "entered" the herd when it was born).
        acquiredAt:
          values.acquiredFrom === "purchased"
            ? values.acquiredAt || animal?.acquiredAt || TODAY
            : values.dateOfBirth,
        valuation: values.valuation,
        purpose: values.purpose,
        acquisitionCost: values.acquisitionCost || undefined,
        acquisitionWeightKg: values.acquisitionWeightKg || undefined,
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
            {form.watch("acquiredFrom") === "purchased" && (
              <Field label={t("animals.entryDate")}>
                <Input type="date" {...form.register("acquiredAt")} />
              </Field>
            )}
            <Field label={t("animals.valuation")}>
              <Input type="number" step="100" {...form.register("valuation")} />
            </Field>
          </Section>

          {/* Economics — drives cost/kg (meat) and cost/litre (dairy) */}
          <Section title={locale === "ar" ? "الاقتصاد" : "Economics"}>
            <Field label={locale === "ar" ? "الغرض" : "Raised for"}>
              <SelectField
                value={form.watch("purpose")}
                placeholder={locale === "ar" ? "تلقائي" : "Auto"}
                onChange={(v) => form.setValue("purpose", v as FormValues["purpose"])}
                options={[
                  { value: "dairy", label: locale === "ar" ? "حليب" : "Dairy" },
                  { value: "meat", label: locale === "ar" ? "لحم" : "Meat" },
                  { value: "breeding", label: locale === "ar" ? "تربية" : "Breeding" },
                ]}
              />
            </Field>
            <Field label={locale === "ar" ? "سعر الشراء (ج.م)" : "Purchase price (EGP)"}>
              <Input type="number" step="100" placeholder="0" {...form.register("acquisitionCost")} />
            </Field>
            <Field label={locale === "ar" ? "وزن الشراء (كجم)" : "Purchase weight (kg)"}>
              <Input type="number" step="1" placeholder="0" {...form.register("acquisitionWeightKg")} />
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
