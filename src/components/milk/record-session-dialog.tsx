"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Check, Loader2, Milk, Search, Sunrise, Sunset } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Label, Progress } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import { useAnimals } from "@/hooks/use-farm-data";
import { getRepository } from "@/core/repositories";
import { TODAY } from "@/core/data/seed";
import { cn, round, sum } from "@/lib/utils";

const schema = z.object({
  date: z.string().min(10),
  session: z.enum(["morning", "evening"]),
  fatPct: z.coerce.number().min(0).max(15),
  proteinPct: z.coerce.number().min(0).max(10),
  somaticCellCount: z.coerce.number().min(0).max(5_000_000),
  temperatureC: z.coerce.number().min(0).max(20),
});

type FormValues = z.infer<typeof schema>;

/**
 * Parlor entry.
 *
 * Designed for a wet thumb on a phone at 5am: one row per animal, a number pad,
 * and a running total that has to look right before Save unlocks. Volumes above
 * 40 L are flagged rather than blocked — a mis-key is common, but so is a
 * genuinely exceptional cow, and the software shouldn't overrule the milker.
 */
export function RecordSessionDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { t, ln, locale, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [volumes, setVolumes] = React.useState<Record<string, string>>({});

  const { data: page } = useAnimals({ milkStatus: "lactating", pageSize: 100000 });
  const lactating = React.useMemo(() => page?.items ?? [], [page]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: TODAY,
      session: new Date().getHours() < 12 ? "morning" : "evening",
      fatPct: 6.8,
      proteinPct: 4.2,
      somaticCellCount: 180000,
      temperatureC: 3.9,
    },
  });

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lactating.slice(0, 60);
    return lactating
      .filter((a) => `${a.tag} ${a.name} ${a.nameAr}`.toLowerCase().includes(q))
      .slice(0, 60);
  }, [lactating, search]);

  const entries = Object.entries(volumes)
    .map(([animalId, raw]) => ({ animalId, volumeL: Number(raw) }))
    .filter((e) => Number.isFinite(e.volumeL) && e.volumeL > 0);

  const total = round(sum(entries.map((e) => e.volumeL)), 1);
  const outliers = entries.filter((e) => e.volumeL > 40);

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      getRepository().recordMilkSession({
        date: values.date,
        session: values.session,
        entries,
        fatPct: values.fatPct,
        proteinPct: values.proteinPct,
        somaticCellCount: values.somaticCellCount,
        temperatureC: values.temperatureC,
      }),
    onSuccess: (outcome) => {
      // Milk feeds the dashboard, the milk screen and every animal profile.
      // Invalidating the root refetches whatever the user is actually looking at
      // — offline this serves the just-written values straight from the cache.
      queryClient.invalidateQueries();
      const n = formatNumber(total);
      const heads = formatNumber(entries.length);
      // "Queued" is a success, not a warning: the data is safe on the device and
      // the milker can keep going. Saying so plainly is what earns their trust
      // in a parlor where the signal comes and goes.
      if (outcome === "queued") {
        toast.success(
          locale === "ar"
            ? `تم حفظ ${n} لتر على الجهاز — ستتم المزامنة عند عودة الاتصال`
            : `${n} L saved on device — will sync when you're back online`,
        );
      } else {
        toast.success(
          locale === "ar"
            ? `تم تسجيل ${n} لتر من ${heads} رأس`
            : `Recorded ${n} L from ${heads} animals`,
        );
      }
      setVolumes({});
      setOpen(false);
    },
    onError: () => {
      toast.error(
        locale === "ar"
          ? "تعذر الحفظ — تحقق من الاتصال وحاول مرة أخرى."
          : "Couldn't save — check your connection and try again.",
      );
    },
  });

  const session = form.watch("session");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Milk /> {t("milk.recordSession")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("milk.recordSession")}</DialogTitle>
          <DialogDescription>
            {formatNumber(lactating.length)} {t("status.lactating").toLowerCase()} ·{" "}
            {t("milk.dailyTotal")} {formatNumber(total)} {t("common.liters")}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="space-y-4"
        >
          {/* ------------------------- Session header ------------------------ */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 space-y-1.5 sm:col-span-1">
              <Label htmlFor="date">{t("common.date")}</Label>
              <Input id="date" type="date" {...form.register("date")} />
            </div>

            <div className="col-span-2 space-y-1.5 sm:col-span-1">
              <Label>{t("milk.session")}</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {(["morning", "evening"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => form.setValue("session", s)}
                    className={cn(
                      "flex h-9 items-center justify-center gap-1.5 rounded-lg border text-[12.5px] font-medium transition",
                      session === s
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-input text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {s === "morning" ? (
                      <Sunrise className="size-3.5" />
                    ) : (
                      <Sunset className="size-3.5" />
                    )}
                    {t(`milk.${s}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fat">{t("milk.fat")} %</Label>
              <Input id="fat" type="number" step="0.1" {...form.register("fatPct")} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="temp">{t("milk.tankTemp")}</Label>
              <Input id="temp" type="number" step="0.1" {...form.register("temperatureC")} />
            </div>
          </div>

          {/* --------------------------- Animal rows ------------------------- */}
          <div className="rounded-xl border border-border">
            <div className="relative border-b border-border p-2">
              <Search className="pointer-events-none absolute start-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("animals.tag")}
                className="h-8 ps-8 text-[13px]"
              />
            </div>

            <div className="max-h-[280px] overflow-y-auto p-1.5">
              {filtered.map((animal) => {
                const value = volumes[animal.id] ?? "";
                const numeric = Number(value);
                const high = Number.isFinite(numeric) && numeric > 40;
                return (
                  <div
                    key={animal.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/40"
                  >
                    <span className="tabular w-20 shrink-0 text-[12.5px] font-medium">
                      {animal.tag}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                      {ln(animal)}
                    </span>
                    <span className="tabular hidden w-16 shrink-0 text-end text-[11px] text-muted-foreground sm:block">
                      ~{formatNumber(animal.avgDailyMilkL / 2)}
                    </span>
                    <Input
                      value={value}
                      onChange={(e) =>
                        setVolumes((v) => ({ ...v, [animal.id]: e.target.value }))
                      }
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      placeholder="0.0"
                      className={cn(
                        "tabular h-8 w-20 shrink-0 text-end text-[13px]",
                        high && "border-[var(--warning)] focus-visible:ring-[var(--warning)]/25",
                      )}
                    />
                  </div>
                );
              })}
              {!filtered.length && (
                <p className="py-8 text-center text-[12px] text-muted-foreground">
                  {t("common.noResults")}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-border px-3 py-2">
              <div className="min-w-0 flex-1">
                <Progress
                  value={(entries.length / Math.max(1, lactating.length)) * 100}
                  className="h-1.5"
                />
              </div>
              <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                {formatNumber(entries.length)} / {formatNumber(lactating.length)}
              </span>
              <Badge variant="default" className="tabular shrink-0">
                {formatNumber(total)} {t("common.liters")}
              </Badge>
            </div>
          </div>

          {outliers.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--warning)_10%,transparent)] p-2.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--warning)]" />
              <p className="text-[11.5px] leading-relaxed">
                {locale === "ar"
                  ? `${outliers.length} قيمة فوق ٤٠ لتر — تحقق قبل الحفظ.`
                  : `${outliers.length} ${outliers.length === 1 ? "entry is" : "entries are"} above 40 L. Worth a second look before saving.`}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!entries.length || save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
