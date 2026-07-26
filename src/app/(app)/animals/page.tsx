"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRightLeft, ClipboardList, Download, Filter, Plus, QrCode, Search, X } from "lucide-react";

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
import { herdComposition, herdStructure, classifyAnimal, type HerdSub } from "@/core/services/metrics";
import type { Animal } from "@/core/domain/types";
import { Can } from "@/lib/auth/guard";
import { cn } from "@/lib/utils";
import { downloadTableXlsx } from "@/lib/export";
import { ScanTagDialog } from "@/components/animals/scan-tag-dialog";
import { TransferAnimalsDialog } from "@/components/animals/transfer-animals-dialog";
import { TransferRequestsDialog } from "@/components/animals/transfer-requests-dialog";
import { Beef, Droplets, Baby, Activity } from "lucide-react";

const PAGE_SIZE = 25;

export default function AnimalsPage() {
  const router = useRouter();
  const { t, ln, locale, formatNumber } = useI18n();
  const { data: zones } = useZones();

  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  // Sex + subcategory tab (null = whole herd). Auto-derived per animal.
  const [cat, setCat] = React.useState<{ sex: "female" | "male"; sub: HerdSub | "all" } | null>(
    null,
  );
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

  const { data: allAnimals, isLoading } = useAnimals({ pageSize: 100000 });
  const all = React.useMemo(() => allAnimals?.items ?? [], [allAnimals?.items]);
  // The list is the LIVE herd (active + quarantine). Sold/dead animals leave the
  // herd and drop off this view; their records stay in reports and the sales
  // ledger. Keeping one population means the chip counts, the stat cards and the
  // dashboard herd structure all agree.
  const live = React.useMemo(
    () => all.filter((a) => a.status === "active" || a.status === "quarantine"),
    [all],
  );
  const herd = React.useMemo(() => herdComposition(all), [all]);
  const structure = React.useMemo(() => herdStructure(all), [all]);

  // The whole page filters/sorts/paginates client-side over the live herd: a
  // single farm's herd is bounded, the list is already loaded for the stat
  // cards, and the subcategory buckets are derived (not plain Firestore fields),
  // so this keeps the chip counts and the table perfectly in sync.
  const filtered = React.useMemo(() => {
    const q = debounced.trim().toLowerCase();
    const items = live.filter((a) => {
      if (cat) {
        const c = classifyAnimal(a);
        if (c.sex !== cat.sex) return false;
        if (cat.sub !== "all" && c.sub !== cat.sub) return false;
      }
      if (milkStatus !== "all" && a.milkStatus !== milkStatus) return false;
      if (reproStatus !== "all" && a.reproStatus !== reproStatus) return false;
      if (penId !== "all" && a.penId !== penId) return false;
      if (q) {
        const hay = `${a.tag} ${a.name} ${a.nameAr} ${a.rfid} ${a.bloodline ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      switch (sortBy) {
        case "milk":
          return (a.avgDailyMilkL - b.avgDailyMilkL) * dir;
        case "age":
          return a.dateOfBirth.localeCompare(b.dateOfBirth) * dir;
        case "weight":
          return (a.weightKg - b.weightKg) * dir;
        case "health":
          return (a.healthScore - b.healthScore) * dir;
        case "name":
          return a.name.localeCompare(b.name) * dir;
        default:
          return a.tag.localeCompare(b.tag, undefined, { numeric: true }) * dir;
      }
    });
  }, [live, cat, milkStatus, reproStatus, penId, debounced, sortBy, sortDir]);

  const pageItems = React.useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const activeFilters = [
    milkStatus !== "all" && milkStatus,
    reproStatus !== "all" && reproStatus,
    penId !== "all" && penId,
  ].filter(Boolean).length;

  const resetFilters = () => {
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
            <TransferRequestsDialog
              trigger={
                <Button variant="outline" size="sm">
                  <ClipboardList /> {locale === "ar" ? "طلبات التحويل" : "Requests"}
                </Button>
              }
            />
            <Can permission="animals.write">
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
            </Can>
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

        {/* Sex + subcategory tabs — auto-derived buckets, counts stay in sync. */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 px-3 py-2.5">
          <CatChip active={!cat} onClick={() => { setCat(null); setPage(1); }}>
            {t("common.all")} <Count n={structure.total} active={!cat} />
          </CatChip>

          <span className="ms-1 text-[12px] font-semibold text-muted-foreground">♀</span>
          {([
            { sub: "all", label: t("herd.females"), n: structure.female.total },
            { sub: "lactating", label: t("herd.lactating"), n: structure.female.lactating },
            { sub: "pregnant", label: t("herd.pregnant"), n: structure.female.pregnant },
            { sub: "dry", label: t("herd.dry"), n: structure.female.dry },
            { sub: "heifer", label: t("herd.heifers"), n: structure.female.heifer },
            { sub: "calf", label: t("herd.calves"), n: structure.female.calf },
          ] as const).map((c) => {
            const on = cat?.sex === "female" && cat.sub === c.sub;
            return (
              <CatChip key={`f-${c.sub}`} active={on} onClick={() => { setCat({ sex: "female", sub: c.sub }); setPage(1); }}>
                {c.label} <Count n={c.n} active={on} />
              </CatChip>
            );
          })}

          <span className="ms-2 text-[12px] font-semibold text-muted-foreground">♂</span>
          {([
            { sub: "all", label: t("herd.males"), n: structure.male.total },
            { sub: "fattening", label: t("herd.fattening"), n: structure.male.fattening },
            { sub: "calf", label: t("herd.calves"), n: structure.male.calf },
          ] as const).map((c) => {
            const on = cat?.sex === "male" && cat.sub === c.sub;
            return (
              <CatChip key={`m-${c.sub}`} active={on} onClick={() => { setCat({ sex: "male", sub: c.sub }); setPage(1); }}>
                {c.label} <Count n={c.n} active={on} />
              </CatChip>
            );
          })}
        </div>

        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden border-b border-border/70"
          >
            <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
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
          rows={pageItems}
          loading={isLoading}
          onRowClick={(a) => router.push(`/animal?id=${a.id}`)}
          sortKey={sortBy}
          sortDir={sortDir}
          onSort={onSort}
          page={page}
          pageSize={PAGE_SIZE}
          total={filtered.length}
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
        {formatNumber(filtered.length)} {t("common.results")}
      </p>
    </>
  );
}

function CatChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-ring/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Count({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={cn(
        "tabular rounded-full px-1.5 text-[10.5px] font-semibold",
        active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
      )}
    >
      {n}
    </span>
  );
}
