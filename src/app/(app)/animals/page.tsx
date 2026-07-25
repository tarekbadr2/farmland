"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRightLeft, Download, Filter, Plus, QrCode, Search, X } from "lucide-react";

import { PageHeader, gridStagger } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, type Column } from "@/components/common/data-table";
import { AnimalFormDialog } from "@/components/animals/animal-form-dialog";
import { ImportAnimalsDialog } from "@/components/animals/import-dialog";
import {
  AnimalStatusPill,
  HealthScore,
  MilkStatusPill,
  ReproStatusPill,
} from "@/components/common/status-pill";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import { useAnimals, useZones } from "@/hooks/use-farm-data";
import { ageFromDOB } from "@/lib/date";
import { TODAY } from "@/core/data/seed";
import { herdComposition } from "@/core/services/metrics";
import type { Animal } from "@/core/domain/types";
import { downloadTableXlsx } from "@/lib/export";
import { ScanTagDialog } from "@/components/animals/scan-tag-dialog";
import { TransferAnimalsDialog } from "@/components/animals/transfer-animals-dialog";
import { Beef, Droplets, Baby, Activity } from "lucide-react";

const PAGE_SIZE = 25;

export default function AnimalsPage() {
  const router = useRouter();
  const { t, ln, locale, formatNumber } = useI18n();
  const { data: zones } = useZones();

  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [group, setGroup] = React.useState<"all" | "adults" | "calves" | "bulls">("all");
  const [milkStatus, setMilkStatus] = React.useState<string>("all");
  const [reproStatus, setReproStatus] = React.useState<string>("all");
  const [penId, setPenId] = React.useState<string>("all");
  const [sortBy, setSortBy] = React.useState("tag");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [page, setPage] = React.useState(1);
  const [showFilters, setShowFilters] = React.useState(false);

  React.useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 220);
    return () => clearTimeout(id);
  }, [search]);

  const query = {
    search: debounced,
    group,
    milkStatus: milkStatus as never,
    reproStatus: reproStatus as never,
    penId,
    sortBy: sortBy as never,
    sortDir,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading } = useAnimals(query);
  const { data: allAnimals } = useAnimals({ pageSize: 100000 });
  const herd = React.useMemo(
    () => herdComposition(allAnimals?.items ?? []),
    [allAnimals?.items],
  );

  const activeFilters = [
    group !== "all" && group,
    milkStatus !== "all" && milkStatus,
    reproStatus !== "all" && reproStatus,
    penId !== "all" && penId,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setGroup("all");
    setMilkStatus("all");
    setReproStatus("all");
    setPenId("all");
    setPage(1);
  };

  const onSort = (key: string) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const zoneName = (id: string) => {
    const z = zones?.find((zz) => zz.id === id);
    return z ? ln(z) : "—";
  };

  const columns: Column<Animal>[] = [
    {
      key: "tag",
      header: t("animals.tag"),
      sortable: true,
      cell: (a) => (
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">
            {a.tag.slice(-3)}
          </span>
          <div className="min-w-0">
            <p className="tabular truncate text-[13px] font-medium">{a.tag}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {t(`breeds.${a.breed}`)} · {t(`status.${a.sex}`)}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "breed",
      header: t("animals.breed"),
      secondary: true,
      cell: (a) => (
        <span className="text-[12.5px] text-muted-foreground">{t(`breeds.${a.breed}`)}</span>
      ),
    },
    {
      key: "age",
      header: t("animals.age"),
      sortable: true,
      cell: (a) => {
        const { years, months } = ageFromDOB(a.dateOfBirth, TODAY);
        return (
          <span className="tabular text-[12.5px]">
            {years > 0 ? `${formatNumber(years)}y ` : ""}
            {formatNumber(months)}m
          </span>
        );
      },
    },
    {
      key: "milkStatus",
      header: t("animals.milkStatus"),
      cell: (a) => <MilkStatusPill value={a.milkStatus} />,
    },
    {
      key: "reproStatus",
      header: t("animals.reproStatus"),
      secondary: true,
      cell: (a) => <ReproStatusPill value={a.reproStatus} />,
    },
    {
      key: "milk",
      header: t("animals.dailyMilk"),
      sortable: true,
      align: "end",
      cell: (a) =>
        a.avgDailyMilkL > 0 ? (
          <span className="tabular text-[12.5px] font-medium">
            {formatNumber(a.avgDailyMilkL)} {t("common.liters")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "weight",
      header: t("animals.weight"),
      sortable: true,
      align: "end",
      secondary: true,
      cell: (a) => (
        <span className="tabular text-[12.5px]">
          {formatNumber(a.weightKg)} {t("common.kg")}
        </span>
      ),
    },
    {
      key: "pen",
      header: t("animals.pen"),
      secondary: true,
      cell: (a) => (
        <span className="truncate text-[12.5px] text-muted-foreground">{zoneName(a.penId)}</span>
      ),
    },
    {
      key: "health",
      header: t("animals.healthScore"),
      sortable: true,
      cell: (a) => <HealthScore value={a.healthScore} />,
    },
    {
      key: "status",
      header: t("common.status"),
      cell: (a) => <AnimalStatusPill value={a.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        title={t("animals.title")}
        subtitle={t("animals.subtitle")}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadTableXlsx(
                  "herd-inventory",
                  t("animals.title"),
                  (allAnimals?.items ?? []).map((a) => ({
                    tag: a.tag,
                    name: a.name,
                    breed: a.breed,
                    sex: a.sex,
                    dob: a.dateOfBirth,
                    milk_status: a.milkStatus,
                    repro_status: a.reproStatus,
                    weight_kg: a.weightKg,
                    daily_milk_l: a.avgDailyMilkL,
                    health: a.healthScore,
                    pen: a.penId,
                  })),
                  { subtitle: t("animals.subtitle"), rtl: locale === "ar" },
                )
              }
            >
              <Download /> {t("common.export")}
            </Button>
            <ScanTagDialog
              trigger={
                <Button variant="outline" size="sm">
                  <QrCode /> {t("animals.scanTag")}
                </Button>
              }
            />
            <TransferAnimalsDialog
              trigger={
                <Button variant="outline" size="sm">
                  <ArrowRightLeft /> {locale === "ar" ? "تحويل رؤوس" : "Transfer"}
                </Button>
              }
            />
            <ImportAnimalsDialog />
            <AnimalFormDialog
              trigger={
                <Button size="sm">
                  <Plus /> {t("animals.newAnimal")}
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
        className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <StatCard label={t("kpi.totalBuffalo")} value={formatNumber(herd.total)} icon={Beef} tone="info" />
        <StatCard
          label={t("kpi.lactating")}
          value={formatNumber(herd.lactating)}
          icon={Droplets}
          tone="success"
        />
        <StatCard label={t("kpi.pregnant")} value={formatNumber(herd.pregnant)} icon={Activity} />
        <StatCard label={t("kpi.calves")} value={formatNumber(herd.calves)} icon={Baby} />
      </motion.div>

      <Card>
        <div className="flex flex-col gap-2.5 border-b border-border/70 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("animals.tag")}
              className="ps-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={showFilters ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowFilters((s) => !s)}
            >
              <Filter /> {t("common.filter")}
              {activeFilters > 0 && (
                <Badge variant="default" className="ms-1">
                  {activeFilters}
                </Badge>
              )}
            </Button>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                {t("common.clear")}
              </Button>
            )}
          </div>
        </div>

        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden border-b border-border/70"
          >
            <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <Select value={group} onValueChange={(v) => { setGroup(v as never); setPage(1); }}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  <SelectItem value="adults">{t("kpi.lactating")} / {t("kpi.dry")}</SelectItem>
                  <SelectItem value="calves">{t("kpi.calves")}</SelectItem>
                  <SelectItem value="bulls">{t("kpi.bulls")}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={milkStatus} onValueChange={(v) => { setMilkStatus(v); setPage(1); }}>
                <SelectTrigger size="sm">
                  <SelectValue placeholder={t("animals.milkStatus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("animals.milkStatus")} — {t("common.all")}</SelectItem>
                  <SelectItem value="lactating">{t("status.lactating")}</SelectItem>
                  <SelectItem value="dry">{t("status.dry")}</SelectItem>
                  <SelectItem value="heifer">{t("status.heifer")}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={reproStatus} onValueChange={(v) => { setReproStatus(v); setPage(1); }}>
                <SelectTrigger size="sm">
                  <SelectValue placeholder={t("animals.reproStatus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("animals.reproStatus")} — {t("common.all")}</SelectItem>
                  <SelectItem value="pregnant">{t("status.pregnant")}</SelectItem>
                  <SelectItem value="inseminated">{t("status.inseminated")}</SelectItem>
                  <SelectItem value="open">{t("status.open")}</SelectItem>
                  <SelectItem value="fresh">{t("status.fresh")}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={penId} onValueChange={(v) => { setPenId(v); setPage(1); }}>
                <SelectTrigger size="sm">
                  <SelectValue placeholder={t("animals.pen")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("animals.pen")} — {t("common.all")}</SelectItem>
                  {zones
                    ?.filter((z) => z.kind === "pen" || z.kind === "barn")
                    .map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {ln(z)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        )}

        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          loading={isLoading}
          onRowClick={(a) => router.push(`/animal?id=${a.id}`)}
          sortKey={sortBy}
          sortDir={sortDir}
          onSort={onSort}
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.total}
          onPageChange={setPage}
          mobileCard={(a) => (
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[12px] font-semibold text-primary">
                {a.tag.slice(-3)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="tabular truncate text-[14px] font-medium">{a.tag}</p>
                  <MilkStatusPill value={a.milkStatus} />
                </div>
                <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                  {t(`breeds.${a.breed}`)} · {zoneName(a.penId)}
                </p>
              </div>
              <div className="shrink-0 text-end">
                {a.avgDailyMilkL > 0 && (
                  <p className="tabular text-[13px] font-semibold">
                    {formatNumber(a.avgDailyMilkL)}
                    <span className="text-[10px] text-muted-foreground"> {t("common.liters")}</span>
                  </p>
                )}
                <div className="mt-1 flex justify-end">
                  <HealthScore value={a.healthScore} />
                </div>
              </div>
            </div>
          )}
        />
      </Card>

      <p className="mt-3 text-center text-[11px] text-muted-foreground" dir={locale === "ar" ? "rtl" : "ltr"}>
        {formatNumber(data?.total ?? 0)} {t("common.results")}
      </p>
    </>
  );
}
