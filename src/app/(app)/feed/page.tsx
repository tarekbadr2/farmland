"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Boxes, Leaf, Package, Percent, Wheat } from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ChartCard, ChartTooltip, CHART_COLORS, axisProps, gridProps } from "@/components/common/chart";
import { DataTable, type Column } from "@/components/common/data-table";
import { LogFeedingDialog } from "@/components/feed/log-feeding-dialog";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import {
  useFeedConsumption,
  useFeedItems,
  useMilkDaily,
  useRations,
  useZones,
} from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import { diffDays, formatDate } from "@/lib/date";
import { feedEfficiencySeries, feedMetrics } from "@/core/services/metrics";
import { groupBy, round, sum } from "@/lib/utils";
import type { FeedItem } from "@/core/domain/types";

export default function FeedPage() {
  const { t, ln, locale, formatNumber, formatCurrency, formatCompact } = useI18n();
  const { data: items = [], isLoading } = useFeedItems();
  const { data: rations = [] } = useRations();
  const { data: consumption = [] } = useFeedConsumption();
  const { data: daily = [] } = useMilkDaily();
  const { data: zones = [] } = useZones();

  const m = React.useMemo(
    () => feedMetrics(items, consumption, daily, TODAY, rations),
    [items, consumption, daily, rations],
  );
  const efficiency = React.useMemo(
    () => feedEfficiencySeries(consumption, daily, 60),
    [consumption, daily],
  );

  const byPen = React.useMemo(() => {
    const last30 = consumption.filter((c) => diffDays(TODAY, c.date) <= 30);
    const grouped = groupBy(last30, (c) => c.zoneId);
    return Object.entries(grouped)
      .map(([zoneId, list]) => {
        const zone = zones.find((z) => z.id === zoneId);
        return {
          zoneId,
          name: zone ? ln(zone) : zoneId,
          kg: round(sum(list.map((l) => l.kg)), 0),
          cost: sum(list.map((l) => l.cost)),
          heads: list[0]?.heads ?? 0,
        };
      })
      .sort((a, b) => b.kg - a.kg);
  }, [consumption, zones, ln]);

  const byCategory = React.useMemo(() => {
    const grouped = groupBy(items, (i) => i.category);
    return Object.entries(grouped).map(([category, list], i) => ({
      category,
      label: t(`feedCategory.${category}` as never),
      value: sum(list.map((x) => x.stock * x.costPerUnit)),
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [items, t]);

  const columns: Column<FeedItem>[] = [
    {
      key: "name",
      header: t("common.name"),
      cell: (i) => (
        <div>
          <p className="text-[13px] font-medium">{ln(i)}</p>
          <p className="text-[11px] text-muted-foreground">
            {t(`feedCategory.${i.category}` as never)}
          </p>
        </div>
      ),
    },
    {
      key: "stock",
      header: t("feed.stock"),
      align: "end",
      cell: (i) => {
        const ratio = (i.stock / Math.max(1, i.reorderLevel * 2)) * 100;
        return (
          <div className="flex items-center justify-end gap-2">
            <div className="w-16">
              <Progress
                value={Math.min(100, ratio)}
                className="h-1.5"
                indicatorClassName={
                  i.stock <= i.reorderLevel ? "bg-destructive" : ratio < 60 ? "bg-[var(--warning)]" : undefined
                }
              />
            </div>
            <span className="tabular w-20 text-end text-[12.5px] font-medium">
              {formatNumber(i.stock)} {i.unit}
            </span>
          </div>
        );
      },
    },
    {
      key: "reorder",
      header: t("feed.reorderLevel"),
      align: "end",
      secondary: true,
      cell: (i) => (
        <span className="tabular text-[12.5px] text-muted-foreground">
          {formatNumber(i.reorderLevel)}
        </span>
      ),
    },
    {
      key: "protein",
      header: t("feed.proteinPct"),
      align: "end",
      secondary: true,
      cell: (i) => <span className="tabular text-[12.5px]">{formatNumber(i.proteinPct)}%</span>,
    },
    {
      key: "dm",
      header: t("feed.dryMatter"),
      align: "end",
      secondary: true,
      cell: (i) => <span className="tabular text-[12.5px]">{formatNumber(i.dryMatterPct)}%</span>,
    },
    {
      key: "cost",
      header: t("feed.costPerUnit"),
      align: "end",
      cell: (i) => <span className="tabular text-[12.5px]">{formatCurrency(i.costPerUnit)}</span>,
    },
    {
      key: "value",
      header: t("common.value"),
      align: "end",
      cell: (i) => (
        <span className="tabular text-[12.5px] font-medium">
          {formatCompact(i.stock * i.costPerUnit)}
        </span>
      ),
    },
    {
      key: "expiry",
      header: t("feed.expiry"),
      secondary: true,
      cell: (i) =>
        i.expiresAt ? (
          <Badge variant={diffDays(i.expiresAt, TODAY) < 30 ? "warning" : "outline"}>
            {formatDate(i.expiresAt, locale, { year: "2-digit" })}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("feed.title")}
        subtitle={t("feed.subtitle")}
        actions={<LogFeedingDialog />}
      />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        <StatCard label={t("common.value")} value={formatCompact(m.stockValue)} icon={Boxes} tone="info" />
        <StatCard
          label={t("feed.daysCover")}
          value={formatNumber(m.daysCover)}
          unit={t("common.days")}
          icon={Wheat}
          tone={m.daysCover < 14 ? "warning" : "success"}
        />
        <StatCard
          label={t("feed.lowStock")}
          value={formatNumber(m.lowStockCount)}
          icon={AlertTriangle}
          tone={m.lowStockCount ? "warning" : "success"}
        />
        <StatCard
          label={t("feed.fcr")}
          value={formatNumber(m.kgPerLiter, { maximumFractionDigits: 2 })}
          unit={`${t("common.kg")}/${t("common.liters")}`}
          icon={Percent}
          tone={m.kgPerLiter <= 6 ? "success" : "warning"}
        />
        <StatCard
          label={t("kpi.feedCostPerLiter")}
          value={formatNumber(m.costPerLiter, { maximumFractionDigits: 2 })}
          unit="EGP"
          icon={Leaf}
        />
        <StatCard
          label={t("feed.consumption")}
          value={formatCompact(m.feedCost30)}
          icon={Package}
          hint={`${formatCompact(m.youngstockFeedCost30)} ${t("kpi.calves").toLowerCase()} · ${t("common.last30")}`}
        />
      </motion.div>

      <motion.div variants={gridStagger} initial="hidden" animate="show" className="mt-4 grid gap-3 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title={t("feed.byPen")} description={t("common.last30")}>
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={byPen} margin={{ top: 6, right: 8, left: -6, bottom: 40 }}>
              <CartesianGrid {...gridProps} />
              <XAxis
                dataKey="name"
                {...axisProps}
                angle={-32}
                textAnchor="end"
                height={60}
                interval={0}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              />
              <YAxis {...axisProps} width={50} tickFormatter={(v: number) => formatCompact(v)} />
              <RTooltip content={<ChartTooltip formatter={(v) => `${formatNumber(v)} ${t("common.kg")}`} />} />
              <Bar dataKey="kg" name={t("feed.consumption")} radius={[4, 4, 0, 0]}>
                {byPen.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("common.value")} description={t("feed.inventory")}>
          <div className="flex items-center">
            <ResponsiveContainer width="52%" height={230}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="label" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
                  {byCategory.map((c) => (
                    <Cell key={c.category} fill={c.color} />
                  ))}
                </Pie>
                <RTooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="flex-1 space-y-2 pe-3">
              {byCategory.map((c) => (
                <li key={c.category} className="flex items-center gap-2 text-[12px]">
                  <span className="size-2 rounded-[3px]" style={{ background: c.color }} />
                  <span className="truncate text-muted-foreground">{c.label}</span>
                  <span className="tabular ms-auto font-medium">{formatCompact(c.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>

        <ChartCard className="xl:col-span-3" title={t("kpi.feedEfficiency")} description={t("feed.kgPerLiter")}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={efficiency} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
              <YAxis yAxisId="l" {...axisProps} width={44} />
              <YAxis yAxisId="r" orientation="right" {...axisProps} width={44} tickFormatter={(v: number) => formatCompact(v)} />
              <RTooltip content={<ChartTooltip labelFormatter={(l) => formatDate(l, locale)} />} />
              <Line yAxisId="l" type="monotone" dataKey="efficiency" name={t("feed.fcr")} stroke="var(--chart-4)" strokeWidth={2} dot={false} />
              <Line yAxisId="r" type="monotone" dataKey="milkL" name={t("nav.milk")} stroke="var(--chart-1)" strokeWidth={1.6} dot={false} strokeDasharray="4 3" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      <motion.div variants={cardIn} initial="hidden" animate="show" className="mt-4">
        <Card>
          <div className="px-5 pb-2 pt-4">
            <CardTitle>{t("feed.inventory")}</CardTitle>
            <CardDescription>
              {formatNumber(items.length)} {t("common.results")}
            </CardDescription>
          </div>
          <CardContent className="px-0 pb-0">
            <Tabs defaultValue="stock">
              <div className="px-5">
                <TabsList className="mb-2">
                  <TabsTrigger value="stock">{t("feed.stock")}</TabsTrigger>
                  <TabsTrigger value="rations">{t("feed.rations")}</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="stock">
                <DataTable
                  columns={columns}
                  rows={items}
                  loading={isLoading}
                  mobileCard={(i) => (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[13.5px] font-medium">{ln(i)}</p>
                        {i.stock <= i.reorderLevel && (
                          <Badge variant="destructive">{t("feed.lowStock")}</Badge>
                        )}
                      </div>
                      <p className="tabular mt-1 text-[12px] text-muted-foreground">
                        {formatNumber(i.stock)} {i.unit} · {formatCurrency(i.costPerUnit)}/{i.unit}
                      </p>
                    </div>
                  )}
                />
              </TabsContent>

              <TabsContent value="rations">
                <div className="grid gap-3 p-5 pt-2 md:grid-cols-2">
                  {rations.map((r) => (
                    <Card key={r.id} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[14px] font-semibold">{ln(r)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {t("common.head")}: {r.targetGroup}
                          </p>
                        </div>
                        <Badge variant="default">
                          {formatCurrency(r.costPerHead)} / {t("common.head")}
                        </Badge>
                      </div>
                      <ul className="mt-3 space-y-1.5">
                        {r.components.map((c) => {
                          const item = items.find((i) => i.id === c.feedItemId);
                          const total = sum(r.components.map((x) => x.kgPerHead));
                          return (
                            <li key={c.feedItemId} className="flex items-center gap-2 text-[12px]">
                              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                {item ? ln(item) : c.feedItemId}
                              </span>
                              <div className="w-20">
                                <Progress value={(c.kgPerHead / total) * 100} className="h-1.5" />
                              </div>
                              <span className="tabular w-14 text-end font-medium">
                                {formatNumber(c.kgPerHead)} {t("common.kg")}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}
