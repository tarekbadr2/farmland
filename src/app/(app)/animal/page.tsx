"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  Baby,
  Beef,
  CalendarDays,
  Dna,
  Droplets,
  FileText,
  HeartPulse,
  ImageIcon,
  MapPin,
  Pencil,
  Scale,
  Shield,
  Syringe,
  TrendingUp,
  Wallet,
  LogOut,
} from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { ChartCard, ChartTooltip, axisProps, gridProps } from "@/components/common/chart";
import { StatCard } from "@/components/common/stat-card";
import { AnimalFormDialog } from "@/components/animals/animal-form-dialog";
import { LogHealthDialog } from "@/components/health/log-health-dialog";
import {
  AnimalStatusPill,
  HealthScore,
  MilkStatusPill,
  ReproStatusPill,
} from "@/components/common/status-pill";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Skeleton,
  Separator,
} from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import {
  useAnimal,
  useAnimalMilk,
  useAnimalTimeline,
  useAnimalWeight,
  useBreeding,
  useFeedConsumption,
  useHealth,
  useZones,
} from "@/hooks/use-farm-data";
import { animalEconomics } from "@/core/services/metrics";
import { DisposeAnimalDialog } from "@/components/animals/dispose-animal-dialog";
import { TODAY, woodsCurve } from "@/core/data/seed";
import { peakFromCurrent } from "@/core/repositories/demo-repository";
import { ageFromDOB, diffDays, formatDate, relativeDays } from "@/lib/date";
import { groupBy, round, sum } from "@/lib/utils";

function AnimalProfileInner() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const { t, ln, locale, formatNumber, formatCurrency } = useI18n();

  const { data: animal, isLoading } = useAnimal(id);
  const { data: timeline } = useAnimalTimeline(id);
  const { data: milk } = useAnimalMilk(id);
  const { data: weights } = useAnimalWeight(id);
  const { data: health } = useHealth();
  const { data: breeding } = useBreeding();
  const { data: zones } = useZones();
  const { data: feedConsumption } = useFeedConsumption();
  const { data: dam } = useAnimal(animal?.motherId ?? "");
  const { data: sire } = useAnimal(animal?.fatherId ?? "");

  const dailyMilk = React.useMemo(() => {
    if (!milk?.length) return [];
    const byDate = groupBy(milk, (m) => m.date);
    return Object.entries(byDate)
      .map(([date, records]) => ({
        date,
        totalL: round(records.reduce((s, r) => s + r.volumeL, 0), 2),
        fat: round(records.reduce((s, r) => s + r.fatPct, 0) / records.length, 2),
        scc: Math.round(records.reduce((s, r) => s + r.somaticCellCount, 0) / records.length),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [milk]);

  const lactationCurve = React.useMemo(() => {
    if (!animal?.lastCalvingDate) return [];
    const dim = diffDays(TODAY, animal.lastCalvingDate);
    const peak = peakFromCurrent(animal.avgDailyMilkL, Math.max(dim, 1));
    return dailyMilk.map((d) => {
      const t0 = dim - diffDays(TODAY, d.date);
      return { ...d, expected: round(woodsCurve(t0, peak), 2) };
    });
  }, [animal, dailyMilk]);

  const animalHealth = React.useMemo(
    () => (health ?? []).filter((h) => h.animalId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [health, id],
  );
  const animalBreeding = React.useMemo(
    () => (breeding ?? []).filter((b) => b.animalId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [breeding, id],
  );

  if (isLoading) return <ProfileSkeleton />;

  if (!animal) {
    return (
      <Card className="p-12 text-center">
        <p className="text-[15px] font-medium">{t("animals.notFound")}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/animals")}>
          {t("common.back")}
        </Button>
      </Card>
    );
  }

  const age = ageFromDOB(animal.dateOfBirth, TODAY);
  const dim = animal.lastCalvingDate ? diffDays(TODAY, animal.lastCalvingDate) : 0;
  const pen = zones?.find((z) => z.id === animal.penId);

  const econ = animalEconomics({
    animal,
    health: animalHealth,
    feedConsumption: feedConsumption ?? [],
    litres: round(sum((milk ?? []).map((m) => m.volumeL)), 1),
    today: TODAY,
  });
  const active = animal.status === "active" || animal.status === "quarantine";
  const ar = locale === "ar";

  const facts: { label: string; value: React.ReactNode; icon?: typeof Beef }[] = [
    { label: t("animals.breed"), value: t(`breeds.${animal.breed}`) },
    { label: t("animals.bloodline"), value: animal.bloodline ?? "—" },
    { label: t("animals.sex"), value: t(`status.${animal.sex}`) },
    {
      label: t("common.date"),
      value: formatDate(animal.dateOfBirth, locale),
      icon: CalendarDays,
    },
    { label: t("animals.pen"), value: pen ? ln(pen) : "—", icon: MapPin },
    { label: t("animals.mother"), value: <ParentLink parent={dam} /> },
    { label: t("animals.father"), value: <ParentLink parent={sire} /> },
    {
      label: t("animals.acquiredFrom"),
      value:
        animal.acquiredFrom === "purchased" ? t("animals.purchased") : t("animals.bornOnFarm"),
    },
    ...(animal.acquiredFrom === "purchased"
      ? [
          {
            label: t("animals.entryDate"),
            value: formatDate(animal.acquiredAt, locale),
            icon: CalendarDays,
          },
        ]
      : []),
  ];

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mb-2 -ms-2 text-muted-foreground"
        onClick={() => router.push("/animals")}
      >
        <ArrowLeft className="rtl:-scale-x-100" /> {t("nav.animals")}
      </Button>

      <PageHeader
        title={animal.tag}
        subtitle={`${t(`breeds.${animal.breed}`)} · ${age.years}y ${age.months}m · ${pen ? ln(pen) : ""}`}
        actions={
          <>
            <LogHealthDialog
              animalId={animal.id}
              trigger={
                <Button variant="outline" size="sm">
                  <Syringe /> {t("health.logEvent")}
                </Button>
              }
            />
            {active && (
              <DisposeAnimalDialog
                animal={animal}
                trigger={
                  <Button variant="outline" size="sm">
                    <LogOut /> {locale === "ar" ? "خروج من القطيع" : "Record exit"}
                  </Button>
                }
              />
            )}
            <AnimalFormDialog
              animal={animal}
              trigger={
                <Button size="sm">
                  <Pencil /> {t("common.edit")}
                </Button>
              }
            />
          </>
        }
      />

      {/* --------------------------- Identity header --------------------------- */}
      <motion.div variants={cardIn} initial="hidden" animate="show">
        <Card className="mb-4 overflow-hidden">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
              <Beef className="size-9 text-primary/70" />
              <span className="absolute bottom-1 end-1 rounded bg-background/80 px-1 text-[9px] font-medium backdrop-blur">
                {animal.tag.slice(-3)}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <AnimalStatusPill value={animal.status} />
                <MilkStatusPill value={animal.milkStatus} />
                <ReproStatusPill value={animal.reproStatus} />
                {animal.gpsCollar && (
                  <Badge variant="outline">
                    <MapPin /> GPS
                  </Badge>
                )}
                {animal.insurance && (
                  <Badge variant="outline">
                    <Shield /> {t("animals.insurance")}
                  </Badge>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                <Metric label={t("animals.dailyMilk")} value={`${formatNumber(animal.avgDailyMilkL)} ${t("common.liters")}`} />
                <Metric label={t("animals.weight")} value={`${formatNumber(animal.weightKg)} ${t("common.kg")}`} />
                <Metric label={t("animals.lactation")} value={formatNumber(animal.lactationNumber)} />
              </div>
            </div>

            <div className="shrink-0 sm:w-40">
              <p className="mb-1.5 text-[11px] text-muted-foreground">{t("animals.healthScore")}</p>
              <HealthScore value={animal.healthScore} />
              {animal.expectedCalvingDate && (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {t("animals.dueDate")}:{" "}
                  <span className="font-medium text-foreground">
                    {relativeDays(animal.expectedCalvingDate, TODAY, locale)}
                  </span>
                </p>
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <StatCard
          label={t("animals.dim")}
          value={formatNumber(dim)}
          unit={t("common.days")}
          icon={Droplets}
          tone="info"
        />
        <StatCard
          label={t("animals.lifetimeMilk")}
          value={formatNumber(animal.lifetimeMilkL)}
          unit={t("common.liters")}
          icon={Droplets}
          tone="success"
        />
        <StatCard
          label={t("animals.valuation")}
          value={formatCurrency(animal.valuation)}
          icon={Wallet}
        />
        <StatCard
          label={t("health.treatments")}
          value={formatNumber(animalHealth.filter((h) => h.type === "diagnosis").length)}
          icon={HeartPulse}
          tone={animalHealth.some((h) => h.outcome === "ongoing") ? "warning" : "default"}
        />
      </motion.div>

      {/* ------------------------ Cost & profitability ------------------------- */}
      <motion.div variants={cardIn} initial="hidden" animate="show" className="mb-4">
        <Card>
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-4 text-primary" />
                {ar ? "التكلفة والربحية" : "Cost & profitability"}
              </CardTitle>
              <CardDescription>
                {econ.purpose === "meat"
                  ? ar ? "تسمين — تكلفة إنتاج الكيلو" : "Fattening — cost to produce a kilo"
                  : econ.purpose === "dairy"
                    ? ar ? "حلوب — تكلفة إنتاج اللتر" : "Dairy — cost to produce a litre"
                    : ar ? "تربية" : "Breeding"}
              </CardDescription>
            </div>
            <Badge variant="outline">
              {econ.purpose === "meat"
                ? ar ? "لحم" : "Meat"
                : econ.purpose === "dairy"
                  ? ar ? "حليب" : "Dairy"
                  : ar ? "تربية" : "Breeding"}
            </Badge>
          </div>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Metric label={ar ? "سعر الشراء" : "Purchase"} value={formatCurrency(econ.purchaseCost)} />
              <Metric label={ar ? "العلف (مُوزَّع)" : "Feed (allocated)"} value={formatCurrency(econ.feedCost)} />
              <Metric label={ar ? "علاج وتطعيم" : "Meds & vaccines"} value={formatCurrency(econ.healthCost)} />
              <Metric
                label={ar ? "إجمالي التكلفة" : "Total cost"}
                value={<span className="font-semibold text-foreground">{formatCurrency(econ.totalCost)}</span>}
              />
            </div>

            <Separator className="my-4" />

            {econ.purpose === "dairy" ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                <Metric label={ar ? "اللبن المُنتَج" : "Milk produced"} value={`${formatNumber(econ.litres)} ${t("common.liters")}`} />
                <Metric
                  label={ar ? "تكلفة اللتر" : "Cost / litre"}
                  value={econ.costPerLitre ? <span className="font-semibold text-primary">{formatCurrency(econ.costPerLitre)}</span> : "—"}
                />
                <Metric label={ar ? "أيام في المزرعة" : "Days on farm"} value={formatNumber(econ.daysOnFarm)} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <Metric
                  label={ar ? "الوزن" : "Weight"}
                  value={
                    <span className="flex items-center gap-1">
                      <Scale className="size-3.5 text-muted-foreground" />
                      {formatNumber(econ.startWeightKg)} → {formatNumber(econ.currentWeightKg)} {t("common.kg")}
                    </span>
                  }
                />
                <Metric label={ar ? "الزيادة الوزنية" : "Weight gain"} value={`${formatNumber(econ.gainKg)} ${t("common.kg")}`} />
                <Metric
                  label={ar ? "تكلفة كجم حي" : "Cost / kg live"}
                  value={econ.costPerKgLive ? formatCurrency(econ.costPerKgLive) : "—"}
                />
                <Metric
                  label={ar ? "تكلفة كجم زيادة" : "Cost / kg gain"}
                  value={econ.costPerKgGain ? <span className="font-semibold text-primary">{formatCurrency(econ.costPerKgGain)}</span> : "—"}
                />
              </div>
            )}

            {econ.sold && (
              <>
                <Separator className="my-4" />
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                  <Metric label={ar ? "قيمة البيع" : "Sale price"} value={formatCurrency(econ.proceeds)} />
                  <Metric
                    label={ar ? "صافي الربح" : "Net profit"}
                    value={
                      <span className={econ.profit >= 0 ? "font-semibold text-emerald-600 dark:text-emerald-500" : "font-semibold text-destructive"}>
                        {formatCurrency(econ.profit)}
                      </span>
                    }
                  />
                </div>
              </>
            )}

            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              {ar
                ? "العلف مُوزَّع من تكلفة تغذية حظيرة الحيوان. التكاليف مباشرة (شراء + علف + علاج)؛ أدخِل سعر ووزن الشراء من زر التعديل لحساب أدق."
                : "Feed is allocated from the animal's pen feeding cost. Costs are direct (purchase + feed + meds); set the purchase price & weight via Edit for a precise cost/kg."}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4 flex w-full overflow-x-auto sm:w-auto">
          <TabsTrigger value="overview">{t("animals.overview")}</TabsTrigger>
          <TabsTrigger value="milk">{t("animals.milkTab")}</TabsTrigger>
          <TabsTrigger value="health">{t("animals.healthTab")}</TabsTrigger>
          <TabsTrigger value="breeding">{t("animals.breedingTab")}</TabsTrigger>
          <TabsTrigger value="growth">{t("animals.weightTab")}</TabsTrigger>
          <TabsTrigger value="timeline">{t("animals.timeline")}</TabsTrigger>
        </TabsList>

        {/* -------------------------------- Overview ------------------------------ */}
        <TabsContent value="overview">
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="px-5 pb-2 pt-4">
                <CardTitle>{t("animals.overview")}</CardTitle>
              </div>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-3">
                  {facts.map((f) => (
                    <div key={f.label}>
                      <dt className="text-[11px] text-muted-foreground">{f.label}</dt>
                      <dd className="mt-0.5 truncate text-[13px] font-medium capitalize">
                        {f.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {animal.insurance && (
                  <>
                    <Separator className="my-4" />
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("animals.insurance")}
                    </p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                      <Metric label={t("partners.contact")} value={animal.insurance.provider} />
                      <Metric label="Policy" value={animal.insurance.policyNo} />
                      <Metric
                        label={t("common.value")}
                        value={formatCurrency(animal.insurance.coverage)}
                      />
                      <Metric
                        label={t("feed.expiry")}
                        value={formatDate(animal.insurance.expiry, locale)}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Card>
                <div className="px-5 pb-2 pt-4">
                  <CardTitle>{t("animals.gallery")}</CardTitle>
                  <CardDescription>{t("animals.documents")}</CardDescription>
                </div>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground"
                      >
                        <ImageIcon className="size-4" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {["Purchase certificate.pdf", "Vaccination card.pdf"].map((doc) => (
                      <div
                        key={doc}
                        className="flex items-center gap-2 rounded-lg border border-border/70 px-2.5 py-2 text-[12px]"
                      >
                        <FileText className="size-3.5 text-muted-foreground" />
                        <span className="truncate">{doc}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <div className="px-5 pb-2 pt-4">
                  <CardTitle>{t("common.notes")}</CardTitle>
                </div>
                <CardContent>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    {animal.notes ??
                      (locale === "ar"
                        ? "لا توجد ملاحظات مسجلة لهذا الحيوان."
                        : "No owner notes recorded for this animal yet.")}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ---------------------------------- Milk -------------------------------- */}
        <TabsContent value="milk">
          <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-3">
            {animal.milkStatus === "lactating" ? (
              <>
                <ChartCard
                  title={t("animals.lactationCurve")}
                  description={t("animals.actualVsExpected")}
                >
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={lactationCurve} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="animalMilk" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.34} />
                          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
                      <YAxis {...axisProps} width={38} />
                      <RTooltip
                        content={
                          <ChartTooltip
                            labelFormatter={(l) => formatDate(l, locale)}
                            formatter={(v) => `${formatNumber(v)} ${t("common.liters")}`}
                          />
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="totalL"
                        name={t("milk.dailyTotal")}
                        stroke="var(--chart-1)"
                        strokeWidth={2}
                        fill="url(#animalMilk)"
                      />
                      <Line
                        type="monotone"
                        dataKey="expected"
                        name={t("calves.expectedWeight")}
                        stroke="var(--chart-3)"
                        strokeWidth={1.6}
                        strokeDasharray="5 4"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title={t("milk.quality")} description={`${t("milk.scc")} · ${t("milk.fat")}`}>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={dailyMilk} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
                      <YAxis yAxisId="left" {...axisProps} width={48} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                      <YAxis yAxisId="right" orientation="right" {...axisProps} width={34} domain={[5, 9]} />
                      <RTooltip content={<ChartTooltip labelFormatter={(l) => formatDate(l, locale)} />} />
                      <Line yAxisId="left" type="monotone" dataKey="scc" name={t("milk.scc")} stroke="var(--chart-5)" strokeWidth={1.8} dot={false} />
                      <Line yAxisId="right" type="monotone" dataKey="fat" name={t("milk.fat")} stroke="var(--chart-2)" strokeWidth={1.8} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </>
            ) : (
              <EmptyPanel
                icon={Droplets}
                title={t("status.not_applicable")}
                hint={t("animals.milkStatus")}
              />
            )}
          </motion.div>
        </TabsContent>

        {/* --------------------------------- Health ------------------------------- */}
        <TabsContent value="health">
          <Card>
            <div className="px-5 pb-2 pt-4">
              <CardTitle>{t("health.title")}</CardTitle>
              <CardDescription>
                {formatNumber(animalHealth.length)} {t("common.results")}
              </CardDescription>
            </div>
            <CardContent className="space-y-2">
              {animalHealth.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start gap-3 rounded-lg border border-border/70 p-3"
                >
                  <span
                    className={
                      h.type === "vaccination"
                        ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--info)_14%,transparent)] text-[var(--info)]"
                        : "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive/12 text-destructive"
                    }
                  >
                    {h.type === "vaccination" ? (
                      <Syringe className="size-3.5" />
                    ) : (
                      <HeartPulse className="size-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium">
                        {h.type === "vaccination"
                          ? h.vaccine
                          : h.disease
                            ? t(`diseases.${h.disease}`)
                            : h.type}
                      </p>
                      {h.outcome && (
                        <Badge variant={h.outcome === "ongoing" ? "warning" : "success"}>
                          {h.outcome}
                        </Badge>
                      )}
                      {h.withdrawalUntil && diffDays(h.withdrawalUntil, TODAY) >= 0 && (
                        <Badge variant="destructive">{t("health.withdrawalActive")}</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {formatDate(h.date, locale)}
                      {h.medication ? ` · ${h.medication}` : ""}
                      {h.dosage ? ` · ${h.dosage}` : ""}
                      {h.vetName ? ` · ${h.vetName}` : ""}
                    </p>
                    {h.vitals?.temperatureC && (
                      <p className="tabular mt-1 text-[11px] text-muted-foreground">
                        {formatNumber(h.vitals.temperatureC)}°C · HR {h.vitals.heartRate} · RR{" "}
                        {h.vitals.respiration}
                      </p>
                    )}
                  </div>
                  <span className="tabular shrink-0 text-[12px] font-medium">
                    {formatCurrency(h.cost)}
                  </span>
                </div>
              ))}
              {!animalHealth.length && (
                <EmptyPanel icon={HeartPulse} title={t("common.noResults")} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------------------- Breeding ------------------------------ */}
        <TabsContent value="breeding">
          <Card>
            <div className="px-5 pb-2 pt-4">
              <CardTitle>{t("breeding.title")}</CardTitle>
            </div>
            <CardContent className="space-y-2">
              {animalBreeding.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    {b.type === "calving" ? <Baby className="size-3.5" /> : <Dna className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium capitalize">
                      {b.type.replace(/_/g, " ")}
                      {b.outcome ? ` · ${b.outcome}` : ""}
                      {b.result ? ` · ${b.result}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {formatDate(b.date, locale)}
                      {b.semenBatch ? ` · ${t("breeding.batch")} ${b.semenBatch}` : ""}
                      {b.technician ? ` · ${b.technician}` : ""}
                    </p>
                  </div>
                </div>
              ))}
              {!animalBreeding.length && <EmptyPanel icon={Dna} title={t("common.noResults")} />}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --------------------------------- Growth ------------------------------- */}
        <TabsContent value="growth">
          <ChartCard title={t("animals.growthCurve")} description={t("animals.weight")}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={weights ?? []} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(2, 7)} minTickGap={20} />
                <YAxis {...axisProps} width={42} />
                <RTooltip
                  content={
                    <ChartTooltip
                      labelFormatter={(l) => formatDate(l, locale)}
                      formatter={(v) => `${formatNumber(v)} ${t("common.kg")}`}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="weightKg"
                  name={t("animals.weight")}
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                  fill="url(#weightFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </TabsContent>

        {/* -------------------------------- Timeline ------------------------------ */}
        <TabsContent value="timeline">
          <Card>
            <div className="px-5 pb-2 pt-4">
              <CardTitle>{t("animals.timeline")}</CardTitle>
              <CardDescription>
                {formatNumber(timeline?.length ?? 0)} {t("common.results")}
              </CardDescription>
            </div>
            <CardContent>
              <ol className="relative space-y-4 ps-6">
                <span className="absolute inset-y-1 start-[9px] w-px bg-border" />
                {(timeline ?? []).map((e, i) => (
                  <motion.li
                    key={e.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    className="relative"
                  >
                    <span
                      className="absolute -start-6 top-1 size-2.5 rounded-full ring-4 ring-card"
                      style={{
                        background:
                          e.kind === "health"
                            ? "var(--chart-5)"
                            : e.kind === "breeding"
                              ? "var(--chart-2)"
                              : e.kind === "birth"
                                ? "var(--chart-1)"
                                : "var(--chart-3)",
                      }}
                    />
                    <p className="text-[13px] font-medium">
                      {locale === "ar" ? e.titleAr : e.title}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {formatDate(e.date, locale)}
                      {e.detail ? ` · ${locale === "ar" ? (e.detailAr ?? e.detail) : e.detail}` : ""}
                    </p>
                  </motion.li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex justify-center">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/animals">
            <Beef /> {t("common.viewAll")} — {t("nav.animals")}
          </Link>
        </Button>
      </div>
    </>
  );
}

/** Pedigree links — a raw document id in the profile helps nobody. */
function ParentLink({ parent }: { parent?: import("@/core/domain/types").Animal | null }) {
  const { ln } = useI18n();
  if (!parent) return <span className="text-muted-foreground">—</span>;
  return (
    <Link
      href={`/animal?id=${parent.id}`}
      className="tabular text-primary underline-offset-4 hover:underline"
    >
      {parent.tag} · {ln(parent)}
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tabular mt-0.5 truncate text-[13.5px] font-semibold">{value}</p>
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Beef;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="text-[14px] font-medium">{title}</p>
      {hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

// useSearchParams must sit under a Suspense boundary for static export.
export default function AnimalProfilePage() {
  return (
    <React.Suspense fallback={<ProfileSkeleton />}>
      <AnimalProfileInner />
    </React.Suspense>
  );
}
