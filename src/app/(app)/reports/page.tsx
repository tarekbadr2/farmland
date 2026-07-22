"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Clock,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Mail,
  Printer,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import {
  useAnimals,
  useBreeding,
  useFarm,
  useFeedConsumption,
  useHealth,
  useMilkDaily,
  useTransactions,
} from "@/hooks/use-farm-data";
import { animalEconomics } from "@/core/services/metrics";
import { TODAY } from "@/core/data/seed";
import { addDays, formatDate } from "@/lib/date";
import { downloadCsv, downloadPdf, downloadXlsx, printReport, type ReportDoc } from "@/lib/export";
import type { TKey } from "@/lib/i18n/provider";

type ReportKey =
  | "dailyProduction"
  | "herdInventory"
  | "healthRegister"
  | "financialStatement"
  | "breedingRegister"
  | "feedUsage"
  | "profitability";

const REPORTS: { key: ReportKey; icon: typeof FileText; period: TKey }[] = [
  { key: "dailyProduction", icon: FileBarChart, period: "reports.daily" },
  { key: "herdInventory", icon: FileText, period: "reports.monthly" },
  { key: "profitability", icon: FileSpreadsheet, period: "reports.monthly" },
  { key: "healthRegister", icon: FileText, period: "reports.monthly" },
  { key: "financialStatement", icon: FileSpreadsheet, period: "reports.monthly" },
  { key: "breedingRegister", icon: FileText, period: "reports.monthly" },
  { key: "feedUsage", icon: FileSpreadsheet, period: "reports.weekly" },
];

export default function ReportsPage() {
  const { t, locale, formatNumber } = useI18n();
  const [period, setPeriod] = React.useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");

  const { data: farm } = useFarm();
  const { data: animalPage } = useAnimals({ pageSize: 100000 });
  const { data: milkDaily = [] } = useMilkDaily();
  const { data: health = [] } = useHealth();
  const { data: breeding = [] } = useBreeding();
  const { data: txns = [] } = useTransactions();
  const { data: feedCons = [] } = useFeedConsumption();

  /** Builds the report's rows and metadata, format-agnostic. */
  const buildReport = (key: ReportKey): ReportDoc => {
    const stamp = TODAY;
    const ar = locale === "ar";
    const farmName = ar ? farm?.nameAr : farm?.name;
    // Pick the header row for the active language; the PDF/Excel exporters shape
    // and lay out the Arabic set right-to-left.
    const H = (en: string[], arHeaders: string[]) => (ar ? arHeaders : en);
    // Localise an enum value via its dictionary namespace. Falls back to the raw
    // value (not the dotted key) when there's no translation, so an unmapped code
    // still prints legibly. Works for both languages — it also turns the English
    // report's raw codes ("active", "lactating") into proper labels.
    const E = (ns: string, v: string | null | undefined): string => {
      if (!v) return "";
      const key = `${ns}.${v}`;
      // t() keys are a typed union; these are built at runtime and fall back to
      // the raw value when unmapped, so the cast is safe.
      const out = t(key as Parameters<typeof t>[0]);
      return out === key ? String(v) : out;
    };
    const base = (
      filename: string,
      title: string,
    ): Pick<ReportDoc, "filename" | "subtitle" | "rtl"> & { title: string } => ({
      filename: `${filename}-${stamp}`,
      title,
      subtitle: farmName ?? undefined,
      rtl: ar,
    });

    switch (key) {
      case "dailyProduction":
        return {
          ...base("daily-production", t("reports.dailyProduction")),
          columns: ["date", "morning_l", "evening_l", "total_l", "rejected_l", "milking_cows", "per_cow_l", "fat_pct", "protein_pct"],
          headers: H(
            ["Date", "Morning (L)", "Evening (L)", "Total (L)", "Rejected (L)", "Cows", "Per cow (L)", "Fat %", "Protein %"],
            ["التاريخ", "صباحًا (لتر)", "مساءً (لتر)", "الإجمالي (لتر)", "مرفوض (لتر)", "الأبقار", "لكل بقرة (لتر)", "دهون %", "بروتين %"],
          ),
          rows: milkDaily.slice(-90).map((d) => ({
            date: d.date,
            morning_l: d.morningL,
            evening_l: d.eveningL,
            total_l: d.totalL,
            rejected_l: d.rejectedL,
            milking_cows: d.milkingCows,
            per_cow_l: Math.round((d.totalL / Math.max(1, d.milkingCows)) * 100) / 100,
            fat_pct: d.avgFat,
            protein_pct: d.avgProtein,
          })),
        };
      case "herdInventory":
        return {
          ...base("herd-inventory", t("reports.herdInventory")),
          columns: ["tag", "rfid", "name", "breed", "sex", "dob", "status", "milk_status", "repro_status", "pen", "weight_kg", "bcs", "valuation"],
          headers: H(
            ["Tag", "RFID", "Name", "Breed", "Sex", "DOB", "Status", "Milk", "Repro", "Pen", "Weight (kg)", "BCS", "Value"],
            ["الرقم", "RFID", "الاسم", "السلالة", "الجنس", "الميلاد", "الحالة", "الحليب", "التكاثر", "الحظيرة", "الوزن (كجم)", "الحالة الجسمية", "القيمة"],
          ),
          rows: (animalPage?.items ?? []).map((a) => ({
            tag: a.tag,
            rfid: a.rfid,
            name: ar ? a.nameAr : a.name,
            breed: E("breeds", a.breed),
            sex: E("status", a.sex),
            dob: a.dateOfBirth,
            status: E("status", a.status),
            milk_status: E("status", a.milkStatus),
            repro_status: E("status", a.reproStatus),
            pen: a.penId,
            weight_kg: a.weightKg,
            bcs: a.bodyConditionScore,
            valuation: a.valuation,
          })),
        };
      case "healthRegister":
        return {
          ...base("health-register", t("reports.healthRegister")),
          columns: ["date", "animal", "type", "disease", "vaccine", "medication", "vet", "cost", "withdrawal_until", "outcome"],
          headers: H(
            ["Date", "Animal", "Type", "Disease", "Vaccine", "Medication", "Vet", "Cost", "Withdrawal until", "Outcome"],
            ["التاريخ", "الحيوان", "النوع", "المرض", "اللقاح", "الدواء", "الطبيب", "التكلفة", "فترة السحب", "النتيجة"],
          ),
          rows: health.map((h) => ({
            date: h.date,
            animal: h.animalId,
            type: E("health.type", h.type),
            disease: E("diseases", h.disease),
            vaccine: h.vaccine ?? "",
            medication: h.medication ?? "",
            vet: h.vetName ?? "",
            cost: h.cost,
            withdrawal_until: h.withdrawalUntil ?? "",
            outcome: E("health.outcome", h.outcome),
          })),
        };
      case "financialStatement":
        return {
          ...base("financial-statement", t("reports.financialStatement")),
          columns: ["date", "kind", "category", "amount", "description", "method"],
          headers: H(
            ["Date", "Kind", "Category", "Amount", "Description", "Method"],
            ["التاريخ", "النوع", "الفئة", "المبلغ", "الوصف", "الطريقة"],
          ),
          rows: txns.map((x) => ({
            date: x.date,
            kind: E("finance", x.kind),
            category: E("txn", x.category),
            amount: x.amount,
            description: x.description,
            method: E("finance.method", x.paymentMethod),
          })),
        };
      case "breedingRegister":
        return {
          ...base("breeding-register", t("reports.breedingRegister")),
          columns: ["date", "animal", "type", "sire", "batch", "result", "outcome", "technician"],
          headers: H(
            ["Date", "Animal", "Type", "Sire", "Batch", "Result", "Outcome", "Technician"],
            ["التاريخ", "الحيوان", "النوع", "الطلوقة", "الدفعة", "النتيجة", "الناتج", "الفني"],
          ),
          rows: breeding.map((b) => ({
            date: b.date,
            animal: b.animalId,
            type: E("breeding.type", b.type),
            sire: b.sireId ?? "",
            batch: b.semenBatch ?? "",
            result: E("breeding.resultOption", b.result),
            outcome: E("breeding.outcomeOption", b.outcome),
            technician: b.technician ?? "",
          })),
        };
      case "feedUsage":
        return {
          ...base("feed-usage", t("reports.feedUsage")),
          columns: ["date", "zone", "ration", "kg", "heads", "cost"],
          headers: H(
            ["Date", "Pen", "Ration", "Kg", "Head", "Cost"],
            ["التاريخ", "الحظيرة", "العليقة", "كجم", "العدد", "التكلفة"],
          ),
          rows: feedCons.map((c) => ({
            date: c.date,
            zone: c.zoneId,
            ration: c.rationId,
            kg: c.kg,
            heads: c.heads,
            cost: c.cost,
          })),
        };
      case "profitability":
        return {
          ...base("profitability", t("reports.profitability")),
          columns: [
            "tag", "name", "purpose", "status", "days", "purchase", "feed", "health",
            "total_cost", "start_kg", "end_kg", "gain_kg", "cost_per_kg_live",
            "cost_per_kg_gain", "litres", "cost_per_litre", "proceeds", "profit",
          ],
          headers: H(
            ["Tag", "Name", "Raised for", "Status", "Days", "Purchase", "Feed", "Meds",
              "Total cost", "Start kg", "End kg", "Gain kg", "Cost/kg live",
              "Cost/kg gain", "Litres", "Cost/litre", "Sale price", "Profit"],
            ["الرقم", "الاسم", "الغرض", "الحالة", "أيام", "الشراء", "العلف", "العلاج",
              "إجمالي التكلفة", "وزن البداية", "وزن النهاية", "الزيادة", "تكلفة/كجم حي",
              "تكلفة/كجم زيادة", "لتر", "تكلفة/لتر", "قيمة البيع", "الربح"],
          ),
          rows: (animalPage?.items ?? []).map((a) => {
            const e = animalEconomics({
              animal: a,
              health,
              feedConsumption: feedCons,
              litres: a.lifetimeMilkL,
              today: TODAY,
            });
            return {
              tag: a.tag,
              name: ar ? a.nameAr : a.name,
              purpose: E("animalPurpose", e.purpose),
              status: E("status", a.status),
              days: e.daysOnFarm,
              purchase: e.purchaseCost,
              feed: e.feedCost,
              health: e.healthCost,
              total_cost: e.totalCost,
              start_kg: e.startWeightKg,
              end_kg: e.currentWeightKg,
              gain_kg: e.gainKg,
              cost_per_kg_live: e.costPerKgLive,
              cost_per_kg_gain: e.costPerKgGain,
              litres: e.litres,
              cost_per_litre: e.costPerLitre,
              proceeds: e.proceeds,
              profit: e.sold ? e.profit : "",
            };
          }),
        };
    }
  };

  const generate = async (key: ReportKey, format: "csv" | "xlsx" | "pdf") => {
    const report = buildReport(key);
    if (!report.rows.length) {
      toast.error(locale === "ar" ? "لا توجد بيانات لهذا التقرير." : "No data for this report yet.");
      return;
    }
    try {
      if (format === "csv") downloadCsv(`${report.filename}.csv`, report.rows);
      else if (format === "xlsx") await downloadXlsx(report);
      else await downloadPdf(report);
      toast.success(locale === "ar" ? "تم إنشاء التقرير" : "Report generated");
    } catch {
      toast.error(locale === "ar" ? "تعذّر إنشاء الملف." : "Couldn't generate the file.");
    }
  };

  const scheduled = [
    {
      name: t("reports.dailyProduction"),
      frequency: t("reports.daily"),
      recipients: "owner@niledelta.farm, manager@niledelta.farm",
      format: "PDF",
      lastRun: addDays(TODAY, -1),
      nextRun: TODAY,
    },
    {
      name: t("reports.financialStatement"),
      frequency: t("reports.monthly"),
      recipients: "accounts@niledelta.farm",
      format: "XLSX",
      lastRun: addDays(TODAY, -20),
      nextRun: addDays(TODAY, 10),
    },
    {
      name: t("reports.healthRegister"),
      frequency: t("reports.weekly"),
      recipients: "vet@niledelta.farm",
      format: "PDF",
      lastRun: addDays(TODAY, -3),
      nextRun: addDays(TODAY, 4),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("reports.title")}
        subtitle={t("reports.subtitle")}
        actions={
          <>
            <Select value={period} onValueChange={(v) => setPeriod(v as never)}>
              <SelectTrigger size="sm" className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{t("reports.daily")}</SelectItem>
                <SelectItem value="weekly">{t("reports.weekly")}</SelectItem>
                <SelectItem value="monthly">{t("reports.monthly")}</SelectItem>
                <SelectItem value="yearly">{t("reports.yearly")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={printReport}>
              <Printer /> {t("common.exportPdf")}
            </Button>
          </>
        }
      />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {REPORTS.map((r) => (
          <motion.div key={r.key} variants={cardIn}>
            <Card className="group h-full transition-shadow hover:shadow-md">
              <div className="flex items-start gap-3 px-5 pb-2 pt-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <r.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <CardTitle className="leading-snug">
                    {t(`reports.${r.key}` as TKey)}
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    <Badge variant="outline">{t(r.period)}</Badge>
                  </CardDescription>
                </div>
              </div>
              <CardContent className="flex gap-1.5">
                <Button size="sm" className="flex-1" onClick={() => generate(r.key, "pdf")}>
                  <FileText /> PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => generate(r.key, "xlsx")}
                >
                  <FileSpreadsheet /> Excel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generate(r.key, "csv")}
                  aria-label="CSV"
                >
                  CSV
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={cardIn} initial="hidden" animate="show" className="mt-4">
        <Card>
          <div className="px-5 pb-2 pt-4">
            <CardTitle>{t("reports.scheduled")}</CardTitle>
            <CardDescription>
              {formatNumber(scheduled.length)} {t("common.results")} · Cloud Functions cron
            </CardDescription>
          </div>
          <CardContent className="space-y-2">
            {scheduled.map((s) => (
              <div
                key={s.name}
                className="flex flex-col gap-2 rounded-xl border border-border/70 p-3.5 sm:flex-row sm:items-center"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Clock className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{s.name}</p>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    <Mail className="me-1 inline size-3" />
                    {s.recipients}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{s.frequency}</Badge>
                  <Badge variant="outline">{s.format}</Badge>
                </div>
                <div className="shrink-0 text-[11px] text-muted-foreground sm:w-40 sm:text-end">
                  <p className="tabular">
                    <CalendarDays className="me-1 inline size-3" />
                    {t("reports.nextRun")}: {formatDate(s.nextRun, locale, { year: undefined })}
                  </p>
                  <p className="tabular">
                    {t("reports.lastRun")}: {formatDate(s.lastRun, locale, { year: undefined })}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        {locale === "ar"
          ? "التقارير المجدولة تُنفَّذ عبر Cloud Functions وتُرسل بالبريد تلقائيًا."
          : "Scheduled reports run as Cloud Functions and are emailed automatically."}
      </p>
    </>
  );
}
