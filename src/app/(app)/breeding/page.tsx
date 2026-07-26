"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Baby,
  CalendarClock,
  Dna,
  HeartCrack,
  Snowflake,
  Syringe,
  TrendingUp,
} from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ChartCard, ChartTooltip, axisProps, gridProps } from "@/components/common/chart";
import { DataTable, type Column } from "@/components/common/data-table";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import { useAnimals, useBreeding, useSemen } from "@/hooks/use-farm-data";
import { LogBreedingDialog } from "@/components/breeding/log-breeding-dialog";
import { Can } from "@/lib/auth/guard";
import { TODAY } from "@/core/data/seed";
import { diffDays, formatDate, monthKey, relativeDays } from "@/lib/date";
import { breedingMetrics } from "@/core/services/metrics";
import { groupBy } from "@/lib/utils";
import type { Animal, SemenStraw } from "@/core/domain/types";
import { useRouter } from "next/navigation";

export default function BreedingPage() {
  const { t, ln, locale, formatNumber, formatCurrency } = useI18n();
  const router = useRouter();
  const { data: animalPage } = useAnimals({ pageSize: 100000 });
  const { data: events = [] } = useBreeding();
  const { data: semen = [] } = useSemen();
  const animals = React.useMemo(() => animalPage?.items ?? [], [animalPage]);

  const m = React.useMemo(() => breedingMetrics(events, animals, TODAY), [events, animals]);

  const monthlyEvents = React.useMemo(() => {
    const byMonth = groupBy(events, (e) => monthKey(e.date));
    return Object.keys(byMonth)
      .sort()
      .slice(-12)
      .map((month) => {
        const list = byMonth[month];
        return {
          month,
          ai: list.filter((e) => e.type === "ai").length,
          calvings: list.filter((e) => e.type === "calving").length,
          heats: list.filter((e) => e.type === "heat").length,
          abortions: list.filter((e) => e.type === "abortion").length,
        };
      });
  }, [events]);

  // All four steps are measured over the same rolling 12 months, so the funnel
  // actually narrows the way a funnel should.
  const funnel = [
    { key: t("breeding.heatDetection"), value: m.heats, color: "var(--chart-2)" },
    { key: t("breeding.insemination"), value: m.inseminations, color: "var(--chart-1)" },
    { key: t("breeding.pregnancyChecks"), value: m.checks, color: "var(--chart-3)" },
    { key: t("breeding.calvings"), value: m.calvings, color: "var(--chart-4)" },
  ];

  const sireStats = React.useMemo(() => {
    const withSire = events.filter((e) => e.sireId && (e.type === "ai" || e.type === "natural_mating"));
    const bySire = groupBy(withSire, (e) => e.sireId!);
    return Object.entries(bySire)
      .map(([sireId, list]) => {
        const sire = animals.find((a) => a.id === sireId);
        const daughters = list.map((l) => l.animalId);
        const pregnant = animals.filter(
          (a) => daughters.includes(a.id) && a.reproStatus === "pregnant",
        ).length;
        return {
          id: sireId,
          name: sire ? `${sire.tag} · ${ln(sire)}` : sireId,
          services: list.length,
          conception: Math.round((pregnant / Math.max(1, list.length)) * 100),
        };
      })
      .sort((a, b) => b.services - a.services)
      .slice(0, 8);
  }, [events, animals, ln]);

  const dueColumns: Column<Animal>[] = [
    {
      key: "tag",
      header: t("animals.tag"),
      cell: (a) => (
        <div>
          <p className="tabular text-[13px] font-medium">{a.tag}</p>
          <p className="text-[11px] text-muted-foreground">{ln(a)}</p>
        </div>
      ),
    },
    {
      key: "due",
      header: t("animals.dueDate"),
      cell: (a) => (
        <span className="tabular text-[12.5px]">{formatDate(a.expectedCalvingDate!, locale)}</span>
      ),
    },
    {
      key: "in",
      header: t("common.trend"),
      cell: (a) => {
        const d = diffDays(a.expectedCalvingDate!, TODAY);
        return (
          <Badge variant={d <= 7 ? "destructive" : d <= 30 ? "warning" : "outline"}>
            {relativeDays(a.expectedCalvingDate!, TODAY, locale)}
          </Badge>
        );
      },
    },
    {
      key: "lact",
      header: t("animals.lactation"),
      secondary: true,
      align: "end",
      cell: (a) => <span className="tabular text-[12.5px]">{formatNumber(a.lactationNumber)}</span>,
    },
  ];

  const semenColumns: Column<SemenStraw>[] = [
    { key: "sire", header: t("breeding.sire"), cell: (s) => <span className="text-[13px] font-medium">{s.sireName}</span> },
    { key: "batch", header: t("breeding.batch"), cell: (s) => <span className="tabular text-[12.5px]">{s.batch}</span> },
    { key: "breed", header: t("animals.breed"), secondary: true, cell: (s) => t(`breeds.${s.sireBreed}`) },
    {
      key: "qty",
      header: t("common.quantity"),
      align: "end",
      cell: (s) => (
        <span className={s.quantity < 10 ? "tabular text-[12.5px] font-semibold text-destructive" : "tabular text-[12.5px]"}>
          {formatNumber(s.quantity)} {t("breeding.straws")}
        </span>
      ),
    },
    {
      key: "cr",
      header: t("breeding.conception"),
      align: "end",
      cell: (s) => (
        <Badge variant={s.conceptionRate >= 60 ? "success" : s.conceptionRate >= 45 ? "warning" : "destructive"}>
          {formatNumber(s.conceptionRate)}%
        </Badge>
      ),
    },
    {
      key: "exp",
      header: t("feed.expiry"),
      secondary: true,
      cell: (s) => <span className="tabular text-[12.5px]">{formatDate(s.expiresAt, locale)}</span>,
    },
    {
      key: "cost",
      header: t("common.cost"),
      align: "end",
      secondary: true,
      cell: (s) => <span className="tabular text-[12.5px]">{formatCurrency(s.costPerStraw)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title={t("breeding.title")}
        subtitle={t("breeding.subtitle")}
        actions={<Can permission="breeding.write"><LogBreedingDialog /></Can>}
      />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        <StatCard
          label={t("kpi.conceptionRate")}
          value={formatNumber(m.conceptionRate)}
          unit="%"
          icon={TrendingUp}
          tone={m.conceptionRate >= 50 ? "success" : "warning"}
        />
        <StatCard
          label={t("breeding.servicesPerConception")}
          value={formatNumber(m.servicesPerConception)}
          icon={Syringe}
          tone={m.servicesPerConception <= 2 ? "success" : "warning"}
        />
        <StatCard label={t("kpi.pregnant")} value={formatNumber(m.pregnancyRate)} unit="%" icon={Activity} tone="info" />
        <StatCard label={t("breeding.dueThisWeek")} value={formatNumber(m.dueThisWeek)} icon={CalendarClock} tone="warning" />
        <StatCard label={t("breeding.calfSurvival")} value={formatNumber(m.calfSurvival)} unit="%" icon={Baby} tone="success" />
        <StatCard
          label={t("breeding.abortions")}
          value={formatNumber(m.abortions)}
          icon={HeartCrack}
          tone={m.abortionRate > 5 ? "destructive" : "default"}
          hint={`${formatNumber(m.abortionRate)}%`}
        />
      </motion.div>

      <motion.div variants={gridStagger} initial="hidden" animate="show" className="mt-4 grid gap-3 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title={t("breeding.title")} description={t("common.last12m")}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyEvents} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => v.slice(2)} minTickGap={10} />
              <YAxis {...axisProps} width={36} />
              <RTooltip content={<ChartTooltip />} />
              <Bar dataKey="heats" name={t("breeding.heatDetection")} fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="ai" name={t("breeding.insemination")} fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="calvings" name={t("breeding.calvings")} fill="var(--chart-4)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("breeding.funnel")} description={t("breeding.conception")}>
          <div className="space-y-3 px-4 py-3">
            {funnel.map((step, i) => {
              const width = (step.value / Math.max(1, funnel[0].value)) * 100;
              return (
                <motion.div
                  key={step.key}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                >
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground">{step.key}</span>
                    <span className="tabular font-medium">{formatNumber(step.value)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${width}%` }}
                      transition={{ duration: 0.6, delay: i * 0.07 }}
                      className="h-full rounded-full"
                      style={{ background: step.color }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </ChartCard>
      </motion.div>

      <motion.div variants={cardIn} initial="hidden" animate="show" className="mt-4">
        <Card>
          <div className="px-5 pb-2 pt-4">
            <CardTitle>{t("breeding.title")}</CardTitle>
            <CardDescription>
              {formatNumber(m.dueSoon.length)} {t("kpi.upcomingCalving").toLowerCase()} ·{" "}
              {formatNumber(semen.reduce((s, x) => s + x.quantity, 0))} {t("breeding.straws")}
            </CardDescription>
          </div>
          <CardContent className="px-0 pb-0">
            <Tabs defaultValue="due">
              <div className="px-5">
                <TabsList className="mb-2 flex w-full overflow-x-auto sm:w-auto">
                  <TabsTrigger value="due">
                    <CalendarClock /> {t("kpi.upcomingCalving")}
                  </TabsTrigger>
                  <TabsTrigger value="semen">
                    <Snowflake /> {t("breeding.semenInventory")}
                  </TabsTrigger>
                  <TabsTrigger value="sires">
                    <Dna /> {t("breeding.bullPerformance")}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="due">
                <DataTable
                  columns={dueColumns}
                  rows={m.dueSoon.slice(0, 40)}
                  onRowClick={(a) => router.push(`/animal?id=${a.id}`)}
                  mobileCard={(a) => (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="tabular text-[14px] font-medium">{a.tag}</p>
                        <p className="truncate text-[12px] text-muted-foreground">{ln(a)}</p>
                      </div>
                      <Badge variant={diffDays(a.expectedCalvingDate!, TODAY) <= 7 ? "destructive" : "warning"}>
                        {relativeDays(a.expectedCalvingDate!, TODAY, locale)}
                      </Badge>
                    </div>
                  )}
                />
              </TabsContent>

              <TabsContent value="semen">
                <DataTable
                  columns={semenColumns}
                  rows={semen}
                  mobileCard={(s) => (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium">{s.sireName}</p>
                        <p className="tabular truncate text-[12px] text-muted-foreground">
                          {s.batch} · {formatNumber(s.quantity)} {t("breeding.straws")}
                        </p>
                      </div>
                      <Badge variant={s.conceptionRate >= 60 ? "success" : "warning"}>
                        {formatNumber(s.conceptionRate)}%
                      </Badge>
                    </div>
                  )}
                />
              </TabsContent>

              <TabsContent value="sires">
                <div className="px-4 pb-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={sireStats} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 0 }}>
                      <CartesianGrid {...gridProps} horizontal={false} />
                      <XAxis type="number" {...axisProps} />
                      <YAxis type="category" dataKey="name" {...axisProps} width={130} />
                      <RTooltip content={<ChartTooltip />} />
                      <Bar dataKey="conception" name={t("breeding.conception")} radius={[0, 4, 4, 0]}>
                        {sireStats.map((s) => (
                          <Cell
                            key={s.id}
                            fill={s.conception >= 55 ? "var(--chart-1)" : s.conception >= 40 ? "var(--chart-3)" : "var(--chart-5)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat label={t("breeding.stillbirths")} value={formatNumber(m.stillbirths)} />
        <MiniStat label={t("breeding.twins")} value={formatNumber(m.twins)} />
        <MiniStat label={t("breeding.calvings")} value={formatNumber(m.calvings)} />
        <MiniStat label={t("breeding.dueThisMonth")} value={formatNumber(m.dueThisMonth)} />
      </div>

      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        <Link href="/animals?reproStatus=pregnant" className="underline underline-offset-4">
          {t("common.viewAll")} — {t("status.pregnant")}
        </Link>
      </p>
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold">{value}</p>
    </Card>
  );
}
