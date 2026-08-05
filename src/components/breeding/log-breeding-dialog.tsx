"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, HeartPulse, Loader2, CalendarClock } from "lucide-react";
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
import { AnimalPicker } from "@/components/common/animal-picker";
import { useI18n } from "@/lib/i18n/provider";
import { useSemen } from "@/hooks/use-farm-data";
import { getRepository } from "@/core/repositories";
import { GESTATION_DAYS } from "@/core/domain/rules";
import { TODAY } from "@/core/data/seed";
import { addDays } from "@/lib/date";
import type { Animal, BreedingEvent, ID } from "@/core/domain/types";

const TYPES = [
  "heat",
  "ai",
  "natural_mating",
  "pregnancy_check",
  "calving",
  "abortion",
  "dry_off",
] as const;

const schema = z.object({
  animalId: z.string().min(1, "Pick an animal"),
  type: z.enum(TYPES),
  date: z.string().min(10),
  semenBatch: z.string().optional(),
  sireId: z.string().optional(),
  technician: z.string().optional(),
  result: z.enum(["pregnant", "open", "inconclusive"]).optional(),
  outcome: z.enum(["live", "stillbirth", "twins", "died_24h"]).optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Logs a reproduction event.
 *
 * Every option here moves the cow's reproductive state, which is why the form
 * shows what that move will be before you commit it. Getting repro status wrong
 * is expensive and slow to notice — a cow wrongly marked pregnant is simply
 * never bred again until someone wonders why she didn't calve.
 */
export function LogBreedingDialog({
  trigger,
  animalId,
}: {
  trigger?: React.ReactNode;
  animalId?: ID;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  // Held so the preview can date gestation from her actual service, the same
  // way the domain rule does.
  const [animal, setAnimal] = React.useState<Animal | null>(null);
  const { data: semen = [] } = useSemen();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { animalId: animalId ?? "", type: "ai", date: TODAY },
  });

  const type = form.watch("type");
  const date = form.watch("date");
  const result = form.watch("result");

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const event: Omit<BreedingEvent, "id" | "farmId"> = {
        animalId: values.animalId,
        type: values.type,
        date: values.date,
        semenBatch: values.semenBatch,
        sireId: values.sireId,
        technician: values.technician,
        result: values.result,
        outcome: values.outcome,
        notes: values.notes,
      };
      return getRepository().saveBreedingEvent(event);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(locale === "ar" ? "تم تسجيل الحدث التناسلي" : "Breeding event recorded");
      form.reset();
      setOpen(false);
    },
    onError: (error) =>
      toast.error(
        error.message ||
          (locale === "ar" ? "تعذر الحفظ. حاول مرة أخرى." : "Couldn't save. Try again."),
      ),
  });

  /** What this event will do to the cow, in plain language, before saving. */
  const consequence = React.useMemo(() => {
    switch (type) {
      case "heat":
        return locale === "ar" ? "الحالة ← فارغة" : "Status → open";
      case "ai":
      case "natural_mating":
        return locale === "ar" ? "الحالة ← ملقّحة، تُحتسب خدمة" : "Status → inseminated, +1 service";
      case "pregnancy_check":
        if (result === "pregnant") {
          // Gestation runs from the service, not the check that confirmed it.
          // Showing the check date here would overstate the due date by however
          // long the confirmation took — often six weeks.
          const due = addDays(animal?.lastServiceDate ?? date, GESTATION_DAYS);
          return locale === "ar"
            ? `الحالة ← عشار، الولادة المتوقعة ${due}`
            : `Status → pregnant, due ${due}`;
        }
        if (result === "open") {
          return locale === "ar" ? "الحالة ← فارغة، إلغاء موعد الولادة" : "Status → open, due date cleared";
        }
        return locale === "ar" ? "اختر النتيجة" : "Pick a result";
      case "calving":
        return locale === "ar"
          ? "الحالة ← حديثة الولادة وحلوب، +1 موسم"
          : "Status → fresh + lactating, lactation +1";
      case "abortion":
        return locale === "ar" ? "الحالة ← فارغة، إلغاء موعد الولادة" : "Status → open, due date cleared";
      case "dry_off":
        return locale === "ar" ? "حالة الحليب ← جافة" : "Milk status → dry";
      default:
        return "";
    }
  }, [type, result, date, locale, animal]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <HeartPulse /> {t("breeding.logEvent")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("breeding.logEvent")}</DialogTitle>
          <DialogDescription>{t("breeding.logEventHint")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>{t("animals.title")}</Label>
            <AnimalPicker
              value={form.watch("animalId")}
              onChange={(id, a) => {
                form.setValue("animalId", id, { shouldValidate: true });
                setAnimal(a);
              }}
              // Reproduction events only apply to living females.
              filter={(a) => a.sex === "female" && a.status !== "dead" && a.status !== "sold"}
            />
            {form.formState.errors.animalId && (
              <p className="text-[11.5px] text-destructive">
                {form.formState.errors.animalId.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="breeding-type">{t("common.type")}</Label>
              <Select
                value={type}
                onValueChange={(v) => form.setValue("type", v as FormValues["type"])}
              >
                <SelectTrigger id="breeding-type" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`breeding.type.${v}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bdate">{t("common.date")}</Label>
              <Input id="bdate" type="date" {...form.register("date")} />
            </div>
          </div>

          {(type === "ai" || type === "natural_mating") && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="breeding-semen-batch">{t("breeding.semenBatch")}</Label>
                <Select onValueChange={(v) => form.setValue("semenBatch", v)}>
                  <SelectTrigger id="breeding-semen-batch" size="sm">
                    <SelectValue placeholder={t("common.select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {semen.map((s) => (
                      <SelectItem key={s.id} value={s.batch}>
                        {s.sireName} · {s.batch} ({s.quantity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tech">{t("breeding.technician")}</Label>
                <Input id="tech" {...form.register("technician")} />
              </div>
            </div>
          )}

          {type === "pregnancy_check" && (
            <div className="space-y-1.5">
              <Label htmlFor="breeding-result">{t("breeding.result")}</Label>
              <Select onValueChange={(v) => form.setValue("result", v as FormValues["result"])}>
                <SelectTrigger id="breeding-result" size="sm">
                  <SelectValue placeholder={t("common.select")} />
                </SelectTrigger>
                <SelectContent>
                  {(["pregnant", "open", "inconclusive"] as const).map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`breeding.resultOption.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {type === "calving" && (
            <div className="space-y-1.5">
              <Label htmlFor="breeding-outcome">{t("breeding.outcome")}</Label>
              <Select onValueChange={(v) => form.setValue("outcome", v as FormValues["outcome"])}>
                <SelectTrigger id="breeding-outcome" size="sm">
                  <SelectValue placeholder={t("common.select")} />
                </SelectTrigger>
                <SelectContent>
                  {(["live", "twins", "stillbirth", "died_24h"] as const).map((o) => (
                    <SelectItem key={o} value={o}>
                      {t(`breeding.outcomeOption.${o}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Say what this will do before it's done. Repro status errors are
              slow to surface and expensive when they do. */}
          {consequence && (
            <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] p-2.5">
              <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <p className="text-[11.5px] leading-relaxed">{consequence}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="bnotes">{t("common.notes")}</Label>
            <Textarea id="bnotes" rows={2} {...form.register("notes")} />
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
