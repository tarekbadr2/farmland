"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Baby, HeartPulse, Milk, Scale, TrendingUp } from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ChartCard, ChartTooltip, axisProps, gridProps } from "@/components/common/chart";
import { DataTable, type Column } from "@/components/common/data-table";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HealthScore } from "@/components/common/status-pill";
import { useI18n } from "@/lib/i18n/provider";
import { useAnimals, useZones } from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import { ageFromDOB, diffDays } from "@/lib/date";
import { average, round } from "@/lib/utils";
import type { Animal } from "@/core/domain/types";

/** Target growth for Egyptian buffalo calves: ~38 kg at birth, ~0.62 kg/day ADG. */
const BIRTH_WEIGHT = 38;
const TARGET_ADG = 0.62;
const WEANING_DAY = 120;

function expectedWeight(ageDays: number) {
  return round(BIRTH_WEIGHT + ageDays * TARGET_ADG, 1);
}

export default function CalvesPage() {
  const router = useRouter();
  const { t, ln, locale, formatNumber } = useI18n();
  const perDay = locale === "ar" ? "كجم/يوم" : "kg/day";
  const { data: page, isLoading } = useAnimals({ group: "calves", pageSize: 100000 });
  const { data: zones = [] } = useZones();
  const calves = React.useMemo(() => page?.items ?? [], [page]);

  const enriched = React.useMemo(
    () =>
      calves.map((c) => {
        const ageDays = diffDays(TODAY, c.dateOfBirth);
        const target = expectedWeight(ageDays);
        const adg = ageDays > 0 ? round((c.weightKg - BIRTH_WEIGHT) / ageDays, 2) : 0;
        const deviation = round(((c.weightKg - target) / Math.max(1, target)) * 100, 1);
        return {
          ...c,
          ageDays,
          target,
          adg,
          deviation,
          weaned: ageDays >= WEANING_DAY,
          band: deviation < -8 ? "behind" : deviation > 8 ? "ahead" : "onTrack",
        };
      }),
    [calves],
  );

  const behind = enriched.filter((c) => c.band === "behind");
  const avgAdg = round(average(enriched.map((c) => c.adg)), 2);
  const weaned = enriched.filter((c) => c.weaned).length;

  const growthCurve = React.useMemo(() => {
    const points: { day: number; target: number; actual: number }[] = [];
    for (let day = 0; day <= 330; day += 15) {
      const cohort = enriched.filter((c) => Math.abs(c.ageDays - day) <= 12);
      points.push({
        day,
        target: expectedWeight(day),
        actual: cohort.length ? round(average(cohort.map((c) => c.weightKg)), 1) : NaN,
      });
    }
    return points;
  }, [enriched]);

  const scatter = enriched.map((c) => ({
    x: c.ageDays,
    y: c.weightKg,
    z: c.healthScore,
    tag: c.tag,
    band: c.band,
  }));

  const columns: Column<Animal & { ageDays: number; target: number; adg: number; deviation: number; band: string; weaned: boolean }>[] = [
    {
      key: "tag",
      header: t("animals.tag"),
      cell: (c) => (
        <div>
          <p className="tabular text-[13px] font-medium">{c.tag}</p>
          <p className="text-[11px] text-muted-foreground">{ln(c)}</p>
        </div>
      ),
    },
    {
      key: "age",
      header: t("animals.age"),
      cell: (c) => {
        const { months } = ageFromDOB(c.dateOfBirth, TODAY);
        return (
          <span className="tabular text-[12.5px]">
            {formatNumber(c.ageDays)} {t("common.days")}
            <span className="text-muted-foreground"> · {formatNumber(months)}m</span>
          </span>
        );
      },
    },
    {
      key: "weight",
      header: t("calves.currentWeight"),
      align: "end",
      cell: (c) => (
        <span className="tabular text-[12.5px] font-medium">
          {formatNumber(c.weightKg)} {t("common.kg")}
        </span>
      ),
    },
    {
      key: "target",
      header: t("calves.expectedWeight"),
      align: "end",
      secondary: true,
      cell: (c) => (
        <span className="tabular text-[12.5px] text-muted-foreground">
          {formatNumber(c.target)} {t("common.kg")}
        </span>
      ),
    },
    {
      key: "adg",
      header: t("calves.adg"),
      align: "end",
      cell: (c) => (
        <span className="tabular text-[12.5px]">
          {formatNumber(c.adg, { maximumFractionDigits: 2 })} {t("common.kg")}
        </span>
      ),
    },
    {
      key: "band",
      header: t("calves.growthChart"),
      cell: (c) => (
        <Badge
          variant={c.band === "behind" ? "destructive" : c.band === "ahead" ? "success" : "secondary"}
        >
          {t(`calves.${c.band}` as never)} {c.deviation > 0 ? "+" : ""}
          {formatNumber(c.deviation)}%
        </Badge>
      ),
    },
    {
      key: "weaning",
      header: t("calves.weaning"),
      secondary: true,
      cell: (c) =>
        c.weaned ? (
          <Badge variant="success">{t("calves.weaned")}</Badge>
        ) : (
          <Badge variant="outline">
            {t("calves.preWeaning")} · {formatNumber(WEANING_DAY - c.ageDays)} {t("common.days")}
          </Badge>
        ),
    },
    {
      key: "pen",
      header: t("animals.pen"),
      secondary: true,
      cell: (c) => {
        const z = zones.find((zz) => zz.id === c.penId);
        return <span className="text-[12px] text-muted-foreground">{z ? ln(z) : "—"}</span>;
      },
    },
    { key: "health", header: t("animals.healthScore"), cell: (c) => <HealthScore value={c.healthScore} /> },
  ];

  return (
    <>
      <PageHeader title={t("calves.title")} subtitle={t("calves.subtitle")} />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        <StatCard label={t("kpi.calves")} value={formatNumber(enriched.length)} icon={Baby} tone="info" />
        <StatCard
          label={t("calves.adg")}
          value={formatNumber(avgAdg, { maximumFractionDigits: 2 })}
          unit={perDay}
          icon={TrendingUp}
          tone={avgAdg >= TARGET_ADG ? "success" : "warning"}
        />
        <StatCard
          label={t("calves.behind")}
          value={formatNumber(behind.length)}
          icon={Scale}
          tone={behind.length > enriched.length * 0.2 ? "destructive" : "warning"}
        />
        <StatCard label={t("calves.weaned")} value={formatNumber(weaned)} icon={Milk} />
        <StatCard
          label={t("calves.survivalRate")}
          value={formatNumber(round(100 - (calves.filter((c) => c.status === "dead").length / Math.max(1, calves.length)) * 100, 1))}
          unit="%"
          icon={HeartPulse}
          tone="success"
        />
        <StatCard
          label={t("calves.birthWeight")}
          value={formatNumber(BIRTH_WEIGHT)}
          unit={t("common.kg")}
          icon={Scale}
          hint={t("common.average")}
        />
      </motion.div>

      <motion.div variants={gridStagger} initial="hidden" animate="show" className="mt-4 grid gap-3 xl:grid-cols-2">
        <ChartCard title={t("calves.growthChart")} description={t("calves.expectedWeight")}>
          <ResponsiveContainer width="100%" height={270}>
            <LineChart data={growthCurve} margin={{ top: 6, right: 10, left: -14, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="day" {...axisProps} tickFormatter={(v: number) => `${v}d`} />
              <YAxis {...axisProps} width={44} />
              <RTooltip
                content={
                  <ChartTooltip
                    labelFormatter={(l) => `${l} ${t("common.days")}`}
                    formatter={(v) => `${formatNumber(v)} ${t("common.kg")}`}
                  />
                }
              />
              <Line type="monotone" dataKey="target" name={t("calves.expectedWeight")} stroke="var(--chart-3)" strokeWidth={1.8} strokeDasharray="5 4" dot={false} />
              <Line type="monotone" dataKey="actual" name={t("calves.currentWeight")} stroke="var(--chart-1)" strokeWidth={2.2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("calves.title")} description={`${t("animals.age")} × ${t("animals.weight")}`}>
          <ResponsiveContainer width="100%" height={270}>
            <ScatterChart margin={{ top: 6, right: 12, left: -14, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis type="number" dataKey="x" name={t("animals.age")} {...axisProps} tickFormatter={(v: number) => `${v}d`} />
              <YAxis type="number" dataKey="y" name={t("animals.weight")} {...axisProps} width={44} />
              <ZAxis type="number" dataKey="z" range={[20, 110]} />
              <RTooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={<ChartTooltip formatter={(v) => formatNumber(v)} />}
              />
              <Scatter data={scatter.filter((s) => s.band === "onTrack")} name={t("calves.onTrack")} fill="var(--chart-1)" fillOpacity={0.7} />
              <Scatter data={scatter.filter((s) => s.band === "ahead")} name={t("calves.ahead")} fill="var(--chart-2)" fillOpacity={0.7} />
              <Scatter data={scatter.filter((s) => s.band === "behind")} name={t("calves.behind")} fill="var(--chart-5)" fillOpacity={0.8} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      <motion.div variants={cardIn} initial="hidden" animate="show" className="mt-4">
        <Card>
          <div className="px-5 pb-2 pt-4">
            <CardTitle>{t("calves.title")}</CardTitle>
            <CardDescription>
              {formatNumber(enriched.length)} {t("common.head")} ·{" "}
              {formatNumber(behind.length)} {t("calves.behind").toLowerCase()}
            </CardDescription>
          </div>
          <CardContent className="px-0 pb-0">
            <DataTable
              columns={columns}
              rows={enriched}
              loading={isLoading}
              onRowClick={(c) => router.push(`/animal?id=${c.id}`)}
              mobileCard={(c) => (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="tabular text-[13.5px] font-medium">{c.tag}</p>
                    <Badge variant={c.band === "behind" ? "destructive" : c.band === "ahead" ? "success" : "secondary"}>
                      {formatNumber(c.deviation)}%
                    </Badge>
                  </div>
                  <p className="tabular mt-1 text-[12px] text-muted-foreground">
                    {formatNumber(c.ageDays)} {t("common.days")} · {formatNumber(c.weightKg)}{" "}
                    {t("common.kg")} · ADG {formatNumber(c.adg, { maximumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            />
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}
