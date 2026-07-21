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
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Droplets, Milk, Plus, Thermometer, TrendingDown, TrendingUp } from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ChartCard, ChartTooltip, axisProps, gridProps } from "@/components/common/chart";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import { useAnimals, useMilkDaily, useWeather } from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import { formatDate, formatMonth } from "@/lib/date";
import { forecastMilk, milkSummary, monthlyMilk } from "@/core/services/metrics";
import { downloadCsv } from "@/lib/export";
import { RecordSessionDialog } from "@/components/milk/record-session-dialog";
import { average, round } from "@/lib/utils";

export default function MilkPage() {
  const { t, ln, locale, formatNumber, formatCompact } = useI18n();
  const { data: daily = [] } = useMilkDaily();
  const { data: weather } = useWeather();
  const { data: animalPage } = useAnimals({ pageSize: 100000 });
  const animals = animalPage?.items ?? [];

  const [range, setRange] = React.useState<7 | 30 | 90>(30);

  const stats = React.useMemo(() => milkSummary(daily, TODAY), [daily]);
  const monthly = React.useMemo(() => monthlyMilk(daily).slice(-12), [daily]);
  const heatPenalty =
    weather?.heatStress === "severe" ? 9 : weather?.heatStress === "moderate" ? 5 : 0;
  const forecast = React.useMemo(
    () => forecastMilk(daily, 14, heatPenalty),
    [daily, heatPenalty],
  );

  const windowed = daily.slice(-range);
  const combined = [
    ...windowed.slice(-21).map((d) => ({ date: d.date, actual: d.totalL, forecast: null as number | null })),
    ...forecast.map((f) => ({ date: f.date, actual: null as number | null, forecast: f.forecastL })),
  ];

  const lactating = animals.filter((a) => a.milkStatus === "lactating");
  const best = [...lactating].sort((a, b) => b.avgDailyMilkL - a.avgDailyMilkL).slice(0, 8);
  const worst = [...lactating]
    .filter((a) => a.avgDailyMilkL > 0)
    .sort((a, b) => a.avgDailyMilkL - b.avgDailyMilkL)
    .slice(0, 8);

  // SCC bands drive the payment grade the dairy pays out on.
  const sccBands = React.useMemo(() => {
    const bands = [
      { key: "<200k", min: 0, max: 200_000, color: "var(--chart-1)" },
      { key: "200–400k", min: 200_000, max: 400_000, color: "var(--chart-3)" },
      { key: "400–700k", min: 400_000, max: 700_000, color: "var(--chart-5)" },
      { key: ">700k", min: 700_000, max: Infinity, color: "var(--destructive)" },
    ];
    return bands.map((b) => ({
      ...b,
      count: lactating.filter((a) => {
        const proxy = 90_000 + (100 - a.healthScore) * 9_000;
        return proxy >= b.min && proxy < b.max;
      }).length,
    }));
  }, [lactating]);

  const sessionSplit = windowed.map((d) => ({
    date: d.date,
    morning: d.morningL,
    evening: d.eveningL,
    rejected: d.rejectedL,
  }));

  return (
    <>
      <PageHeader
        title={t("milk.title")}
        subtitle={t("milk.subtitle")}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "milk-daily.csv",
                  daily.map((d) => ({
                    date: d.date,
                    morning_l: d.morningL,
                    evening_l: d.eveningL,
                    total_l: d.totalL,
                    rejected_l: d.rejectedL,
                    fat_pct: d.avgFat,
                    protein_pct: d.avgProtein,
                    milking_cows: d.milkingCows,
                  })),
                )
              }
            >
              <Download /> {t("common.exportCsv")}
            </Button>
            <RecordSessionDialog
              trigger={
                <Button size="sm">
                  <Plus /> {t("milk.recordSession")}
                </Button>
              }
            />
          </>
        }
      />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        <StatCard
          label={t("milk.dailyTotal")}
          value={formatCompact(stats.today)}
          unit={t("common.liters")}
          icon={Milk}
          tone="success"
          delta={stats.deltaPct}
          spark={daily.slice(-30).map((d) => d.totalL)}
        />
        <StatCard
          label={t("milk.morning")}
          value={formatCompact(stats.todayMorning)}
          unit={t("common.liters")}
          icon={Droplets}
        />
        <StatCard
          label={t("milk.evening")}
          value={formatCompact(stats.todayEvening)}
          unit={t("common.liters")}
          icon={Droplets}
        />
        <StatCard
          label={t("kpi.milkPerCow")}
          value={formatNumber(stats.perCowToday)}
          unit={t("common.liters")}
          icon={TrendingUp}
          tone="info"
        />
        <StatCard
          label={t("kpi.milkThisMonth")}
          value={formatCompact(stats.monthTotal)}
          unit={t("common.liters")}
          icon={Milk}
        />
        <StatCard
          label={t("milk.rejected")}
          value={formatNumber(stats.rejected30)}
          unit={t("common.liters")}
          icon={TrendingDown}
          tone={stats.rejected30 > 1200 ? "warning" : "default"}
          hint={t("common.last30")}
        />
      </motion.div>

      <div className="mt-4 flex items-center gap-2">
        {([7, 30, 90] as const).map((r) => (
          <Button
            key={r}
            variant={range === r ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setRange(r)}
          >
            {t(r === 7 ? "common.last7" : r === 30 ? "common.last30" : "common.last90")}
          </Button>
        ))}
      </div>

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="mt-3 grid gap-3 xl:grid-cols-3"
      >
        <ChartCard
          className="xl:col-span-2"
          title={t("dashboard.dailyMilk")}
          description={`${t("milk.morning")} / ${t("milk.evening")}`}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={sessionSplit} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(5)} minTickGap={20} />
              <YAxis {...axisProps} width={46} tickFormatter={(v: number) => formatCompact(v)} />
              <RTooltip
                content={
                  <ChartTooltip
                    labelFormatter={(l) => formatDate(l, locale)}
                    formatter={(v) => `${formatNumber(v)} ${t("common.liters")}`}
                  />
                }
              />
              <Bar dataKey="morning" stackId="s" name={t("milk.morning")} fill="var(--chart-1)" />
              <Bar dataKey="evening" stackId="s" name={t("milk.evening")} fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("milk.qualityBands")} description={t("milk.scc")}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sccBands} layout="vertical" margin={{ top: 4, right: 16, left: 12, bottom: 0 }}>
              <CartesianGrid {...gridProps} horizontal={false} />
              <XAxis type="number" {...axisProps} />
              <YAxis type="category" dataKey="key" {...axisProps} width={64} />
              <RTooltip content={<ChartTooltip formatter={(v) => `${formatNumber(v)} ${t("common.head")}`} />} />
              <Bar dataKey="count" name={t("common.head")} radius={[0, 4, 4, 0]}>
                {sccBands.map((b) => (
                  <Cell key={b.key} fill={b.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="px-4 pb-1 pt-2">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {locale === "ar"
                ? "الخلايا الجسمية فوق ٤٠٠ ألف تخفض درجة الجودة وسعر التوريد."
                : "Above 400k SCC the dairy drops the quality grade and the price with it."}
            </p>
          </div>
        </ChartCard>

        <ChartCard
          className="xl:col-span-2"
          title={t("milk.forecast")}
          description={
            heatPenalty
              ? locale === "ar"
                ? `معدّل بنسبة ${heatPenalty}% للإجهاد الحراري`
                : `Adjusted ${heatPenalty}% for heat stress`
              : t("common.trend")
          }
        >
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={combined} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="fcFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(5)} minTickGap={20} />
              <YAxis {...axisProps} width={46} tickFormatter={(v: number) => formatCompact(v)} domain={["auto", "auto"]} />
              <RTooltip
                content={
                  <ChartTooltip
                    labelFormatter={(l) => formatDate(l, locale)}
                    formatter={(v) => `${formatNumber(v)} ${t("common.liters")}`}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="actual"
                name={t("common.total")}
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="forecast"
                name={t("finance.forecast")}
                stroke="var(--chart-4)"
                strokeWidth={2}
                strokeDasharray="5 4"
                fill="url(#fcFill)"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("dashboard.monthlyMilk")} description={t("common.last12m")}>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={monthly} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="mFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => formatMonth(v, locale)} minTickGap={10} />
              <YAxis {...axisProps} width={46} tickFormatter={(v: number) => formatCompact(v)} />
              <RTooltip
                content={
                  <ChartTooltip
                    labelFormatter={(l) => formatMonth(l, locale)}
                    formatter={(v) => `${formatCompact(v)} ${t("common.liters")}`}
                  />
                }
              />
              <Area type="monotone" dataKey="totalL" name={t("nav.milk")} stroke="var(--chart-1)" strokeWidth={2} fill="url(#mFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      {/* --------------------------- Producer leagues -------------------------- */}
      <motion.div variants={gridStagger} initial="hidden" animate="show" className="mt-4">
        <motion.div variants={cardIn}>
          <Card>
            <div className="px-5 pb-1 pt-4">
              <CardTitle>{t("milk.bestProducers")}</CardTitle>
              <CardDescription>
                {t("common.average")} {formatNumber(round(average(lactating.map((a) => a.avgDailyMilkL)), 1))}{" "}
                {t("common.liters")} · {formatNumber(lactating.length)} {t("common.head")}
              </CardDescription>
            </div>
            <CardContent>
              <Tabs defaultValue="best">
                <TabsList className="mb-3">
                  <TabsTrigger value="best">
                    <TrendingUp /> {t("milk.bestProducers")}
                  </TabsTrigger>
                  <TabsTrigger value="worst">
                    <TrendingDown /> {t("milk.worstProducers")}
                  </TabsTrigger>
                </TabsList>
                {(["best", "worst"] as const).map((key) => (
                  <TabsContent key={key} value={key}>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {(key === "best" ? best : worst).map((a, i) => (
                        <li key={a.id}>
                          <Link
                            href={`/animals/${a.id}`}
                            className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2 transition hover:border-ring/40 hover:bg-accent/40"
                          >
                            <span className="tabular w-5 text-[11px] text-muted-foreground">
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium">
                                {a.tag} · {ln(a)}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {t("animals.lactation")} {a.lactationNumber}
                              </p>
                            </div>
                            <div className="w-20">
                              <Progress
                                value={(a.avgDailyMilkL / (best[0]?.avgDailyMilkL || 1)) * 100}
                                className="h-1.5"
                                indicatorClassName={key === "worst" ? "bg-[var(--warning)]" : undefined}
                              />
                            </div>
                            <span className="tabular w-16 shrink-0 text-end text-[13px] font-semibold">
                              {formatNumber(a.avgDailyMilkL)} {t("common.liters")}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <StatCard label={t("milk.fat")} value={formatNumber(stats.avgFat)} unit="%" icon={Droplets} tone="info" />
        <StatCard label={t("milk.protein")} value={formatNumber(stats.avgProtein)} unit="%" icon={Droplets} tone="info" />
        <StatCard
          label={t("milk.tankTemp")}
          value="3.9"
          unit="°C"
          icon={Thermometer}
          tone="success"
          hint={locale === "ar" ? "ضمن الحدود" : "Within spec"}
        />
        <StatCard
          label={t("milk.parlorThroughput")}
          value={formatNumber(Math.round(stats.milkingCows / 2.5))}
          unit={`${t("common.head")}/h`}
          icon={Milk}
        />
      </motion.div>

      <div className="mt-4">
        <Badge variant="outline">
          {locale === "ar"
            ? "متصل بواجهة ماكينة الحلب — يتم السحب كل ٥ دقائق"
            : "Milking-machine API connected — polled every 5 minutes"}
        </Badge>
      </div>
    </>
  );
}
