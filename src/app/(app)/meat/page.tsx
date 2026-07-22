"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Beef, Calculator, Scale, TrendingUp, Wallet } from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import { useAnimals, useHealth, useFeedConsumption } from "@/hooks/use-farm-data";
import { animalEconomics } from "@/core/services/metrics";
import { TODAY } from "@/core/data/seed";
import { sum, round } from "@/lib/utils";
import type { Animal } from "@/core/domain/types";

const isMeat = (a: Animal) => a.purpose === "meat" || (!a.purpose && a.sex === "male");

export default function MeatPage() {
  const router = useRouter();
  const { locale, formatCurrency, formatNumber } = useI18n();
  const ar = locale === "ar";

  const { data: animalPage } = useAnimals({ pageSize: 100000 });
  const { data: health = [] } = useHealth();
  const { data: feedCons = [] } = useFeedConsumption();
  const animals = React.useMemo(() => animalPage?.items ?? [], [animalPage]);

  const econOf = React.useCallback(
    (a: Animal) => animalEconomics({ animal: a, health, feedConsumption: feedCons, litres: 0, today: TODAY }),
    [health, feedCons],
  );

  const active = React.useMemo(
    () => animals.filter((a) => isMeat(a) && (a.status === "active" || a.status === "quarantine")).map((a) => ({ a, e: econOf(a) })),
    [animals, econOf],
  );
  const sold = React.useMemo(
    () => animals.filter((a) => isMeat(a) && a.disposal?.type === "sold").map((a) => ({ a, e: econOf(a) })),
    [animals, econOf],
  );

  const totalCost = round(sum(active.map((r) => r.e.totalCost)));
  const totalWeight = round(sum(active.map((r) => r.e.currentWeightKg)));
  const avgCostPerKg = totalWeight > 0 ? round(totalCost / totalWeight) : 0;

  // Break-even price calculator (per kg liveweight).
  const [price, setPrice] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (price == null && avgCostPerKg > 0) setPrice(round(avgCostPerKg * 1.15));
  }, [avgCostPerKg, price]);
  const p = price ?? avgCostPerKg;

  const projProceeds = round(p * totalWeight);
  const projProfit = round(projProceeds - totalCost);
  const projMargin = projProceeds > 0 ? round((projProfit / projProceeds) * 100, 1) : 0;

  const realizedProfit = round(sum(sold.map((r) => r.e.profit)));

  return (
    <>
      <PageHeader
        title={ar ? "اللحم / التسمين" : "Meat / fattening"}
        subtitle={ar ? "اقتصاديات حيوانات التسمين — التكلفة الحقيقية للكيلو وسعر التعادل." : "Fattening economics — real cost per kilo and break-even pricing."}
      />

      <motion.div variants={gridStagger} initial="hidden" animate="show" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={ar ? "رؤوس في التسمين" : "Head in fattening"} value={formatNumber(active.length)} icon={Beef} />
        <StatCard label={ar ? "إجمالي المُستثمَر" : "Total invested"} value={formatCurrency(totalCost)} icon={Wallet} tone="info" />
        <StatCard label={ar ? "إجمالي الوزن الحي" : "Total liveweight"} value={`${formatNumber(totalWeight)} ${ar ? "كجم" : "kg"}`} icon={Scale} />
        <StatCard label={ar ? "متوسط تكلفة الكيلو" : "Avg cost / kg"} value={avgCostPerKg ? formatCurrency(avgCostPerKg) : "—"} icon={TrendingUp} tone="warning" />
      </motion.div>

      {/* Break-even calculator */}
      <motion.div variants={cardIn} initial="hidden" animate="show" className="mb-4">
        <Card className="border-primary/25">
          <div className="px-5 pb-2 pt-4">
            <CardTitle className="flex items-center gap-2">
              <Calculator className="size-4 text-primary" />
              {ar ? "حاسبة سعر البيع" : "Break-even & pricing calculator"}
            </CardTitle>
            <CardDescription>
              {ar
                ? `تبيع بربح فوق ${formatCurrency(avgCostPerKg)} لكل كيلو حي.`
                : `You profit above ${formatCurrency(avgCostPerKg)} per kg liveweight.`}
            </CardDescription>
          </div>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="w-full max-w-[220px] space-y-1.5">
                <Label className="text-[12.5px]">{ar ? "سعر البيع (ج.م/كجم حي)" : "Sale price (EGP / kg live)"}</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={price ?? ""}
                  onChange={(e) => setPrice(e.target.value ? Number(e.target.value) : 0)}
                />
              </div>
              <div className="grid flex-1 grid-cols-3 gap-4">
                <div>
                  <p className="text-[11px] text-muted-foreground">{ar ? "الإيراد المتوقّع" : "Projected revenue"}</p>
                  <p className="text-[16px] font-semibold">{formatCurrency(projProceeds)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{ar ? "الربح المتوقّع" : "Projected profit"}</p>
                  <p className={"text-[16px] font-semibold " + (projProfit >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive")}>
                    {formatCurrency(projProfit)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{ar ? "الهامش" : "Margin"}</p>
                  <p className="text-[16px] font-semibold">{formatNumber(projMargin)}%</p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              {ar
                ? "يُطبَّق السعر على إجمالي الوزن الحي للحيوانات في التسمين. التكلفة تشمل الشراء والعلف المُوزَّع والعلاج."
                : "Applied to the total liveweight of animals in fattening. Cost includes purchase, allocated feed and meds."}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Active fattening animals */}
      <motion.div variants={cardIn} initial="hidden" animate="show" className="mb-4">
        <Card>
          <div className="px-5 pb-2 pt-4">
            <CardTitle>{ar ? "قيد التسمين" : "In fattening"}</CardTitle>
            <CardDescription>{formatNumber(active.length)} {ar ? "رأس" : "head"}</CardDescription>
          </div>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-border/70 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2 text-start font-medium">{ar ? "الرقم" : "Tag"}</th>
                    <th className="px-3 py-2 text-end font-medium">{ar ? "أيام" : "Days"}</th>
                    <th className="px-3 py-2 text-end font-medium">{ar ? "الوزن" : "Weight"}</th>
                    <th className="px-3 py-2 text-end font-medium">{ar ? "الزيادة" : "Gain"}</th>
                    <th className="px-3 py-2 text-end font-medium">{ar ? "التكلفة" : "Cost"}</th>
                    <th className="px-3 py-2 text-end font-medium">{ar ? "تكلفة/كجم" : "Cost/kg"}</th>
                    <th className="px-5 py-2 text-end font-medium">{ar ? "ربح متوقّع" : "Proj. profit"}</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map(({ a, e }) => {
                    const profit = round(p * e.currentWeightKg - e.totalCost);
                    return (
                      <tr
                        key={a.id}
                        onClick={() => router.push(`/animal?id=${a.id}`)}
                        className="cursor-pointer border-b border-border/40 transition hover:bg-accent/40"
                      >
                        <td className="px-5 py-2 font-medium">{a.tag}</td>
                        <td className="px-3 py-2 text-end tabular">{formatNumber(e.daysOnFarm)}</td>
                        <td className="px-3 py-2 text-end tabular">{formatNumber(e.currentWeightKg)} {ar ? "كجم" : "kg"}</td>
                        <td className="px-3 py-2 text-end tabular text-muted-foreground">+{formatNumber(e.gainKg)}</td>
                        <td className="px-3 py-2 text-end tabular">{formatCurrency(e.totalCost)}</td>
                        <td className="px-3 py-2 text-end tabular font-medium">{e.costPerKgLive ? formatCurrency(e.costPerKgLive) : "—"}</td>
                        <td className={"px-5 py-2 text-end tabular font-semibold " + (profit >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive")}>
                          {formatCurrency(profit)}
                        </td>
                      </tr>
                    );
                  })}
                  {active.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                        {ar ? "لا توجد حيوانات تسمين. عيّن الغرض 'لحم' على الحيوان." : "No fattening animals. Set an animal's purpose to 'Meat'."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Realized (sold) */}
      {sold.length > 0 && (
        <motion.div variants={cardIn} initial="hidden" animate="show">
          <Card>
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div>
                <CardTitle>{ar ? "مبيعات محقّقة" : "Realized sales"}</CardTitle>
                <CardDescription>{formatNumber(sold.length)} {ar ? "رأس مُباع" : "head sold"}</CardDescription>
              </div>
              <div className="text-end">
                <p className="text-[11px] text-muted-foreground">{ar ? "إجمالي الربح المحقّق" : "Total realized profit"}</p>
                <p className={"text-[17px] font-semibold " + (realizedProfit >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive")}>
                  {formatCurrency(realizedProfit)}
                </p>
              </div>
            </div>
            <CardContent className="flex flex-wrap gap-2 pt-2">
              {sold.map(({ a, e }) => (
                <Badge
                  key={a.id}
                  variant="outline"
                  className="cursor-pointer gap-1"
                  onClick={() => router.push(`/animal?id=${a.id}`)}
                >
                  {a.tag}
                  <span className={e.profit >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive"}>
                    {formatCurrency(e.profit)}
                  </span>
                </Badge>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </>
  );
}
