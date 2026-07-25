"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Baby,
  Beef,
  CalendarClock,
  Droplets,
  Flame,
  HeartPulse,
  Milk,
  Package,
  Plus,
  Stethoscope,
  Syringe,
  TrendingUp,
  Wallet,
  Wheat,
  Wind,
} from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ChartCard, ChartTooltip, CHART_COLORS, axisProps, gridProps } from "@/components/common/chart";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress, Skeleton } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { TODAY } from "@/core/data/seed";
import { formatDate, formatMonth, diffDays, monthKey } from "@/lib/date";
import { pct, round } from "@/lib/utils";
import {
  useAlerts,
  useAnimals,
  useBreeding,
  useFeedConsumption,
  useFeedItems,
  useHealth,
  useInventory,
  useMilkDaily,
  useRations,
  useTasks,
  useTransactions,
  useWeather,
} from "@/hooks/use-farm-data";
import {
  breedingMetrics,
  diseaseTrend,
  feedEfficiencySeries,
  feedMetrics,
  financeMetrics,
  growthMetrics,
  healthMetrics,
  herdComposition,
  herdStructure,
  inventoryMetrics,
  meatMetrics,
  milkSummary,
  monthlyFinance,
  monthlyMilk,
  taskMetrics,
} from "@/core/services/metrics";
import { TaskStatusPill, PriorityPill } from "@/components/common/status-pill";
import { RecordSessionDialog } from "@/components/milk/record-session-dialog";

export default function DashboardPage() {
  const { t, ln, locale, formatNumber, formatCompact, formatCurrency } = useI18n();
  const { user } = useAuth();
  // First name only — falls back to the full name, then a neutral greeting.
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? "";

  const animals = useAnimals({ pageSize: 100000 });
  const milk = useMilkDaily();
  const health = useHealth();
  const breeding = useBreeding();
  const feedItems = useFeedItems();
  const feedCons = useFeedConsumption();
  const rations = useRations();
  const inventory = useInventory();
  const txns = useTransactions();
  const tasks = useTasks();
  const alerts = useAlerts();
  const weather = useWeather();

  const loading =
    animals.isLoading || milk.isLoading || txns.isLoading || health.isLoading;

  const list = React.useMemo(() => animals.data?.items ?? [], [animals.data]);
  const daily = React.useMemo(() => milk.data ?? [], [milk.data]);

  const herd = React.useMemo(() => herdComposition(list), [list]);
  const structure = React.useMemo(() => herdStructure(list), [list]);
  const milkStats = React.useMemo(() => milkSummary(daily, TODAY), [daily]);
  const meat$ = React.useMemo(() => meatMetrics(list, txns.data ?? [], TODAY), [list, txns.data]);
  const growth$ = React.useMemo(() => growthMetrics(list, TODAY), [list]);
  const monthly = React.useMemo(() => monthlyMilk(daily).slice(-12), [daily]);
  const health$ = React.useMemo(
    () => healthMetrics(health.data ?? [], list, TODAY),
    [health.data, list],
  );
  const breed$ = React.useMemo(
    () => breedingMetrics(breeding.data ?? [], list, TODAY),
    [breeding.data, list],
  );
  const feed$ = React.useMemo(
    () => feedMetrics(feedItems.data ?? [], feedCons.data ?? [], daily, TODAY, rations.data ?? []),
    [feedItems.data, feedCons.data, daily, rations.data],
  );
  const inv$ = React.useMemo(() => inventoryMetrics(inventory.data ?? [], TODAY), [inventory.data]);
  const fin$ = React.useMemo(
    () => financeMetrics(txns.data ?? [], TODAY, daily.slice(-30).reduce((s, d) => s + d.totalL, 0)),
    [txns.data, daily],
  );
  const finSeries = React.useMemo(() => monthlyFinance(txns.data ?? [], 12), [txns.data]);
  const task$ = React.useMemo(() => taskMetrics(tasks.data ?? [], TODAY), [tasks.data]);
  const disease$ = React.useMemo(() => diseaseTrend(health.data ?? [], 8), [health.data]);
  const efficiency$ = React.useMemo(
    () => feedEfficiencySeries(feedCons.data ?? [], daily, 60),
    [feedCons.data, daily],
  );

  const last30 = daily.slice(-30);
  const heatPenalty =
    weather.data?.heatStress === "severe" ? 9 : weather.data?.heatStress === "moderate" ? 5 : 0;

  const birthsThisMonth = (breeding.data ?? []).filter(
    (b) => b.type === "calving" && monthKey(b.date) === monthKey(TODAY),
  ).length;

  const deaths = (health.data ?? []).filter((h) => h.outcome === "died");
  const deathsThisMonth = deaths.filter((h) => monthKey(h.date) === monthKey(TODAY)).length;
  const deathsThisYear = deaths.filter((h) => h.date.slice(0, 4) === TODAY.slice(0, 4)).length;

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "dashboard.greetingMorning" : hour < 18 ? "dashboard.greetingAfternoon" : "dashboard.greetingEvening";

  // Donut slices (calves merged so 6 palette colours cover it); the legend
  // below splits calves back out under each sex.
  const composition = [
    { key: "lactating", value: structure.female.lactating, color: CHART_COLORS[0] },
    { key: "pregnant", value: structure.female.pregnant, color: CHART_COLORS[1] },
    { key: "dry", value: structure.female.dry, color: CHART_COLORS[2] },
    { key: "heifers", value: structure.female.heifer, color: CHART_COLORS[3] },
    { key: "fattening", value: structure.male.fattening, color: CHART_COLORS[4] },
    { key: "calves", value: structure.calves, color: CHART_COLORS[5] },
  ].filter((s) => s.value > 0);

  const femaleRows = [
    { label: t("herd.lactating"), value: structure.female.lactating, color: CHART_COLORS[0] },
    { label: t("herd.pregnant"), value: structure.female.pregnant, color: CHART_COLORS[1] },
    { label: t("herd.dry"), value: structure.female.dry, color: CHART_COLORS[2] },
    { label: t("herd.heifers"), value: structure.female.heifer, color: CHART_COLORS[3] },
    { label: t("herd.calves"), value: structure.female.calf, color: CHART_COLORS[5] },
  ];
  const maleRows = [
    { label: t("herd.fattening"), value: structure.male.fattening, color: CHART_COLORS[4] },
    { label: t("herd.calves"), value: structure.male.calf, color: CHART_COLORS[5] },
  ];

  const topProducers = [...list]
    .filter((a) => a.milkStatus === "lactating")
    .sort((a, b) => b.avgDailyMilkL - a.avgDailyMilkL)
    .slice(0, 6);

  const upcoming = [
    ...breed$.dueSoon
      .filter((a) => diffDays(a.expectedCalvingDate!, TODAY) <= 14)
      .slice(0, 5)
      .map((a) => ({
        id: `calv_${a.id}`,
        date: a.expectedCalvingDate!,
        icon: Baby,
        label: `${t("breeding.calvings")} · ${a.tag}`,
        href: `/animal?id=${a.id}`,
      })),
    ...health$.dueVaccinationList
      .filter((e) => diffDays(e.nextDueDate!, TODAY) <= 14)
      .slice(0, 5)
      .map((e) => ({
        id: `vac_${e.id}`,
        date: e.nextDueDate!,
        icon: Syringe,
        label: `${e.vaccine}`,
        href: `/health`,
      })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 7);

  if (loading) return <DashboardSkeleton />;

  return (
    <>
      <PageHeader
        title={firstName ? `${t(greeting)}${locale === "ar" ? "، " : ", "}${firstName}` : t(greeting)}
        subtitle={t("dashboard.subtitle")}
        actions={
          <>
            <RecordSessionDialog
              trigger={
                <Button variant="outline" size="sm">
                  <Milk /> {t("dashboard.recordMilk")}
                </Button>
              }
            />
            <Button size="sm" asChild>
              <Link href="/animals">
                <Plus /> {t("dashboard.addAnimal")}
              </Link>
            </Button>
          </>
        }
      />

      {/* ------------------------------ KPI band ------------------------------ */}
      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        <StatCard
          label={t("kpi.totalBuffalo")}
          value={formatNumber(herd.total)}
          icon={Beef}
          tone="info"
          hint={`${formatNumber(herd.healthyPct)}% ${t("kpi.healthy").toLowerCase()}`}
        />
        <StatCard
          label={t("kpi.avgMilkToday")}
          value={formatCompact(milkStats.today)}
          unit={t("common.liters")}
          icon={Milk}
          tone="success"
          delta={milkStats.deltaPct}
          spark={last30.map((d) => d.totalL)}
        />
        <StatCard
          label={t("kpi.milkPerCow")}
          value={formatNumber(milkStats.perCowToday)}
          unit={`${t("common.liters")}/${t("common.head")}`}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label={t("analytics.meatOfftake")}
          value={formatCompact(meat$.carcassKg)}
          unit="kg"
          icon={Beef}
          tone="info"
          hint={`${formatNumber(meat$.headSold)} ${t("analytics.headSold").toLowerCase()}`}
        />
        <StatCard
          label={t("analytics.avgDailyGain")}
          value={formatNumber(growth$.avgADG)}
          unit="kg/d"
          icon={TrendingUp}
          tone="success"
          hint={`${formatNumber(growth$.growingCount)} ${t("analytics.growingStock").toLowerCase()}`}
        />
        <StatCard
          label={t("kpi.lactating")}
          value={formatNumber(herd.lactating)}
          icon={Droplets}
          hint={`${formatNumber(herd.dry)} ${t("kpi.dry").toLowerCase()}`}
        />
        <StatCard
          label={t("kpi.pregnant")}
          value={formatNumber(herd.pregnant)}
          icon={Activity}
          tone="info"
          hint={`${formatNumber(breed$.pregnancyRate)}% ${t("kpi.pregnant").toLowerCase()}`}
        />
        <StatCard
          label={t("kpi.calves")}
          value={formatNumber(herd.calves)}
          icon={Baby}
          hint={`${formatNumber(birthsThisMonth)} ${t("kpi.birthsThisMonth").toLowerCase()}`}
        />

        <StatCard
          label={t("kpi.revenue")}
          value={formatCompact(fin$.revenue)}
          icon={Wallet}
          tone="success"
          delta={fin$.revenueDelta}
        />
        <StatCard
          label={t("kpi.expenses")}
          value={formatCompact(fin$.expenses)}
          icon={Wallet}
          tone="warning"
          delta={fin$.expenseDelta}
          invertDelta
        />
        <StatCard
          label={t("kpi.profit")}
          value={formatCompact(fin$.profit)}
          icon={TrendingUp}
          tone={fin$.profit >= 0 ? "success" : "destructive"}
          hint={`${formatNumber(fin$.margin)}% ${t("kpi.margin").toLowerCase()}`}
        />
        <StatCard
          label={t("kpi.feedRemaining")}
          value={formatNumber(feed$.daysCover)}
          unit={t("common.days")}
          icon={Wheat}
          tone={feed$.daysCover < 14 ? "warning" : "default"}
          hint={formatCurrency(feed$.stockValue)}
        />
        <StatCard
          label={t("kpi.medicineStock")}
          value={formatCompact(inv$.medicineValue)}
          icon={Package}
          tone={inv$.lowStock.length ? "warning" : "default"}
          hint={`${formatNumber(inv$.lowStock.length)} ${t("inventory.belowReorder").toLowerCase()}`}
        />
      </motion.div>

      {/* -------------------------- Weather + alerts -------------------------- */}
      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="mt-4 grid gap-3 lg:grid-cols-3"
      >
        <motion.div variants={cardIn}>
          <Card className="h-full overflow-hidden">
            <div className="flex items-start justify-between gap-3 p-5 pb-3">
              <div>
                <CardTitle>{t("kpi.weather")}</CardTitle>
                <CardDescription>{formatDate(TODAY, locale)}</CardDescription>
              </div>
              <span
                className={
                  weather.data && weather.data.heatStress !== "none"
                    ? "flex size-9 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] text-[var(--warning)]"
                    : "flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                }
              >
                <Flame className="size-5" />
              </span>
            </div>
            <CardContent className="pb-5">
              <div className="flex items-end gap-4">
                <p className="tabular text-4xl font-semibold leading-none">
                  {formatNumber(weather.data?.temperatureC ?? 0)}°
                </p>
                <div className="pb-1 text-[12px] text-muted-foreground">
                  <p className="tabular">
                    {t("kpi.humidity")} {formatNumber(weather.data?.humidityPct ?? 0)}%
                  </p>
                  <p className="tabular">
                    {t("kpi.thi")} {formatNumber(weather.data?.thi ?? 0)}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-border/70 bg-muted/40 p-2.5">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Wind className="size-3.5" /> {t("kpi.heatStress")}
                  </span>
                  <Badge
                    variant={
                      weather.data?.heatStress === "severe"
                        ? "destructive"
                        : weather.data?.heatStress === "moderate"
                          ? "warning"
                          : "success"
                    }
                  >
                    {t(`status.${weather.data?.heatStress ?? "none"}`)}
                  </Badge>
                </div>
                {heatPenalty > 0 && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    {locale === "ar"
                      ? `متوقع انخفاض ${heatPenalty}% في إنتاج اليوم — شغّل التبريد.`
                      : `Expect a ${heatPenalty}% dip in today's yield — run cooling.`}
                  </p>
                )}
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1">
                {weather.data?.forecast?.map((f) => (
                  <div key={f.date} className="rounded-md bg-muted/50 px-1 py-1.5 text-center">
                    <p className="text-[9px] uppercase text-muted-foreground">
                      {formatDate(f.date, locale, { weekday: "short", day: undefined, month: undefined, year: undefined })}
                    </p>
                    <p className="tabular mt-0.5 text-[12px] font-semibold">
                      {Math.round(f.maxC)}°
                    </p>
                    <p
                      className="mx-auto mt-1 h-1 w-4 rounded-full"
                      style={{
                        background:
                          f.thi >= 84 ? "var(--destructive)" : f.thi >= 78 ? "var(--warning)" : "var(--success)",
                      }}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardIn} className="lg:col-span-2">
          <Card className="h-full">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div>
                <CardTitle>{t("dashboard.attentionNeeded")}</CardTitle>
                <CardDescription>{t("kpi.aiAlerts")}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/notifications">{t("common.viewAll")}</Link>
              </Button>
            </div>
            <CardContent className="space-y-2 pb-4">
              {(alerts.data ?? []).slice(0, 4).map((a) => (
                <Link
                  key={a.id}
                  href={a.href ?? "/notifications"}
                  className="flex items-start gap-3 rounded-lg border border-border/70 p-3 transition hover:border-ring/40 hover:bg-accent/40"
                >
                  <span
                    className={
                      a.severity === "critical"
                        ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive/12 text-destructive"
                        : a.severity === "warning"
                          ? "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] text-[var(--warning)]"
                          : "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--info)_14%,transparent)] text-[var(--info)]"
                    }
                  >
                    {a.category === "health" ? (
                      <HeartPulse className="size-4" />
                    ) : a.category === "weather" ? (
                      <Flame className="size-4" />
                    ) : a.category === "breeding" ? (
                      <Baby className="size-4" />
                    ) : (
                      <AlertTriangle className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">
                      {locale === "ar" ? a.titleAr : a.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                      {locale === "ar" ? a.bodyAr : a.body}
                    </p>
                  </div>
                  {!a.read && (
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                </Link>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* ------------------------------- Charts ------------------------------- */}
      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="mt-4 grid gap-3 xl:grid-cols-3"
      >
        <ChartCard
          className="xl:col-span-2"
          title={t("dashboard.dailyMilk")}
          description={t("common.last30")}
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={last30} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="milkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="date"
                {...axisProps}
                tickFormatter={(v: string) => v.slice(8)}
                minTickGap={16}
              />
              <YAxis {...axisProps} width={46} tickFormatter={(v: number) => formatCompact(v)} />
              <Tooltip
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
                fill="url(#milkFill)"
              />
              <Line
                type="monotone"
                dataKey="morningL"
                name={t("milk.morning")}
                stroke="var(--chart-2)"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 3"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("herd.structure")} description={`${formatNumber(herd.total)} ${t("common.head")}`}>
          <div className="flex items-center gap-2">
            <ResponsiveContainer width="42%" height={220}>
              <PieChart>
                <Pie
                  data={composition}
                  dataKey="value"
                  nameKey="key"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={2}
                  stroke="none"
                >
                  {composition.map((c) => (
                    <Cell key={c.key} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(v) => formatNumber(v)} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-3 pe-2">
              <HerdGroup
                title={`${t("herd.females")} · ${formatNumber(structure.female.total)}`}
                rows={femaleRows}
                formatNumber={formatNumber}
              />
              <HerdGroup
                title={`${t("herd.males")} · ${formatNumber(structure.male.total)}`}
                rows={maleRows}
                formatNumber={formatNumber}
              />
            </div>
          </div>
        </ChartCard>

        <ChartCard title={t("dashboard.financialGrowth")} description={t("common.last12m")}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={finSeries} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="month"
                {...axisProps}
                tickFormatter={(v: string) => formatMonth(v, locale)}
                minTickGap={12}
              />
              <YAxis {...axisProps} width={44} tickFormatter={(v: number) => formatCompact(v)} />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(l) => formatMonth(l, locale)}
                    formatter={(v) => formatCurrency(v)}
                  />
                }
              />
              <Bar dataKey="income" name={t("finance.income")} fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" name={t("finance.expenses")} fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("dashboard.monthlyMilk")} description={t("common.last12m")}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="month"
                {...axisProps}
                tickFormatter={(v: string) => formatMonth(v, locale)}
                minTickGap={12}
              />
              <YAxis {...axisProps} width={44} tickFormatter={(v: number) => formatCompact(v)} />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(l) => formatMonth(l, locale)}
                    formatter={(v) => `${formatCompact(v)} ${t("common.liters")}`}
                  />
                }
              />
              <Bar dataKey="totalL" name={t("nav.milk")} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("dashboard.diseaseTrends")} description={t("health.topDiseases")}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={disease$} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="month"
                {...axisProps}
                tickFormatter={(v: string) => formatMonth(v, locale)}
                minTickGap={12}
              />
              <YAxis {...axisProps} width={36} />
              <Tooltip content={<ChartTooltip labelFormatter={(l) => formatMonth(l, locale)} />} />
              <Area
                type="monotone"
                stackId="1"
                dataKey="mastitis"
                name={t("diseases.mastitis")}
                stroke="var(--chart-5)"
                fill="var(--chart-5)"
                fillOpacity={0.5}
              />
              <Area
                type="monotone"
                stackId="1"
                dataKey="lameness"
                name={t("diseases.lameness")}
                stroke="var(--chart-3)"
                fill="var(--chart-3)"
                fillOpacity={0.5}
              />
              <Area
                type="monotone"
                stackId="1"
                dataKey="metabolic"
                name={t("diseases.ketosis")}
                stroke="var(--chart-2)"
                fill="var(--chart-2)"
                fillOpacity={0.5}
              />
              <Area
                type="monotone"
                stackId="1"
                dataKey="other"
                name={t("common.more")}
                stroke="var(--chart-6)"
                fill="var(--chart-6)"
                fillOpacity={0.4}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title={t("dashboard.feedEfficiencyChart")}
          description={`${formatNumber(feed$.kgPerLiter)} ${t("common.kg")} / ${t("common.liters")}`}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={efficiency$} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="date"
                {...axisProps}
                tickFormatter={(v: string) => v.slice(5)}
                minTickGap={20}
              />
              <YAxis {...axisProps} width={40} domain={["auto", "auto"]} />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(l) => formatDate(l, locale)}
                    formatter={(v, n) => (n === t("kpi.feedEfficiency") ? formatNumber(v, { maximumFractionDigits: 3 }) : formatNumber(v))}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="efficiency"
                name={t("kpi.feedEfficiency")}
                stroke="var(--chart-4)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("dashboard.feedConsumption")} description={t("common.last30")}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={efficiency$.slice(-30)} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="date"
                {...axisProps}
                tickFormatter={(v: string) => v.slice(8)}
                minTickGap={16}
              />
              <YAxis {...axisProps} width={46} tickFormatter={(v: number) => formatCompact(v)} />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(l) => formatDate(l, locale)}
                    formatter={(v) => `${formatNumber(v)} ${t("common.kg")}`}
                  />
                }
              />
              <Bar dataKey="kg" name={t("feed.consumption")} fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      {/* --------------------------- Operational rail -------------------------- */}
      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="mt-4 grid gap-3 lg:grid-cols-3"
      >
        <motion.div variants={cardIn}>
          <Card className="h-full">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div>
                <CardTitle>{t("dashboard.todaysTasks")}</CardTitle>
                <CardDescription className="tabular">
                  {formatNumber(task$.doneCount)}/{formatNumber(task$.todayCount)} ·{" "}
                  {formatNumber(task$.completionRate)}%
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/tasks">{t("common.viewAll")}</Link>
              </Button>
            </div>
            <CardContent className="pb-4">
              <Progress value={task$.completionRate} className="mb-3" />
              <ul className="space-y-1.5">
                {task$.today.slice(0, 6).map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] transition hover:bg-accent/50"
                  >
                    <PriorityPill value={task.priority} />
                    <span className="min-w-0 flex-1 truncate">
                      {locale === "ar" ? task.titleAr : task.title}
                    </span>
                    <TaskStatusPill value={task.status} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardIn}>
          <Card className="h-full">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div>
                <CardTitle>{t("dashboard.topProducers")}</CardTitle>
                <CardDescription>{t("common.today")}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/milk">{t("common.viewAll")}</Link>
              </Button>
            </div>
            <CardContent className="pb-4">
              <ul className="space-y-1">
                {topProducers.map((a, i) => (
                  <li key={a.id}>
                    <Link
                      href={`/animal?id=${a.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-accent/50"
                    >
                      <span className="tabular w-4 text-[11px] text-muted-foreground">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{ln(a)}</p>
                        <p className="tabular text-[11px] text-muted-foreground">{a.tag}</p>
                      </div>
                      <div className="w-24">
                        <Progress
                          value={(a.avgDailyMilkL / (topProducers[0]?.avgDailyMilkL || 1)) * 100}
                          className="h-1.5"
                        />
                      </div>
                      <span className="tabular w-14 text-end text-[12.5px] font-semibold">
                        {formatNumber(a.avgDailyMilkL)} {t("common.liters")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardIn}>
          <Card className="h-full">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div>
                <CardTitle>{t("dashboard.upcomingEvents")}</CardTitle>
                <CardDescription>
                  {formatNumber(breed$.dueThisWeek)} {t("breeding.dueThisWeek").toLowerCase()}
                </CardDescription>
              </div>
              <CalendarClock className="size-4 text-muted-foreground" />
            </div>
            <CardContent className="pb-4">
              <ul className="space-y-1">
                {upcoming.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={e.href}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-accent/50"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <e.icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px]">{e.label}</span>
                      <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                        {formatDate(e.date, locale, { year: undefined })}
                      </span>
                    </Link>
                  </li>
                ))}
                {!upcoming.length && (
                  <li className="py-6 text-center text-[12px] text-muted-foreground">
                    {t("notifications.empty")}
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* ---------------------------- Health summary --------------------------- */}
      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        <StatCard
          label={t("health.activeCases")}
          value={formatNumber(health$.activeCases)}
          icon={Stethoscope}
          tone={health$.activeCases > 20 ? "destructive" : "warning"}
          hint={`${formatNumber(health$.isolated)} ${t("health.isolation").toLowerCase()}`}
        />
        <StatCard
          label={t("kpi.upcomingVaccinations")}
          value={formatNumber(health$.dueVaccinations)}
          icon={Syringe}
          tone="info"
        />
        <StatCard
          label={t("kpi.upcomingCalving")}
          value={formatNumber(breed$.dueThisMonth)}
          icon={Baby}
          hint={t("breeding.dueThisMonth")}
        />
        <StatCard
          label={t("kpi.conceptionRate")}
          value={formatNumber(breed$.conceptionRate)}
          unit="%"
          icon={Activity}
          tone={breed$.conceptionRate > 50 ? "success" : "warning"}
        />
        <StatCard
          label={t("kpi.feedCostPerLiter")}
          value={formatNumber(feed$.costPerLiter, { maximumFractionDigits: 2 })}
          unit="EGP"
          icon={Wheat}
          tone="default"
        />
        <StatCard
          label={t("kpi.deathsThisMonth")}
          value={formatNumber(deathsThisMonth)}
          icon={AlertTriangle}
          tone={deathsThisMonth > 3 ? "warning" : "default"}
          hint={`${formatNumber(round(pct(deathsThisYear, Math.max(1, herd.total)), 2))}% ${t("common.year").toLowerCase()}`}
        />
      </motion.div>
    </>
  );
}

function HerdGroup({
  title,
  rows,
  formatNumber,
}: {
  title: string;
  rows: { label: string; value: number; color: string }[];
  formatNumber: (n: number) => string;
}) {
  return (
    <div>
      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-[12px]">
            <span className="size-2 rounded-[3px]" style={{ background: r.color }} />
            <span className="text-muted-foreground">{r.label}</span>
            <span className="tabular ms-auto font-medium">{formatNumber(r.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-64" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
