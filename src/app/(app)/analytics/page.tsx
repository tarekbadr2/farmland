"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Beef, Download, Droplets, Leaf, Zap } from "lucide-react";

import { PageHeader, gridStagger } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ChartCard, ChartTooltip, CHART_COLORS, axisProps, gridProps } from "@/components/common/chart";
import { QueryErrorState } from "@/components/common/query-error";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import {
  useAnimals,
  useBreeding,
  useFeedConsumption,
  useFeedItems,
  useHealth,
  useMilkDaily,
  useRations,
  useTransactions,
  useUtilities,
} from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import { formatDate, formatMonth, monthKey } from "@/lib/date";
import {
  breedingMetrics,
  diseaseTrend,
  feedEfficiencySeries,
  feedMetrics,
  growthMetrics,
  meatMetrics,
  monthlyMeat,
  monthlyFinance,
  monthlyMilk,
  sustainabilityMetrics,
  utilityCostSummary,
} from "@/core/services/metrics";
import { groupBy, round, sum } from "@/lib/utils";
import { downloadTableXlsx } from "@/lib/export";

export default function AnalyticsPage() {
  const { t, locale, formatNumber, formatCompact, formatCurrency } = useI18n();

  const qc = useQueryClient();
  const { data: animalPage, isError: e1 } = useAnimals({ pageSize: 100000 });
  const { data: milkDaily = [], isError: e2 } = useMilkDaily();
  const { data: health = [], isError: e3 } = useHealth();
  const { data: breeding = [], isError: e4 } = useBreeding();
  const { data: feedItems = [], isError: e5 } = useFeedItems();
  const { data: feedCons = [], isError: e6 } = useFeedConsumption();
  const { data: rations = [] } = useRations();
  const { data: txns = [], isError: e7 } = useTransactions();
  const { data: utilities = [] } = useUtilities();
  const hasError = e1 || e2 || e3 || e4 || e5 || e6 || e7;

  const animals = React.useMemo(() => animalPage?.items ?? [], [animalPage]);

  const monthly = React.useMemo(() => monthlyMilk(milkDaily), [milkDaily]);
  const finance = React.useMemo(() => monthlyFinance(txns, 12), [txns]);
  const disease = React.useMemo(() => diseaseTrend(health, 12), [health]);
  const efficiency = React.useMemo(
    () => feedEfficiencySeries(feedCons, milkDaily, 90),
    [feedCons, milkDaily],
  );
  const feed$ = React.useMemo(
    () => feedMetrics(feedItems, feedCons, milkDaily, TODAY, rations),
    [feedItems, feedCons, milkDaily, rations],
  );
  const breed$ = React.useMemo(() => breedingMetrics(breeding, animals, TODAY), [breeding, animals]);
  const meat$ = React.useMemo(() => meatMetrics(animals, txns, TODAY), [animals, txns]);
  const meatSeries = React.useMemo(() => monthlyMeat(txns, 12), [txns]);
  const growth$ = React.useMemo(() => growthMetrics(animals, TODAY), [animals]);
  const green$ = React.useMemo(
    () => sustainabilityMetrics(utilities, milkDaily, animals),
    [utilities, milkDaily, animals],
  );
  const utilCost = React.useMemo(() => utilityCostSummary(utilities, TODAY), [utilities]);

  /* Year-on-year comparison: same calendar month, this year vs last. */
  const yoy = React.useMemo(() => {
    const byMonth = groupBy(milkDaily, (d) => monthKey(d.date));
    const keys = Object.keys(byMonth).sort();
    const recent = keys.slice(-12);
    return recent.map((k) => {
      const monthNo = k.slice(5);
      const prevKey = `${Number(k.slice(0, 4)) - 1}-${monthNo}`;
      return {
        label: monthNo,
        thisYear: round(sum((byMonth[k] ?? []).map((d) => d.totalL)), 0),
        lastYear: round(sum((byMonth[prevKey] ?? []).map((d) => d.totalL)), 0),
      };
    });
  }, [milkDaily]);

  const breedingRadar = [
    { metric: t("breeding.conception"), value: breed$.conceptionRate, full: 100 },
    { metric: t("breeding.calfSurvival"), value: breed$.calfSurvival, full: 100 },
    { metric: t("kpi.pregnant"), value: breed$.pregnancyRate, full: 100 },
    { metric: t("breeding.abortions"), value: 100 - breed$.abortionRate, full: 100 },
    {
      metric: t("breeding.servicesPerConception"),
      value: Math.max(0, 100 - (breed$.servicesPerConception - 1) * 40),
      full: 100,
    },
  ];

  const utilitySeries = utilities.slice(-60).map((u) => ({
    date: u.date,
    water: u.waterM3,
    kwh: u.electricityKwh,
    co2: u.co2eKg,
  }));

  const mortalityByMonth = React.useMemo(() => {
    const byMonth = groupBy(
      health.filter((h) => h.outcome === "died"),
      (h) => monthKey(h.date),
    );
    return Object.keys(byMonth)
      .sort()
      .slice(-12)
      .map((month) => ({
        month,
        deaths: byMonth[month].length,
        rate: round((byMonth[month].length / Math.max(1, animals.length)) * 100, 2),
      }));
  }, [health, animals.length]);

  if (hasError) return <QueryErrorState onRetry={() => void qc.refetchQueries()} />;

  return (
    <>
      <PageHeader
        title={t("analytics.title")}
        subtitle={t("analytics.subtitle")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadTableXlsx(
                "monthly-analytics",
                t("analytics.title"),
                monthly.map((m, i) => ({
                  month: m.month,
                  milk_l: m.totalL,
                  per_cow_l: m.avgPerCow,
                  rejected_l: m.rejectedL,
                  income: finance[i]?.income ?? "",
                  expense: finance[i]?.expense ?? "",
                  profit: finance[i]?.profit ?? "",
                })),
                { subtitle: t("analytics.subtitle"), rtl: locale === "ar" },
              )
            }
          >
            <Download /> {t("common.export")}
          </Button>
        }
      />

      <Tabs defaultValue="milk">
        <TabsList className="mb-4 flex w-full overflow-x-auto lg:w-auto">
          <TabsTrigger value="milk">{t("analytics.milk")}</TabsTrigger>
          <TabsTrigger value="meat">{t("analytics.meatTab")}</TabsTrigger>
          <TabsTrigger value="growth">{t("analytics.growthTab")}</TabsTrigger>
          <TabsTrigger value="breeding">{t("analytics.breeding")}</TabsTrigger>
          <TabsTrigger value="health">{t("analytics.health")}</TabsTrigger>
          <TabsTrigger value="financial">{t("analytics.financial")}</TabsTrigger>
          <TabsTrigger value="feed">{t("analytics.feedTab")}</TabsTrigger>
          <TabsTrigger value="green">{t("analytics.sustainability")}</TabsTrigger>
        </TabsList>

        {/* ---------------------------------- Milk -------------------------------- */}
        <TabsContent value="milk">
          <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-3 xl:grid-cols-2">
            <ChartCard
              className="xl:col-span-2"
              title={`${t("analytics.thisYear")} ${t("analytics.compare")} ${t("analytics.lastYear")}`}
              description={t("dashboard.monthlyMilk")}
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={yoy} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} width={52} tickFormatter={(v: number) => formatCompact(v)} />
                  <RTooltip content={<ChartTooltip formatter={(v) => `${formatCompact(v)} ${t("common.liters")}`} />} />
                  <Bar dataKey="lastYear" name={t("analytics.lastYear")} fill="var(--chart-6)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="thisYear" name={t("analytics.thisYear")} fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t("kpi.milkPerCow")} description={t("common.last12m")}>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={monthly.slice(-12)} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => formatMonth(v, locale)} minTickGap={10} />
                  <YAxis {...axisProps} width={40} />
                  <RTooltip content={<ChartTooltip labelFormatter={(l) => formatMonth(l, locale)} />} />
                  <Line type="monotone" dataKey="avgPerCow" name={t("kpi.milkPerCow")} stroke="var(--chart-2)" strokeWidth={2.2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t("milk.rejected")} description={t("common.last12m")}>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={monthly.slice(-12)} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => formatMonth(v, locale)} minTickGap={10} />
                  <YAxis {...axisProps} width={44} />
                  <RTooltip content={<ChartTooltip labelFormatter={(l) => formatMonth(l, locale)} />} />
                  <Area type="monotone" dataKey="rejectedL" name={t("milk.rejected")} stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.25} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </motion.div>
        </TabsContent>

        {/* ---------------------------------- Meat -------------------------------- */}
        <TabsContent value="meat">
          <motion.div
            variants={gridStagger}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
          >
            <StatCard label={t("analytics.headSold")} value={formatNumber(meat$.headSold)} icon={Beef} />
            <StatCard label={t("analytics.liveWeight")} value={formatCompact(meat$.liveWeightKg)} unit="kg" tone="info" />
            <StatCard label={t("analytics.carcassWeight")} value={formatCompact(meat$.carcassKg)} unit="kg" tone="success" />
            <StatCard label={t("analytics.dressingPct")} value={formatNumber(meat$.dressingPct)} unit="%" />
            <StatCard label={t("analytics.meatRevenue")} value={formatCompact(meat$.revenue)} tone="success" />
            <StatCard label={t("analytics.avgCarcass")} value={formatNumber(meat$.avgCarcassKg)} unit="kg" />
          </motion.div>

          <div className="mt-3">
            <ChartCard title={t("analytics.meatOfftake")} description={t("common.last12m")}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={meatSeries} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => formatMonth(v, locale)} minTickGap={10} />
                  <YAxis yAxisId="l" {...axisProps} width={54} tickFormatter={(v: number) => formatCompact(v)} />
                  <YAxis yAxisId="r" orientation="right" {...axisProps} width={30} />
                  <RTooltip content={<ChartTooltip labelFormatter={(l) => formatMonth(l, locale)} />} />
                  <Bar yAxisId="l" dataKey="revenue" name={t("analytics.meatRevenue")} fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="r" dataKey="head" name={t("analytics.headSold")} fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </TabsContent>

        {/* --------------------------------- Growth ------------------------------- */}
        <TabsContent value="growth">
          <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-3 xl:grid-cols-2">
            <ChartCard
              className="xl:col-span-2"
              title={t("analytics.weightForAge")}
              description={t("analytics.growthTab")}
            >
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={growth$.weightForAge} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="ageMonths" {...axisProps} label={{ value: t("analytics.ageMonths"), position: "insideBottom", offset: -2, fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis {...axisProps} width={44} />
                  <RTooltip content={<ChartTooltip formatter={(v) => `${formatNumber(v)} kg`} />} />
                  <Line type="monotone" dataKey="weightKg" name={t("animals.weight")} stroke="var(--chart-2)" strokeWidth={2.4} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-2 gap-3 self-start">
              <StatCard label={t("analytics.avgDailyGain")} value={formatNumber(growth$.avgADG)} unit="kg/d" tone="success" />
              <StatCard label={t("analytics.growingStock")} value={formatNumber(growth$.growingCount)} />
              <StatCard label={t("analytics.calvesADG")} value={formatNumber(growth$.calves.adg)} unit="kg/d" tone="info" />
              <StatCard label={t("analytics.yearlingsADG")} value={formatNumber(growth$.yearlings.adg)} unit="kg/d" tone="info" />
            </div>
          </motion.div>
        </TabsContent>

        {/* -------------------------------- Breeding ------------------------------ */}
        <TabsContent value="breeding">
          <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-3 xl:grid-cols-2">
            <ChartCard title={t("analytics.breeding")} description={t("breeding.conception")}>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={breedingRadar} outerRadius="72%">
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <Radar
                    name={t("common.value")}
                    dataKey="value"
                    stroke="var(--chart-1)"
                    fill="var(--chart-1)"
                    fillOpacity={0.28}
                    strokeWidth={2}
                  />
                  <RTooltip content={<ChartTooltip formatter={(v) => `${formatNumber(v)}`} />} />
                </RadarChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-2 gap-3 self-start">
              <StatCard label={t("kpi.conceptionRate")} value={formatNumber(breed$.conceptionRate)} unit="%" tone="success" />
              <StatCard label={t("breeding.servicesPerConception")} value={formatNumber(breed$.servicesPerConception)} />
              <StatCard label={t("breeding.calfSurvival")} value={formatNumber(breed$.calfSurvival)} unit="%" tone="success" />
              <StatCard label={t("breeding.abortions")} value={formatNumber(breed$.abortionRate)} unit="%" tone="warning" />
              <StatCard label={t("breeding.twins")} value={formatNumber(breed$.twins)} />
              <StatCard label={t("breeding.stillbirths")} value={formatNumber(breed$.stillbirths)} />
            </div>
          </motion.div>
        </TabsContent>

        {/* --------------------------------- Health ------------------------------- */}
        <TabsContent value="health">
          <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-3 xl:grid-cols-2">
            <ChartCard className="xl:col-span-2" title={t("dashboard.diseaseTrends")} description={t("common.last12m")}>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={disease} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => formatMonth(v, locale)} minTickGap={10} />
                  <YAxis {...axisProps} width={36} />
                  <RTooltip content={<ChartTooltip labelFormatter={(l) => formatMonth(l, locale)} />} />
                  {["mastitis", "lameness", "metabolic", "respiratory", "other"].map((key, i) => (
                    <Area
                      key={key}
                      type="monotone"
                      stackId="1"
                      dataKey={key}
                      name={key}
                      stroke={CHART_COLORS[i]}
                      fill={CHART_COLORS[i]}
                      fillOpacity={0.42}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t("analytics.mortality")} description={t("common.last12m")}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={mortalityByMonth} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => formatMonth(v, locale)} minTickGap={10} />
                  <YAxis {...axisProps} width={36} />
                  <RTooltip content={<ChartTooltip labelFormatter={(l) => formatMonth(l, locale)} />} />
                  <Bar dataKey="deaths" name={t("analytics.mortality")} fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t("health.treatmentCost")} description={t("common.last12m")}>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart
                  data={Object.entries(groupBy(health, (h) => monthKey(h.date)))
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .slice(-12)
                    .map(([month, list]) => ({ month, cost: sum(list.map((h) => h.cost)) }))}
                  margin={{ top: 6, right: 8, left: -6, bottom: 0 }}
                >
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => formatMonth(v, locale)} minTickGap={10} />
                  <YAxis {...axisProps} width={52} tickFormatter={(v: number) => formatCompact(v)} />
                  <RTooltip
                    content={<ChartTooltip labelFormatter={(l) => formatMonth(l, locale)} formatter={(v) => formatCurrency(v)} />}
                  />
                  <Line type="monotone" dataKey="cost" name={t("health.treatmentCost")} stroke="var(--chart-3)" strokeWidth={2.2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </motion.div>
        </TabsContent>

        {/* -------------------------------- Financial ----------------------------- */}
        <TabsContent value="financial">
          <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-3">
            <ChartCard title={t("finance.pnl")} description={t("common.last12m")}>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={finance} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => formatMonth(v, locale)} minTickGap={10} />
                  <YAxis {...axisProps} width={54} tickFormatter={(v: number) => formatCompact(v)} />
                  <RTooltip
                    content={<ChartTooltip labelFormatter={(l) => formatMonth(l, locale)} formatter={(v) => formatCurrency(v)} />}
                  />
                  <Bar dataKey="income" name={t("finance.income")} fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expense" name={t("finance.expenses")} fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="profit" name={t("finance.profit")} fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </motion.div>
        </TabsContent>

        {/* ----------------------------------- Feed -------------------------------- */}
        <TabsContent value="feed">
          <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-3 xl:grid-cols-2">
            <ChartCard className="xl:col-span-2" title={t("kpi.feedEfficiency")} description={t("common.last90")}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={efficiency} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
                  <YAxis yAxisId="l" {...axisProps} width={44} />
                  <YAxis yAxisId="r" orientation="right" {...axisProps} width={50} tickFormatter={(v: number) => formatCompact(v)} />
                  <RTooltip content={<ChartTooltip labelFormatter={(l) => formatDate(l, locale)} />} />
                  <Line yAxisId="l" type="monotone" dataKey="efficiency" name={t("feed.fcr")} stroke="var(--chart-4)" strokeWidth={2.2} dot={false} />
                  <Line yAxisId="r" type="monotone" dataKey="kg" name={t("feed.consumption")} stroke="var(--chart-3)" strokeWidth={1.6} dot={false} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <div className="grid grid-cols-2 gap-3 self-start">
              <StatCard
                label={t("feed.fcr")}
                value={formatNumber(feed$.kgPerLiter, { maximumFractionDigits: 2 })}
                unit={`${t("common.kg")}/${t("common.liters")}`}
                tone={feed$.kgPerLiter <= 6 ? "success" : "warning"}
              />
              <StatCard label={t("kpi.feedCostPerLiter")} value={formatNumber(feed$.costPerLiter, { maximumFractionDigits: 2 })} unit="EGP" />
              <StatCard label={t("feed.daysCover")} value={formatNumber(feed$.daysCover)} unit={t("common.days")} />
              <StatCard label={t("feed.lowStock")} value={formatNumber(feed$.lowStockCount)} tone="warning" />
            </div>
          </motion.div>
        </TabsContent>

        {/* ------------------------------- Sustainability -------------------------- */}
        <TabsContent value="green">
          <motion.div
            variants={gridStagger}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
          >
            <StatCard label={t("analytics.co2")} value={formatCompact(green$.co2eKg)} unit="kg" icon={Leaf} tone="warning" />
            <StatCard
              label={t("analytics.co2PerLiter")}
              value={formatNumber(green$.co2PerLiter, { maximumFractionDigits: 2 })}
              icon={Leaf}
              tone="info"
            />
            <StatCard label={t("analytics.waterUse")} value={formatCompact(green$.waterM3)} unit="m³" icon={Droplets} />
            <StatCard label={t("analytics.electricity")} value={formatCompact(green$.electricityKwh)} unit="kWh" icon={Zap} />
            <StatCard
              label="kWh / L"
              value={formatNumber(green$.kwhPerLiter, { maximumFractionDigits: 3 })}
              icon={Zap}
              tone="info"
            />
            <StatCard
              label={t("analytics.outages")}
              value={formatNumber(green$.outageMinutes)}
              unit="min"
              icon={Zap}
              tone={green$.outageMinutes > 300 ? "warning" : "success"}
            />
          </motion.div>

          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <ChartCard title={t("analytics.waterUse")} description={t("common.last90")}>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={utilitySeries} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
                  <YAxis {...axisProps} width={44} />
                  <RTooltip content={<ChartTooltip labelFormatter={(l) => formatDate(l, locale)} />} />
                  <Area type="monotone" dataKey="water" name={t("analytics.waterUse")} stroke="var(--chart-6)" fill="var(--chart-6)" fillOpacity={0.25} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={t("analytics.co2")} description={t("common.last90")}>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={utilitySeries} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
                  <YAxis {...axisProps} width={52} tickFormatter={(v: number) => formatCompact(v)} />
                  <RTooltip content={<ChartTooltip labelFormatter={(l) => formatDate(l, locale)} />} />
                  <Area type="monotone" dataKey="co2" name={t("analytics.co2")} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.25} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Utilities as money — last 30 days */}
            <ChartCard
              title={locale === "ar" ? "تكلفة المرافق" : "Utility costs"}
              description={locale === "ar" ? "آخر 30 يومًا (بأسعار تقديرية)" : "Last 30 days (estimated tariffs)"}
              className="xl:col-span-2"
            >
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { k: locale === "ar" ? "الكهرباء" : "Electricity", v: utilCost.electricity },
                  { k: locale === "ar" ? "المياه" : "Water", v: utilCost.water },
                  { k: locale === "ar" ? "الغاز" : "Gas", v: utilCost.gas },
                  { k: locale === "ar" ? "الديزل" : "Diesel", v: utilCost.diesel },
                  { k: locale === "ar" ? "توفير الطاقة الشمسية" : "Solar savings", v: -utilCost.solarSavings },
                ].map((row) => (
                  <div key={row.k}>
                    <p className="text-[11px] text-muted-foreground">{row.k}</p>
                    <p className={"text-[15px] font-semibold " + (row.v < 0 ? "text-emerald-600 dark:text-emerald-500" : "")}>
                      {row.v < 0 ? "−" : ""}{formatCurrency(Math.abs(row.v))}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
                <span className="text-[13px] font-medium">
                  {locale === "ar" ? "صافي فاتورة المرافق (شهريًا)" : "Net utility bill (monthly)"}
                </span>
                <span className="text-[17px] font-semibold text-primary">{formatCurrency(utilCost.net)}</span>
              </div>
            </ChartCard>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
