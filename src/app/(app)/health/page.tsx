"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
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
  AlertTriangle,
  HeartPulse,
  Plus,
  ShieldAlert,
  Stethoscope,
  Syringe,
  Thermometer,
} from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ChartCard, ChartTooltip, axisProps, gridProps } from "@/components/common/chart";
import { DataTable, type Column } from "@/components/common/data-table";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import { useAnimals, useHealth } from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import { diffDays, formatDate, formatMonth, relativeDays } from "@/lib/date";
import { diseaseTrend, healthMetrics } from "@/core/services/metrics";
import { downloadCsv } from "@/lib/export";
import type { HealthEvent } from "@/core/domain/types";
import { LogHealthDialog } from "@/components/health/log-health-dialog";

export default function HealthPage() {
  const router = useRouter();
  const { t, ln, locale, formatNumber, formatCurrency } = useI18n();
  const { data: events = [], isLoading } = useHealth();
  const { data: animalPage } = useAnimals({ pageSize: 100000 });
  const animals = React.useMemo(() => animalPage?.items ?? [], [animalPage]);

  const m = React.useMemo(() => healthMetrics(events, animals, TODAY), [events, animals]);
  const trend = React.useMemo(() => diseaseTrend(events, 12), [events]);

  const tagOf = (animalId: string) => {
    const a = animals.find((x) => x.id === animalId);
    return a ? `${a.tag} · ${ln(a)}` : animalId;
  };

  const activeCases = React.useMemo(
    () => events.filter((e) => e.outcome === "ongoing").sort((a, b) => b.date.localeCompare(a.date)),
    [events],
  );
  const dueVaccinations = React.useMemo(
    () =>
      m.dueVaccinationList
        .slice()
        .sort((a, b) => (a.nextDueDate ?? "").localeCompare(b.nextDueDate ?? "")),
    [m.dueVaccinationList],
  );
  const withdrawal = React.useMemo(
    () => events.filter((e) => e.withdrawalUntil && diffDays(e.withdrawalUntil, TODAY) >= 0),
    [events],
  );

  const caseColumns: Column<HealthEvent>[] = [
    {
      key: "animal",
      header: t("nav.animals"),
      cell: (e) => <span className="text-[13px] font-medium">{tagOf(e.animalId)}</span>,
    },
    {
      key: "condition",
      header: t("health.diseases"),
      cell: (e) => (
        <span className="text-[12.5px]">
          {e.disease ? t(`diseases.${e.disease}`) : e.vaccine ?? e.type}
        </span>
      ),
    },
    {
      key: "date",
      header: t("common.date"),
      cell: (e) => <span className="tabular text-[12.5px]">{formatDate(e.date, locale)}</span>,
    },
    {
      key: "vitals",
      header: t("health.vitals"),
      secondary: true,
      cell: (e) =>
        e.vitals?.temperatureC ? (
          <span className="tabular text-[12px] text-muted-foreground">
            {formatNumber(e.vitals.temperatureC)}°C · {e.vitals.heartRate} bpm
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "med",
      header: t("health.treatments"),
      secondary: true,
      cell: (e) => <span className="text-[12px] text-muted-foreground">{e.medication ?? "—"}</span>,
    },
    {
      key: "withdrawal",
      header: t("health.withdrawal"),
      cell: (e) =>
        e.withdrawalUntil && diffDays(e.withdrawalUntil, TODAY) >= 0 ? (
          <Badge variant="destructive">{relativeDays(e.withdrawalUntil, TODAY, locale)}</Badge>
        ) : (
          <Badge variant="outline">—</Badge>
        ),
    },
    {
      key: "cost",
      header: t("common.cost"),
      align: "end",
      cell: (e) => <span className="tabular text-[12.5px]">{formatCurrency(e.cost)}</span>,
    },
  ];

  const vaccColumns: Column<HealthEvent>[] = [
    { key: "animal", header: t("nav.animals"), cell: (e) => <span className="text-[13px] font-medium">{tagOf(e.animalId)}</span> },
    { key: "vaccine", header: t("health.vaccinations"), cell: (e) => <span className="text-[12.5px]">{e.vaccine}</span> },
    {
      key: "due",
      header: t("tasks.due"),
      cell: (e) => (
        <Badge variant={diffDays(e.nextDueDate!, TODAY) <= 7 ? "destructive" : "warning"}>
          {relativeDays(e.nextDueDate!, TODAY, locale)}
        </Badge>
      ),
    },
    { key: "last", header: t("reports.lastRun"), secondary: true, cell: (e) => <span className="tabular text-[12.5px]">{formatDate(e.date, locale)}</span> },
    { key: "vet", header: t("health.vet"), secondary: true, cell: (e) => <span className="text-[12px] text-muted-foreground">{e.vetName ?? "—"}</span> },
  ];

  const diseaseBars = m.topDiseases.slice(0, 8).map((d) => ({
    name: t(`diseases.${d.disease}` as never),
    count: d.count,
  }));

  return (
    <>
      <PageHeader
        title={t("health.title")}
        subtitle={t("health.subtitle")}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  "health-register.csv",
                  events.map((e) => ({
                    date: e.date,
                    animal: e.animalId,
                    type: e.type,
                    disease: e.disease ?? "",
                    vaccine: e.vaccine ?? "",
                    medication: e.medication ?? "",
                    cost: e.cost,
                    outcome: e.outcome ?? "",
                    withdrawal_until: e.withdrawalUntil ?? "",
                  })),
                )
              }
            >
              {t("common.exportCsv")}
            </Button>
            <LogHealthDialog
              trigger={
                <Button size="sm">
                  <Plus /> {t("health.logEvent")}
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
          label={t("health.activeCases")}
          value={formatNumber(m.activeCases)}
          icon={Stethoscope}
          tone={m.activeCases > 20 ? "destructive" : "warning"}
        />
        <StatCard label={t("health.isolation")} value={formatNumber(m.isolated)} icon={ShieldAlert} tone="warning" />
        <StatCard
          label={t("health.withdrawalActive")}
          value={formatNumber(m.withdrawalActive)}
          icon={AlertTriangle}
          tone={m.withdrawalActive ? "destructive" : "success"}
        />
        <StatCard label={t("health.dueVaccinations")} value={formatNumber(m.dueVaccinations)} icon={Syringe} tone="info" />
        <StatCard
          label={t("health.incidenceRate")}
          value={formatNumber(m.incidenceRate90)}
          unit="%"
          icon={HeartPulse}
          hint={t("common.last90")}
        />
        <StatCard
          label={t("health.treatmentCost")}
          value={formatCurrency(m.treatmentCost90)}
          icon={Thermometer}
          hint={t("common.last90")}
        />
      </motion.div>

      <motion.div variants={gridStagger} initial="hidden" animate="show" className="mt-4 grid gap-3 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title={t("dashboard.diseaseTrends")} description={t("common.last12m")}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => formatMonth(v, locale)} minTickGap={10} />
              <YAxis {...axisProps} width={36} />
              <RTooltip content={<ChartTooltip labelFormatter={(l) => formatMonth(l, locale)} />} />
              <Area type="monotone" stackId="1" dataKey="mastitis" name={t("diseases.mastitis")} stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.45} />
              <Area type="monotone" stackId="1" dataKey="lameness" name={t("diseases.lameness")} stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.45} />
              <Area type="monotone" stackId="1" dataKey="metabolic" name={t("diseases.ketosis")} stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.45} />
              <Area type="monotone" stackId="1" dataKey="respiratory" name={t("diseases.pneumonia")} stroke="var(--chart-4)" fill="var(--chart-4)" fillOpacity={0.45} />
              <Area type="monotone" stackId="1" dataKey="other" name={t("common.more")} stroke="var(--chart-6)" fill="var(--chart-6)" fillOpacity={0.35} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("health.topDiseases")} description={t("health.incidenceRate")}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={diseaseBars} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 0 }}>
              <CartesianGrid {...gridProps} horizontal={false} />
              <XAxis type="number" {...axisProps} />
              <YAxis type="category" dataKey="name" {...axisProps} width={96} />
              <RTooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name={t("common.total")} radius={[0, 4, 4, 0]}>
                {diseaseBars.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? "var(--chart-5)" : "var(--chart-1)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      <motion.div variants={cardIn} initial="hidden" animate="show" className="mt-4">
        <Card>
          <div className="px-5 pb-2 pt-4">
            <CardTitle>{t("health.title")}</CardTitle>
            <CardDescription>
              {formatNumber(events.length)} {t("common.results")}
            </CardDescription>
          </div>
          <CardContent className="px-0 pb-0">
            <Tabs defaultValue="active">
              <div className="px-5">
                <TabsList className="mb-2 flex w-full overflow-x-auto sm:w-auto">
                  <TabsTrigger value="active">{t("health.activeCases")}</TabsTrigger>
                  <TabsTrigger value="vaccinations">{t("health.dueVaccinations")}</TabsTrigger>
                  <TabsTrigger value="withdrawal">{t("health.withdrawal")}</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="active">
                <DataTable
                  columns={caseColumns}
                  rows={activeCases.slice(0, 50)}
                  loading={isLoading}
                  onRowClick={(e) => router.push(`/animals/${e.animalId}`)}
                  mobileCard={(e) => (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13.5px] font-medium">{tagOf(e.animalId)}</p>
                        <Badge variant="warning">{e.outcome}</Badge>
                      </div>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {e.disease ? t(`diseases.${e.disease}`) : e.type} · {formatDate(e.date, locale)}
                      </p>
                    </div>
                  )}
                />
              </TabsContent>

              <TabsContent value="vaccinations">
                <DataTable
                  columns={vaccColumns}
                  rows={dueVaccinations.slice(0, 50)}
                  onRowClick={(e) => router.push(`/animals/${e.animalId}`)}
                  mobileCard={(e) => (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium">{tagOf(e.animalId)}</p>
                        <p className="truncate text-[12px] text-muted-foreground">{e.vaccine}</p>
                      </div>
                      <Badge variant={diffDays(e.nextDueDate!, TODAY) <= 7 ? "destructive" : "warning"}>
                        {relativeDays(e.nextDueDate!, TODAY, locale)}
                      </Badge>
                    </div>
                  )}
                />
              </TabsContent>

              <TabsContent value="withdrawal">
                <DataTable
                  columns={caseColumns}
                  rows={withdrawal.slice(0, 50)}
                  onRowClick={(e) => router.push(`/animals/${e.animalId}`)}
                  emptyLabel={t("notifications.empty")}
                  mobileCard={(e) => (
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[13.5px] font-medium">{tagOf(e.animalId)}</p>
                      <Badge variant="destructive">
                        {relativeDays(e.withdrawalUntil!, TODAY, locale)}
                      </Badge>
                    </div>
                  )}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}
