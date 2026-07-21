"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2, Wheat } from "lucide-react";
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
import { useRations, useZones, useFeedItems } from "@/hooks/use-farm-data";
import { getRepository } from "@/core/repositories";
import { kgPerUnit } from "@/core/domain/rules";
import { TODAY } from "@/core/data/seed";
import { round } from "@/lib/utils";

const schema = z.object({
  rationId: z.string().min(1, "Pick a ration"),
  zoneId: z.string().min(1, "Pick a pen"),
  heads: z.coerce.number().int().positive("Enter a head count"),
  date: z.string().min(10),
});

type FormValues = z.infer<typeof schema>;

/**
 * Logs a feeding of one ration to one pen.
 *
 * The operator picks the ration, the pen and how many head ate; the kilograms
 * and cost are computed from the ration, not entered — so a feeding always
 * draws exactly what it reports, and the silo and the books stay in step. The
 * preview shows both totals live so a wrong head count is caught before it
 * moves stock.
 */
export function LogFeedingDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { t, ln, locale, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const { data: rations = [] } = useRations();
  const { data: zones = [] } = useZones();
  const { data: feeds = [] } = useFeedItems();
  const pens = zones.filter((z) => z.kind === "pen" || z.kind === "barn");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { rationId: "", zoneId: "", heads: 0, date: TODAY },
  });

  const rationId = form.watch("rationId");
  const heads = form.watch("heads");
  const ration = rations.find((r) => r.id === rationId);

  // Mirror the repository's arithmetic so the preview and the write agree.
  const totals = React.useMemo(() => {
    if (!ration) return null;
    const n = Number(heads) || 0;
    let kg = 0;
    let cost = 0;
    for (const c of ration.components ?? []) {
      const componentKg = c.kgPerHead * n;
      kg += componentKg;
      const feed = feeds.find((f) => f.id === c.feedItemId);
      // Cost is per unit (ton/bale); the ration is in kg. Convert before costing.
      if (feed) cost += (componentKg / kgPerUnit(feed.unit)) * (feed.costPerUnit ?? 0);
    }
    return { kg: round(kg, 1), cost: round(cost, 2) };
  }, [ration, heads, feeds]);

  const save = useMutation({
    mutationFn: async (values: FormValues) =>
      getRepository().logFeedConsumption({
        date: values.date,
        zoneId: values.zoneId,
        rationId: values.rationId,
        heads: values.heads,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(locale === "ar" ? "تم تسجيل التغذية" : "Feeding recorded");
      form.reset({ rationId: "", zoneId: "", heads: 0, date: TODAY });
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
            <Wheat /> {t("feed.logFeeding")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("feed.logFeeding")}</DialogTitle>
          <DialogDescription>{t("feed.logFeedingHint")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>{t("feed.ration")}</Label>
            <Select
              value={rationId}
              onValueChange={(v) => form.setValue("rationId", v, { shouldValidate: true })}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder={t("common.select")} />
              </SelectTrigger>
              <SelectContent>
                {rations.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {ln(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.rationId && (
              <p className="text-[11px] text-destructive">
                {form.formState.errors.rationId.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("feed.pen")}</Label>
              <Select
                value={form.watch("zoneId")}
                onValueChange={(v) => form.setValue("zoneId", v, { shouldValidate: true })}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder={t("common.select")} />
                </SelectTrigger>
                <SelectContent>
                  {pens.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {ln(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.zoneId && (
                <p className="text-[11px] text-destructive">
                  {form.formState.errors.zoneId.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="heads">{t("feed.heads")}</Label>
              <Input id="heads" type="number" inputMode="numeric" {...form.register("heads")} />
              {form.formState.errors.heads && (
                <p className="text-[11px] text-destructive">
                  {form.formState.errors.heads.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fdate">{t("common.date")}</Label>
            <Input id="fdate" type="date" {...form.register("date")} />
          </div>

          {totals && Number(heads) > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px]">
              <span>
                <span className="text-muted-foreground">{t("feed.totalFed")} </span>
                <span className="tabular font-semibold">{formatNumber(totals.kg)} kg</span>
              </span>
              <span>
                <span className="text-muted-foreground">{t("feed.estCost")} </span>
                <span className="tabular font-semibold">EGP {formatNumber(totals.cost)}</span>
              </span>
            </div>
          )}

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
