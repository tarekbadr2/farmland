"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2, Stethoscope, TriangleAlert } from "lucide-react";
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
import { Textarea } from "@/components/ui/input";
import { Label, Switch } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/menu";
import { AnimalPicker } from "@/components/common/animal-picker";
import { useI18n } from "@/lib/i18n/provider";
import { getRepository } from "@/core/repositories";
import { TODAY } from "@/core/data/seed";
import { addDays } from "@/lib/date";
import type { HealthEvent, ID } from "@/core/domain/types";

const TYPES = ["diagnosis", "treatment", "vaccination", "vet_visit", "lab_result"] as const;
const DISEASES = [
  "mastitis",
  "lameness",
  "metritis",
  "milk_fever",
  "ketosis",
  "pneumonia",
  "diarrhea",
  "bloat",
  "fmd",
  "brucellosis",
] as const;

const schema = z.object({
  animalId: z.string().min(1, "Pick an animal"),
  type: z.enum(TYPES),
  date: z.string().min(10),
  disease: z.string().optional(),
  vaccine: z.string().optional(),
  medication: z.string().optional(),
  dosage: z.string().optional(),
  vetName: z.string().optional(),
  cost: z.coerce.number().min(0),
  temperatureC: z.coerce.number().min(0).max(45).optional(),
  heartRate: z.coerce.number().min(0).max(200).optional(),
  respiration: z.coerce.number().min(0).max(120).optional(),
  withdrawalDays: z.coerce.number().min(0).max(90),
  outcome: z.enum(["recovered", "ongoing", "chronic", "died"]).optional(),
  isolation: z.boolean(),
  nextDueDays: z.coerce.number().min(0).max(730),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Logs a clinical event against one animal.
 *
 * The form deliberately leads with the withdrawal period rather than burying it:
 * treating a cow and forgetting her milk is barred from the tank is the single
 * most expensive mistake on a dairy — one animal can condemn a whole collection.
 */
export function LogHealthDialog({
  trigger,
  animalId,
}: {
  trigger?: React.ReactNode;
  animalId?: ID;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      animalId: animalId ?? "",
      type: "diagnosis",
      date: TODAY,
      cost: 0,
      withdrawalDays: 0,
      nextDueDays: 0,
      isolation: false,
    },
  });

  const type = form.watch("type");
  const withdrawalDays = form.watch("withdrawalDays");
  const date = form.watch("date");

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const event: Omit<HealthEvent, "id" | "farmId"> = {
        animalId: values.animalId,
        type: values.type,
        date: values.date,
        disease: values.disease as HealthEvent["disease"],
        vaccine: values.vaccine,
        medication: values.medication,
        dosage: values.dosage,
        vetName: values.vetName,
        cost: values.cost,
        outcome: values.outcome,
        isolation: values.isolation,
        notes: values.notes,
        vitals:
          values.temperatureC || values.heartRate || values.respiration
            ? {
                temperatureC: values.temperatureC,
                heartRate: values.heartRate,
                respiration: values.respiration,
              }
            : undefined,
        withdrawalUntil:
          values.withdrawalDays > 0 ? addDays(values.date, values.withdrawalDays) : undefined,
        nextDueDate: values.nextDueDays > 0 ? addDays(values.date, values.nextDueDays) : undefined,
      };
      return getRepository().saveHealthEvent(event);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(locale === "ar" ? "تم تسجيل الحدث الصحي" : "Health event recorded");
      form.reset();
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
            <Stethoscope /> {t("health.logEvent")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("health.logEvent")}</DialogTitle>
          <DialogDescription>{t("health.logEventHint")}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="space-y-3.5"
        >
          <div className="space-y-1.5">
            <Label htmlFor="health-animal">{t("animals.title")}</Label>
            <AnimalPicker
              id="health-animal"
              value={form.watch("animalId")}
              onChange={(id) => form.setValue("animalId", id, { shouldValidate: true })}
              filter={(a) => !["dead", "sold", "culled"].includes(a.status)}
            />
            {form.formState.errors.animalId && (
              <p className="text-[11.5px] text-destructive">
                {form.formState.errors.animalId.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="health-type">{t("common.type")}</Label>
              <Select
                value={type}
                onValueChange={(v) => form.setValue("type", v as FormValues["type"])}
              >
                <SelectTrigger id="health-type" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`health.type.${v}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">{t("common.date")}</Label>
              <Input id="date" type="date" {...form.register("date")} />
            </div>
          </div>

          {/* Fields that only make sense for this event type. Showing every
              field for every type is how forms become unanswerable. */}
          {type === "diagnosis" && (
            <div className="space-y-1.5">
              <Label htmlFor="health-disease">{t("health.disease")}</Label>
              <Select onValueChange={(v) => form.setValue("disease", v)}>
                <SelectTrigger id="health-disease" size="sm">
                  <SelectValue placeholder={t("common.select")} />
                </SelectTrigger>
                <SelectContent>
                  {DISEASES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {t(`disease.${d}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {type === "vaccination" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="vaccine">{t("health.vaccine")}</Label>
                <Input id="vaccine" placeholder="FMD" {...form.register("vaccine")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nextDue">{t("health.boosterDays")}</Label>
                <Input id="nextDue" type="number" {...form.register("nextDueDays")} />
              </div>
            </div>
          )}

          {(type === "treatment" || type === "diagnosis") && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="medication">{t("health.medication")}</Label>
                <Input id="medication" {...form.register("medication")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dosage">{t("health.dosage")}</Label>
                <Input id="dosage" placeholder="20 ml IM" {...form.register("dosage")} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="temp">{t("health.temp")}</Label>
              <Input id="temp" type="number" step="0.1" {...form.register("temperatureC")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr">{t("health.heartRate")}</Label>
              <Input id="hr" type="number" {...form.register("heartRate")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resp">{t("health.respiration")}</Label>
              <Input id="resp" type="number" {...form.register("respiration")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vet">{t("health.vet")}</Label>
              <Input id="vet" {...form.register("vetName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost">{t("common.cost")}</Label>
              <Input id="cost" type="number" step="1" {...form.register("cost")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="withdrawal">{t("health.withdrawalDays")}</Label>
              <Input id="withdrawal" type="number" {...form.register("withdrawalDays")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="health-outcome">{t("health.outcomeLabel")}</Label>
              <Select
                onValueChange={(v) => form.setValue("outcome", v as FormValues["outcome"])}
              >
                <SelectTrigger id="health-outcome" size="sm">
                  <SelectValue placeholder={t("common.select")} />
                </SelectTrigger>
                <SelectContent>
                  {(["recovered", "ongoing", "chronic", "died"] as const).map((o) => (
                    <SelectItem key={o} value={o}>
                      {t(`health.outcome.${o}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {withdrawalDays > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--warning)_10%,transparent)] p-2.5">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--warning)]" />
              <p className="text-[11.5px] leading-relaxed">
                {locale === "ar"
                  ? `لا يدخل حليب هذه الجاموسة الخزان حتى ${addDays(date, withdrawalDays)}.`
                  : `Milk from this animal must not enter the tank until ${addDays(date, withdrawalDays)}.`}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <Label htmlFor="health-isolation" className="text-[13px]">{t("health.isolate")}</Label>
              <p className="text-[11px] text-muted-foreground">{t("health.isolateHint")}</p>
            </div>
            <Switch
              id="health-isolation"
              checked={form.watch("isolation")}
              onCheckedChange={(v) => form.setValue("isolation", v)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">{t("common.notes")}</Label>
            <Textarea id="notes" rows={2} {...form.register("notes")} />
          </div>

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
