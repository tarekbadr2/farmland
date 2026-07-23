"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Beef, Building2, Landmark, Plus, TrendingDown, Wallet, Wrench } from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import { useAssets, useAnimals } from "@/hooks/use-farm-data";
import { assetBookValue, assetsSummary } from "@/core/services/metrics";
import { AssetFormDialog, ASSET_CATEGORIES } from "@/components/assets/asset-form-dialog";
import { RecordCostDialog } from "@/components/common/record-cost-dialog";
import { TODAY } from "@/core/data/seed";
import { sum } from "@/lib/utils";
import type { AssetCategory } from "@/core/domain/types";

/** Assets that get serviced — land and buildings don't take maintenance costs. */
const MAINTAINABLE: AssetCategory[] = ["machine", "equipment", "vehicle"];

export default function AssetsPage() {
  const { locale, formatCurrency, formatNumber } = useI18n();
  const ar = locale === "ar";
  const { data: assets = [] } = useAssets();
  const { data: animalPage } = useAnimals({ pageSize: 100000 });

  const herdValue = sum(
    (animalPage?.items ?? [])
      .filter((a) => a.status === "active" || a.status === "quarantine")
      .map((a) => a.valuation),
  );

  const summary = React.useMemo(() => assetsSummary(assets, TODAY), [assets]);
  const totalValue = summary.bookValue + herdValue;

  const catLabel = (c: AssetCategory) => {
    const m = ASSET_CATEGORIES.find((x) => x.value === c);
    return m ? (ar ? m.ar : m.en) : c;
  };

  const active = assets.filter((a) => a.status !== "disposed");

  return (
    <>
      <PageHeader
        title={ar ? "الأصول" : "Assets"}
        subtitle={ar ? "رأس مال المزرعة: الأرض والمباني والآلات والقطيع." : "The farm's capital — land, buildings, machinery and the herd."}
        actions={
          <AssetFormDialog
            trigger={
              <Button size="sm">
                <Plus /> {ar ? "أصل جديد" : "New asset"}
              </Button>
            }
          />
        }
      />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <StatCard label={ar ? "إجمالي قيمة المزرعة" : "Total farm value"} value={formatCurrency(totalValue)} icon={Wallet} tone="success" />
        <StatCard label={ar ? "القطيع (تقدير)" : "Livestock (herd)"} value={formatCurrency(herdValue)} icon={Beef} tone="info" />
        <StatCard label={ar ? "الأصول الثابتة (دفترية)" : "Fixed assets (book)"} value={formatCurrency(summary.bookValue)} icon={Building2} />
        <StatCard label={ar ? "مجمّع الإهلاك" : "Accumulated depreciation"} value={formatCurrency(summary.depreciation)} icon={TrendingDown} tone="warning" />
      </motion.div>

      {/* Category breakdown */}
      {summary.byCategory.length > 0 && (
        <motion.div variants={cardIn} initial="hidden" animate="show" className="mb-4">
          <Card>
            <div className="px-5 pb-2 pt-4">
              <CardTitle>{ar ? "حسب الفئة" : "By category"}</CardTitle>
              <CardDescription>{ar ? "التكلفة مقابل القيمة الدفترية" : "Cost vs. current book value"}</CardDescription>
            </div>
            <CardContent className="space-y-3">
              {summary.byCategory.map((c) => (
                <div key={c.category} className="text-[13px]">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium">{catLabel(c.category as AssetCategory)}</span>
                    <span className="tabular text-muted-foreground">
                      {formatCurrency(c.bookValue)}{" "}
                      <span className="text-[11px]">/ {formatCurrency(c.cost)}</span>
                    </span>
                  </div>
                  <Progress value={c.cost > 0 ? (c.bookValue / c.cost) * 100 : 0} className="h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Asset list */}
      <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {/* Livestock — derived, read-only */}
        <motion.div variants={cardIn}>
          <Card className="h-full border-primary/25 bg-primary/[0.04]">
            <CardContent className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[14px] font-semibold">{ar ? "القطيع" : "Livestock herd"}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    {formatNumber((animalPage?.items ?? []).filter((a) => a.status === "active" || a.status === "quarantine").length)}{" "}
                    {ar ? "رأس نشط" : "active head"}
                  </p>
                </div>
                <Badge variant="outline"><Beef className="size-3.5" /> {ar ? "قطيع" : "Herd"}</Badge>
              </div>
              <div className="mt-auto pt-4">
                <p className="text-[11px] text-muted-foreground">{ar ? "القيمة التقديرية" : "Estimated value"}</p>
                <p className="text-xl font-semibold">{formatCurrency(herdValue)}</p>
                <Link href="/animals" className="mt-1 inline-block text-[12px] text-primary underline-offset-2 hover:underline">
                  {ar ? "إدارة القطيع" : "Manage herd"}
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {active.map((asset) => {
          const v = assetBookValue(asset, TODAY);
          const depPct = asset.cost > 0 ? (v.accumulatedDepreciation / asset.cost) * 100 : 0;
          return (
            <motion.div key={asset.id} variants={cardIn}>
              <AssetFormDialog
                asset={asset}
                trigger={
                  <Card className="h-full cursor-pointer p-5 transition hover:border-ring/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold">
                          {ar ? asset.nameAr || asset.name : asset.name}
                        </p>
                        <p className="text-[11.5px] text-muted-foreground">
                          {v.ageYears > 0 ? `${formatNumber(v.ageYears)} ${ar ? "سنة" : "yr"}` : ar ? "جديد" : "new"}
                          {asset.location ? ` · ${asset.location}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline">{catLabel(asset.category)}</Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-[12.5px]">
                      <div>
                        <p className="text-[11px] text-muted-foreground">{ar ? "التكلفة" : "Cost"}</p>
                        <p className="font-medium">{formatCurrency(asset.cost)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">{ar ? "القيمة الدفترية" : "Book value"}</p>
                        <p className="font-semibold text-primary">{formatCurrency(v.bookValue)}</p>
                      </div>
                    </div>

                    {asset.usefulLifeYears ? (
                      <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between text-[10.5px] text-muted-foreground">
                          <span>{ar ? "الإهلاك" : "Depreciation"}</span>
                          <span className="tabular">
                            {formatCurrency(v.annualDepreciation)}/{ar ? "سنة" : "yr"}
                          </span>
                        </div>
                        <Progress value={depPct} className="h-1.5" />
                      </div>
                    ) : (
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        {ar ? "لا يُهلَك" : "Non-depreciating"}
                      </p>
                    )}
                  </Card>
                }
              />

              {/* Servicing a machine is a cost, so book it straight from here —
                  land and buildings aren't serviced, so they don't offer it. */}
              {MAINTAINABLE.includes(asset.category) && (
                <RecordCostDialog
                  category="maintenance"
                  title={ar ? "تسجيل صيانة" : "Record maintenance"}
                  assetId={asset.id}
                  defaultDescription={`${ar ? "صيانة" : "Maintenance"} — ${ar ? asset.nameAr || asset.name : asset.name}`}
                  trigger={
                    <Button variant="ghost" size="sm" className="mt-1.5 w-full text-muted-foreground">
                      <Wrench /> {ar ? "تسجيل صيانة" : "Record maintenance"}
                    </Button>
                  }
                />
              )}
            </motion.div>
          );
        })}
      </motion.div>

      {active.length === 0 && (
        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          {ar ? "لا توجد أصول بعد. أضف أول أصل." : "No assets yet — add your first one."}
        </p>
      )}
    </>
  );
}
