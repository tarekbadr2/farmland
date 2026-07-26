"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Package, ShoppingCart, Truck, Wheat } from "lucide-react";

import { PageHeader, gridStagger } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ChartCard, ChartTooltip, CHART_COLORS, axisProps, gridProps } from "@/components/common/chart";
import { DataTable, type Column } from "@/components/common/data-table";
import { PurchaseDialog } from "@/components/common/purchase-dialog";
import { Can } from "@/lib/auth/guard";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/provider";
import { usePurchases, usePartners, useWarehouses } from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import { formatDate, formatMonth } from "@/lib/date";
import {
  spendByItem,
  spendByMonth,
  spendBySupplier,
  totalSpend,
} from "@/core/services/purchasing";
import { downloadTableXlsx } from "@/lib/export";
import type { Purchase } from "@/core/domain/types";

export default function PurchasingPage() {
  const { t, locale, formatCurrency, formatNumber, formatCompact } = useI18n();
  const ar = locale === "ar";
  const { data: purchases = [], isLoading } = usePurchases();
  const { data: partners = [] } = usePartners();
  const { data: warehouses = [] } = useWarehouses();

  const supplierName = (id?: string) => {
    if (!id) return ar ? "—" : "—";
    const s = partners.find((p) => p.id === id);
    return s ? (ar ? s.nameAr : s.name) : id;
  };
  const storeName = (id?: string) => {
    if (!id) return ar ? "المخزن الرئيسي" : "Main store";
    const w = warehouses.find((x) => x.id === id);
    return w ? (ar ? w.nameAr : w.name) : id;
  };

  const thisMonth = TODAY.slice(0, 7);
  const monthSpend = totalSpend(purchases.filter((p) => p.date.slice(0, 7) === thisMonth));
  const byMonth = React.useMemo(() => spendByMonth(purchases), [purchases]);
  const bySupplier = React.useMemo(() => spendBySupplier(purchases), [purchases]);
  const byItem = React.useMemo(() => spendByItem(purchases).slice(0, 8), [purchases]);
  const topSupplier = bySupplier[0];

  const columns: Column<Purchase>[] = [
    {
      key: "date",
      header: t("common.date"),
      sortable: true,
      cell: (p) => <span className="tabular text-[12.5px]">{formatDate(p.date, locale)}</span>,
    },
    {
      key: "item",
      header: ar ? "الصنف" : "Item",
      cell: (p) => (
        <span className="flex items-center gap-1.5 text-[13px]">
          {p.kind === "feed" ? (
            <Wheat className="size-3.5 text-amber-600" />
          ) : (
            <Package className="size-3.5 text-orange-600" />
          )}
          {ar ? (p.itemNameAr ?? p.itemName) : p.itemName}
        </span>
      ),
    },
    {
      key: "supplier",
      header: ar ? "المورّد" : "Supplier",
      secondary: true,
      cell: (p) => <span className="text-[12.5px] text-muted-foreground">{supplierName(p.supplierId)}</span>,
    },
    {
      key: "qty",
      header: ar ? "الكمية" : "Qty",
      align: "end",
      secondary: true,
      cell: (p) => (
        <span className="tabular text-[12.5px]">
          {formatNumber(p.quantity)} {p.unit}
        </span>
      ),
    },
    {
      key: "unitCost",
      header: ar ? "سعر الوحدة" : "Unit cost",
      align: "end",
      secondary: true,
      cell: (p) => <span className="tabular text-[12.5px]">{formatCurrency(p.unitCost)}</span>,
    },
    {
      key: "total",
      header: ar ? "الإجمالي" : "Total",
      align: "end",
      sortable: true,
      cell: (p) => <span className="tabular text-[13px] font-semibold">{formatCurrency(p.total)}</span>,
    },
    {
      key: "store",
      header: ar ? "المخزن" : "Store",
      secondary: true,
      cell: (p) => <span className="text-[12px] text-muted-foreground">{storeName(p.warehouseId)}</span>,
    },
    {
      key: "pay",
      header: ar ? "الدفع" : "Payment",
      secondary: true,
      cell: (p) => (
        <Badge variant={p.paymentMethod === "credit" ? "warning" : "outline"}>
          {p.paymentMethod === "credit"
            ? ar ? "آجل" : "Credit"
            : p.paymentMethod === "bank"
              ? ar ? "بنك" : "Bank"
              : ar ? "نقدًا" : "Cash"}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("nav.purchasing")}
        subtitle={ar ? "كل ما اشترته المزرعة من أعلاف ومخزون." : "Everything the farm bought — feed and inventory."}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadTableXlsx(
                  "purchases",
                  t("nav.purchasing"),
                  purchases.map((p) => ({
                    date: p.date,
                    item: p.itemName,
                    supplier: supplierName(p.supplierId),
                    qty: p.quantity,
                    unit: p.unit,
                    unit_cost: p.unitCost,
                    total: p.total,
                    store: storeName(p.warehouseId),
                    payment: p.paymentMethod,
                  })),
                  { subtitle: t("nav.purchasing"), rtl: ar },
                )
              }
            >
              <Download /> {t("common.export")}
            </Button>
            <Can permission="feeding.write">
              <PurchaseDialog
                kind="feed"
                trigger={
                  <Button variant="outline" size="sm">
                    <Wheat /> {ar ? "شراء علف" : "Buy feed"}
                  </Button>
                }
              />
            </Can>
            <Can permission="inventory.write">
              <PurchaseDialog
                kind="inventory"
                trigger={
                  <Button size="sm">
                    <ShoppingCart /> {ar ? "شراء مخزون" : "Buy inventory"}
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
        <StatCard label={ar ? "إجمالي المشتريات" : "Total purchases"} value={formatCompact(totalSpend(purchases))} icon={ShoppingCart} tone="info" />
        <StatCard label={ar ? "هذا الشهر" : "This month"} value={formatCompact(monthSpend)} icon={ShoppingCart} />
        <StatCard label={ar ? "عدد العمليات" : "Purchases"} value={formatNumber(purchases.length)} icon={Package} />
        <StatCard
          label={ar ? "أكبر مورّد" : "Top supplier"}
          value={topSupplier ? supplierName(topSupplier.supplierId) : "—"}
          icon={Truck}
          tone="success"
        />
      </motion.div>

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <ChartCard title={ar ? "الإنفاق الشهري" : "Monthly spend"} description={t("common.last12m")} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={byMonth} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => formatMonth(v, locale)} minTickGap={12} />
              <YAxis {...axisProps} width={44} tickFormatter={(v: number) => formatCompact(v)} />
              <RTooltip
                content={<ChartTooltip labelFormatter={(l) => formatMonth(l, locale)} formatter={(v) => formatCurrency(v)} />}
              />
              <Bar dataKey="total" name={ar ? "إنفاق" : "Spend"} fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={ar ? "حسب المورّد" : "By supplier"}>
          <div className="flex items-center">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie data={bySupplier.slice(0, 6)} dataKey="total" nameKey="supplierId" innerRadius={44} outerRadius={72} paddingAngle={2} stroke="none">
                  {bySupplier.slice(0, 6).map((s, i) => (
                    <Cell key={s.supplierId} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="flex-1 space-y-1.5 pe-2">
              {bySupplier.slice(0, 6).map((s, i) => (
                <li key={s.supplierId} className="flex items-center gap-2 text-[12px]">
                  <span className="size-2 rounded-[3px]" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="truncate text-muted-foreground">{supplierName(s.supplierId)}</span>
                  <span className="tabular ms-auto font-medium">{formatCompact(s.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>
      </div>

      <Card className="mb-4">
        <div className="px-5 pb-1 pt-4">
          <CardTitle className="text-[14px]">{ar ? "أكثر الأصناف إنفاقًا" : "Top items by spend"}</CardTitle>
        </div>
        <CardContent>
          <ul className="divide-y divide-border/60">
            {byItem.map((it) => (
              <li key={it.itemId} className="flex items-center justify-between py-2 text-[13px]">
                <span>{it.itemName}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular text-[12px] text-muted-foreground">{formatNumber(it.quantity)}</span>
                  <span className="tabular font-semibold">{formatCurrency(it.total)}</span>
                </span>
              </li>
            ))}
            {byItem.length === 0 && (
              <li className="py-6 text-center text-[13px] text-muted-foreground">
                {ar ? "لا توجد مشتريات بعد." : "No purchases yet."}
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <div className="px-5 pb-1 pt-4">
          <CardTitle className="text-[14px]">{ar ? "سجل المشتريات" : "Purchase log"}</CardTitle>
        </div>
        <DataTable columns={columns} rows={purchases} loading={isLoading} pageSize={20} />
      </Card>
    </>
  );
}
