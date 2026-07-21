"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Beef,
  Building2,
  Droplets,
  Fan,
  Milk,
  ShieldAlert,
  Stethoscope,
  Sun,
  Warehouse,
} from "lucide-react";

import { PageHeader, cardIn } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { MilkStatusPill } from "@/components/common/status-pill";
import { useI18n } from "@/lib/i18n/provider";
import { useAnimals, useZones } from "@/hooks/use-farm-data";
import { average, round } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Zone, ZoneKind } from "@/core/domain/types";

const KIND_STYLE: Record<ZoneKind, { fill: string; stroke: string; icon: typeof Beef }> = {
  pen: { fill: "var(--chart-1)", stroke: "var(--chart-1)", icon: Beef },
  barn: { fill: "var(--chart-2)", stroke: "var(--chart-2)", icon: Warehouse },
  milking_parlor: { fill: "var(--chart-4)", stroke: "var(--chart-4)", icon: Milk },
  feed_store: { fill: "var(--chart-3)", stroke: "var(--chart-3)", icon: Warehouse },
  clinic: { fill: "var(--chart-5)", stroke: "var(--chart-5)", icon: Stethoscope },
  office: { fill: "var(--chart-6)", stroke: "var(--chart-6)", icon: Building2 },
  quarantine: { fill: "var(--destructive)", stroke: "var(--destructive)", icon: ShieldAlert },
  water: { fill: "var(--chart-6)", stroke: "var(--chart-6)", icon: Droplets },
};

export default function FarmMapPage() {
  const { t, ln, formatNumber } = useI18n();
  const { data: zones = [] } = useZones();
  const { data: page } = useAnimals({ pageSize: 100000 });
  const animals = page?.items ?? [];

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = zones.find((z) => z.id === selectedId) ?? null;

  const occupancyOf = (zone: Zone) => animals.filter((a) => a.penId === zone.id);

  const inZone = selected ? occupancyOf(selected) : [];
  const avgYield = round(
    average(inZone.filter((a) => a.avgDailyMilkL > 0).map((a) => a.avgDailyMilkL)),
    1,
  );

  return (
    <>
      <PageHeader title={t("map.title")} subtitle={t("map.subtitle")} />

      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <motion.div variants={cardIn} initial="hidden" animate="show">
          <Card className="overflow-hidden">
            <CardContent className="p-3">
              <div className="relative w-full overflow-hidden rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]">
                <svg viewBox="0 0 100 100" className="h-auto w-full" role="img" aria-label={t("map.title")}>
                  {/* Ground texture — subtle, keeps the plan from looking like a wireframe. */}
                  <defs>
                    <pattern id="grid" width="4" height="4" patternUnits="userSpaceOnUse">
                      <path d="M4 0 L0 0 0 4" fill="none" stroke="var(--border)" strokeWidth="0.15" />
                    </pattern>
                  </defs>
                  <rect width="100" height="100" fill="url(#grid)" />

                  {zones.map((z) => {
                    const style = KIND_STYLE[z.kind];
                    const occupants = occupancyOf(z).length;
                    const load = z.capacity ? Math.min(1, occupants / z.capacity) : 0;
                    const active = selectedId === z.id;
                    return (
                      <g key={z.id} onClick={() => setSelectedId(z.id)} className="cursor-pointer">
                        <motion.rect
                          x={z.x}
                          y={z.y}
                          width={z.w}
                          height={z.h}
                          rx={1.4}
                          fill={style.fill}
                          fillOpacity={z.capacity ? 0.1 + load * 0.32 : 0.12}
                          stroke={style.stroke}
                          strokeWidth={active ? 0.7 : 0.28}
                          strokeOpacity={active ? 1 : 0.55}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3 }}
                          className="transition-[fill-opacity] hover:fill-opacity-50"
                        />
                        <text
                          x={z.x + z.w / 2}
                          y={z.y + z.h / 2 - 1}
                          textAnchor="middle"
                          className="pointer-events-none select-none"
                          style={{ fontSize: 2.1, fill: "var(--foreground)", fontWeight: 600 }}
                        >
                          {z.name.split(" — ")[0]}
                        </text>
                        {z.capacity > 0 && (
                          <text
                            x={z.x + z.w / 2}
                            y={z.y + z.h / 2 + 2.6}
                            textAnchor="middle"
                            className="pointer-events-none select-none"
                            style={{ fontSize: 1.9, fill: "var(--muted-foreground)" }}
                          >
                            {occupants}/{z.capacity}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-1">
                {(Object.keys(KIND_STYLE) as ZoneKind[]).map((kind) => (
                  <span key={kind} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span
                      className="size-2 rounded-[3px]"
                      style={{ background: KIND_STYLE[kind].fill, opacity: 0.7 }}
                    />
                    {t(`zoneKind.${kind}` as never)}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={selected?.id ?? "empty"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="h-full">
              {selected ? (
                <>
                  <div className="px-5 pb-2 pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="truncate">{ln(selected)}</CardTitle>
                        <CardDescription>{t(`zoneKind.${selected.kind}` as never)}</CardDescription>
                      </div>
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background: `color-mix(in oklab, ${KIND_STYLE[selected.kind].fill} 16%, transparent)`,
                          color: KIND_STYLE[selected.kind].fill,
                        }}
                      >
                        {React.createElement(KIND_STYLE[selected.kind].icon, { className: "size-4" })}
                      </span>
                    </div>
                  </div>
                  <CardContent>
                    {selected.capacity > 0 && (
                      <div className="mb-4">
                        <div className="mb-1.5 flex items-center justify-between text-[12px]">
                          <span className="text-muted-foreground">{t("map.occupancy")}</span>
                          <span className="tabular font-medium">
                            {formatNumber(inZone.length)} / {formatNumber(selected.capacity)}
                          </span>
                        </div>
                        <Progress
                          value={(inZone.length / Math.max(1, selected.capacity)) * 100}
                          indicatorClassName={
                            inZone.length > selected.capacity ? "bg-destructive" : undefined
                          }
                        />
                      </div>
                    )}

                    <div className="mb-4 grid grid-cols-2 gap-3">
                      {selected.shadeCoverPct !== undefined && (
                        <Stat
                          icon={Sun}
                          label={t("map.shade")}
                          value={`${formatNumber(selected.shadeCoverPct)}%`}
                        />
                      )}
                      {selected.hasFans !== undefined && (
                        <Stat
                          icon={Fan}
                          label={t("map.fans")}
                          value={selected.hasFans ? t("common.yes") : t("common.no")}
                        />
                      )}
                      {avgYield > 0 && (
                        <Stat
                          icon={Milk}
                          label={t("map.avgYield")}
                          value={`${formatNumber(avgYield)} ${t("common.liters")}`}
                        />
                      )}
                      <Stat
                        icon={Beef}
                        label={t("map.animalsInside")}
                        value={formatNumber(inZone.length)}
                      />
                    </div>

                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("map.animalsInside")}
                    </p>
                    <div className="max-h-[380px] space-y-1 overflow-y-auto pe-1">
                      {inZone.slice(0, 60).map((a) => (
                        <Link
                          key={a.id}
                          href={`/animals/${a.id}`}
                          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-accent/50"
                        >
                          <span className="tabular text-[12px] font-medium">{a.tag}</span>
                          <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                            {ln(a)}
                          </span>
                          <MilkStatusPill value={a.milkStatus} />
                        </Link>
                      ))}
                      {!inZone.length && (
                        <p className="py-8 text-center text-[12px] text-muted-foreground">
                          {t("common.none")}
                        </p>
                      )}
                    </div>

                    {inZone.length > 60 && (
                      <Button variant="ghost" size="sm" className="mt-2 w-full" asChild>
                        <Link href={`/animals?pen=${selected.id}`}>
                          {t("common.viewAll")} ({formatNumber(inZone.length)})
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </>
              ) : (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 p-8 text-center">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <Beef className="size-5" />
                  </span>
                  <p className="text-[14px] font-medium">{t("map.selectZone")}</p>
                  <p className="max-w-[220px] text-[12px] text-muted-foreground">
                    {t("map.selectZoneHint")}
                  </p>
                </div>
              )}
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {zones
          .filter((z) => z.kind === "pen")
          .slice(0, 8)
          .map((z) => {
            const occupants = occupancyOf(z);
            const load = (occupants.length / Math.max(1, z.capacity)) * 100;
            return (
              <button
                key={z.id}
                onClick={() => setSelectedId(z.id)}
                className={cn(
                  "rounded-xl border border-border bg-card p-3 text-start transition hover:border-ring/40",
                  selectedId === z.id && "border-primary/50 ring-2 ring-primary/15",
                )}
              >
                <p className="truncate text-[12.5px] font-medium">{ln(z)}</p>
                <p className="tabular mt-1 text-[11px] text-muted-foreground">
                  {formatNumber(occupants.length)} / {formatNumber(z.capacity)}
                </p>
                <Progress
                  value={load}
                  className="mt-2 h-1.5"
                  indicatorClassName={load > 100 ? "bg-destructive" : load > 85 ? "bg-[var(--warning)]" : undefined}
                />
              </button>
            );
          })}
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Beef;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="tabular mt-1 text-[14px] font-semibold">{value}</p>
    </div>
  );
}
