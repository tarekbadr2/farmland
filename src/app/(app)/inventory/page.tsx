"use client";

import * as React from "react";
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
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CalendarX,
  Package,
  ArrowLeftRight,
  ClipboardCheck,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { PurchaseDialog } from "@/components/common/purchase-dialog";
import { StocktakeDialog, TransferStockDialog } from "@/components/inventory/store-dialogs";
import { stockInWarehouse, warehouseValue } from "@/core/services/warehouse";
import { StatCard } from "@/components/common/stat-card";
import { ChartCard, ChartTooltip, CHART_COLORS, axisProps, gridProps } from "@/components/common/chart";
import { DataTable, type Column } from "@/components/common/data-table";
import { StockMovementDialog } from "@/components/inventory/stock-movement-dialog";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import { useInventory, useMovements, usePartners, useWarehouses } from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import { diffDays, formatDate } from "@/lib/date";
import { inventoryMetrics } from "@/core/services/metrics";
import { groupBy, sum } from "@/lib/utils";
import { downloadTableXlsx } from "@/lib/export";
import type { InventoryItem, StockMovement } from "@/core/domain/types";

export default function InventoryPage() {
  const { t, ln, locale, formatNumber, formatCurrency, formatCompact } = useI18n();
  const { data: items = [], isLoading } = useInventory();
  const { data: movements = [] } = useMovements();
  const { data: warehouses = [] } = useWarehouses();
  const { data: partners = [] } = usePartners();
  const [category, setCategory] = React.useState("all");

  const m = React.useMemo(() => inventoryMetrics(items, TODAY), [items]);

  const filtered = category === "all" ? items : items.filter((i) => i.category === category);

  const byCategory = React.useMemo(() => {
    const grouped = groupBy(items, (i) => i.category);
    return Object.entries(grouped).map(([key, list], i) => ({
      key,
      label: t(`invCategory.${key}` as never),
      value: sum(list.map((x) => x.stock * x.unitCost)),
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [items, t]);

  const supplierName = (id: string) => {
    const p = partners.find((x) => x.id === id);
    return p ? ln(p) : "—";
  };

  const columns: Column<InventoryItem>[] = [
    {
      key: "name",
      header: t("common.name"),
      cell: (i) => (
        <div>
          <p className="text-[13px] font-medium">{ln(i)}</p>
          <p className="tabular text-[11px] text-muted-foreground">{i.sku}</p>
        </div>
      ),
    },
    {
      key: "category",
      header: t("inventory.category"),
      secondary: true,
      cell: (i) => <Badge variant="secondary">{t(`invCategory.${i.category}` as never)}</Badge>,
    },
    {
      key: "stock",
      header: t("inventory.stock"),
      align: "end",
      cell: (i) => {
        const ratio = (i.stock / Math.max(1, i.reorderLevel * 2)) * 100;
        return (
          <div className="flex items-center justify-end gap-2">
            <div className="w-14">
              <Progress
                value={Math.min(100, ratio)}
                className="h-1.5"
                indicatorClassName={i.stock <= i.reorderLevel ? "bg-destructive" : undefined}
              />
            </div>
            <span className="tabular w-20 text-end text-[12.5px] font-medium">
              {formatNumber(i.stock)} {i.unit}
            </span>
          </div>
        );
      },
    },
    {
      key: "cost",
      header: t("inventory.unitCost"),
      align: "end",
      secondary: true,
      cell: (i) => <span className="tabular text-[12.5px]">{formatCurrency(i.unitCost)}</span>,
    },
    {
      key: "value",
      header: t("inventory.stockValue"),
      align: "end",
      cell: (i) => (
        <span className="tabular text-[12.5px] font-medium">
          {formatCompact(i.stock * i.unitCost)}
        </span>
      ),
    },
    {
      key: "expiry",
      header: t("feed.expiry"),
      cell: (i) => {
        if (!i.expiresAt) return <span className="text-muted-foreground">—</span>;
        const d = diffDays(i.expiresAt, TODAY);
        return (
          <Badge variant={d < 0 ? "destructive" : d < 30 ? "warning" : "outline"}>
            {formatDate(i.expiresAt, locale, { year: "2-digit" })}
          </Badge>
        );
      },
    },
    {
      key: "supplier",
      header: t("feed.supplier"),
      secondary: true,
      cell: (i) => (
        <span className="truncate text-[12px] text-muted-foreground">{supplierName(i.supplierId)}</span>
      ),
    },
    {
      key: "location",
      header: t("inventory.location"),
      secondary: true,
      cell: (i) => <span className="text-[12px] text-muted-foreground">{i.location}</span>,
    },
  ];

  const movementColumns: Column<StockMovement>[] = [
    { key: "date", header: t("common.date"), cell: (mv) => <span className="tabular text-[12.5px]">{formatDate(mv.date, locale)}</span> },
    {
      key: "item",
      header: t("common.name"),
      cell: (mv) => {
        const item = items.find((i) => i.id === mv.itemId);
        return <span className="text-[13px] font-medium">{item ? ln(item) : mv.itemId}</span>;
      },
    },
    {
      key: "kind",
      header: t("common.status"),
      cell: (mv) => (
        <Badge variant={mv.kind === "in" ? "success" : mv.kind === "waste" ? "destructive" : "secondary"}>
          {mv.kind === "in" ? (
            <ArrowDownToLine />
          ) : mv.kind === "waste" ? (
            <Trash2 />
          ) : (
            <ArrowUpFromLine />
          )}
          {t(`inventory.${mv.kind === "in" ? "stockIn" : mv.kind === "waste" ? "waste" : "stockOut"}` as never)}
        </Badge>
      ),
    },
    {
      key: "qty",
      header: t("common.quantity"),
      align: "end",
      cell: (mv) => <span className="tabular text-[12.5px] font-medium">{formatNumber(mv.quantity)}</span>,
    },
    {
      key: "ref",
      header: t("common.notes"),
      secondary: true,
      cell: (mv) => <span className="tabular text-[12px] text-muted-foreground">{mv.reference ?? "—"}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title={t("inventory.title")}
        subtitle={t("inventory.subtitle")}
        actions={
          <>
            <TransferStockDialog
              trigger={
                <Button variant="outline" size="sm">
                  <ArrowLeftRight /> {locale === "ar" ? "تحويل" : "Transfer"}
                </Button>
              }
            />
            <StocktakeDialog
              trigger={
                <Button variant="outline" size="sm">
                  <ClipboardCheck /> {locale === "ar" ? "جرد" : "Stocktake"}
                </Button>
              }
            />
            <PurchaseDialog
              kind="inventory"
              trigger={
                <Button variant="outline" size="sm">
                  <ShoppingCart /> {t("inventory.recordPurchase")}
                </Button>
              }
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadTableXlsx(
                  "inventory",
                  t("inventory.title"),
                  items.map((i) => ({
                    sku: i.sku,
                    name: i.name,
                    category: i.category,
                    stock: i.stock,
                    unit: i.unit,
                    reorder_level: i.reorderLevel,
                    unit_cost: i.unitCost,
                    value: i.stock * i.unitCost,
                    expires: i.expiresAt ?? "",
                  })),
                  { subtitle: t("inventory.subtitle"), rtl: locale === "ar" },
                )
              }
            >
              {t("common.export")}
            </Button>
            <StockMovementDialog />
          </>
        }
      />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        <StatCard label={t("inventory.stockValue")} value={formatCompact(m.stockValue)} icon={Boxes} tone="info" />
        <StatCard label={t("kpi.medicineStock")} value={formatCompact(m.medicineValue)} icon={Package} />
        <StatCard
          label={t("inventory.belowReorder")}
          value={formatNumber(m.lowStock.length)}
          icon={AlertTriangle}
          tone={m.lowStock.length ? "warning" : "success"}
        />
        <StatCard
          label={t("inventory.expiring")}
          value={formatNumber(m.expiring.length)}
          icon={CalendarX}
          tone={m.expiring.length ? "warning" : "success"}
        />
        <StatCard
          label={t("inventory.expired")}
          value={formatNumber(m.expired.length)}
          icon={Trash2}
          tone={m.expired.length ? "destructive" : "success"}
        />
      </motion.div>

      <motion.div variants={gridStagger} initial="hidden" animate="show" className="mt-4 grid gap-3 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title={t("inventory.reorderSuggestions")} description={t("inventory.belowReorder")}>
          <div className="space-y-2 px-3 pb-2">
            {m.reorderSuggestions.slice(0, 6).map((s) => (
              <div
                key={s.item.id}
                className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2.5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] text-[var(--warning)]">
                  <ShoppingCart className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{ln(s.item)}</p>
                  <p className="tabular text-[11px] text-muted-foreground">
                    {formatNumber(s.item.stock)} / {formatNumber(s.item.reorderLevel)} {s.item.unit} ·{" "}
                    {supplierName(s.item.supplierId)}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="tabular text-[13px] font-semibold">
                    {formatNumber(s.suggestedQty)} {s.item.unit}
                  </p>
                  <p className="tabular text-[11px] text-muted-foreground">
                    {formatCurrency(s.estimatedCost)}
                  </p>
                </div>
                <StockMovementDialog
                  itemId={s.item.id}
                  defaultKind="in"
                  trigger={
                    <Button size="sm" variant="outline" className="shrink-0">
                      {t("common.add")}
                    </Button>
                  }
                />
              </div>
            ))}
            {!m.reorderSuggestions.length && (
              <p className="py-10 text-center text-[12px] text-muted-foreground">
                {t("notifications.empty")}
              </p>
            )}
          </div>
        </ChartCard>

        <ChartCard title={t("inventory.stockValue")} description={t("inventory.category")}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byCategory} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid {...gridProps} horizontal={false} />
              <XAxis type="number" {...axisProps} tickFormatter={(v: number) => formatCompact(v)} />
              <YAxis type="category" dataKey="label" {...axisProps} width={88} />
              <RTooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
              <Bar dataKey="value" name={t("common.value")} radius={[0, 4, 4, 0]}>
                {byCategory.map((c) => (
                  <Cell key={c.key} fill={c.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      <motion.div variants={cardIn} initial="hidden" animate="show" className="mt-4">
        <Card>
          <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
            <div>
              <CardTitle>{t("inventory.title")}</CardTitle>
              <CardDescription>
                {formatNumber(filtered.length)} {t("common.results")}
              </CardDescription>
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger size="sm" className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                {["medicine", "equipment", "cleaning", "tools", "fuel", "parts", "consumables"].map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`invCategory.${c}` as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CardContent className="px-0 pb-0">
            <Tabs defaultValue="items">
              <div className="px-5">
                <TabsList className="mb-2">
                  <TabsTrigger value="items">{t("inventory.stock")}</TabsTrigger>
                  <TabsTrigger value="movements">{t("inventory.movements")}</TabsTrigger>
                  <TabsTrigger value="stores">{locale === "ar" ? "المخازن" : "Stores"}</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="items">
                <DataTable
                  columns={columns}
                  rows={filtered}
                  loading={isLoading}
                  mobileCard={(i) => (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[13.5px] font-medium">{ln(i)}</p>
                        {i.stock <= i.reorderLevel && <Badge variant="destructive">!</Badge>}
                      </div>
                      <p className="tabular mt-1 text-[12px] text-muted-foreground">
                        {formatNumber(i.stock)} {i.unit} · {formatCurrency(i.stock * i.unitCost)}
                      </p>
                    </div>
                  )}
                />
              </TabsContent>

              <TabsContent value="movements">
                <DataTable
                  columns={movementColumns}
                  rows={movements.slice(0, 60)}
                  mobileCard={(mv) => {
                    const item = items.find((i) => i.id === mv.itemId);
                    return (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium">
                            {item ? ln(item) : mv.itemId}
                          </p>
                          <p className="tabular text-[12px] text-muted-foreground">
                            {formatDate(mv.date, locale)}
                          </p>
                        </div>
                        <Badge variant={mv.kind === "in" ? "success" : "secondary"}>
                          {mv.kind === "in" ? "+" : "−"}
                          {formatNumber(mv.quantity)}
                        </Badge>
                      </div>
                    );
                  }}
                />
              </TabsContent>
              {/* --------------------------------- Stores -------------------------------- */}
              <TabsContent value="stores">
                <div className="grid gap-3 px-5 pb-5 md:grid-cols-2 xl:grid-cols-3">
                  {warehouses.map((w) => {
                    const holdings = items
                      .map((i) => ({ item: i, qty: stockInWarehouse(i, w.id, movements) }))
                      .filter((h) => h.qty !== 0);
                    const value = warehouseValue(w.id, items, movements);
                    return (
                      <Card key={w.id} className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold">
                              {locale === "ar" ? w.nameAr : w.name}
                            </p>
                            <p className="text-[11.5px] text-muted-foreground">
                              {formatNumber(holdings.length)}{" "}
                              {locale === "ar" ? "صنف" : holdings.length === 1 ? "item" : "items"}
                            </p>
                          </div>
                          {w.isDefault && (
                            <Badge variant="outline">
                              {locale === "ar" ? "افتراضي" : "Default"}
                            </Badge>
                          )}
                        </div>

                        <p className="mt-3 text-[11px] text-muted-foreground">
                          {locale === "ar" ? "قيمة المخزون" : "Stock value"}
                        </p>
                        <p className="text-lg font-semibold">{formatCurrency(value)}</p>

                        <div className="mt-3 space-y-1 border-t border-border/60 pt-2">
                          {holdings.slice(0, 6).map((h) => (
                            <div key={h.item.id} className="flex items-center justify-between text-[12px]">
                              <span className="min-w-0 truncate">
                                {locale === "ar" ? h.item.nameAr : h.item.name}
                              </span>
                              <span className="tabular-nums text-muted-foreground">
                                {formatNumber(h.qty)} {h.item.unit}
                              </span>
                            </div>
                          ))}
                          {holdings.length > 6 && (
                            <p className="pt-1 text-[11px] text-muted-foreground">
                              +{formatNumber(holdings.length - 6)}{" "}
                              {locale === "ar" ? "أصناف أخرى" : "more"}
                            </p>
                          )}
                          {holdings.length === 0 && (
                            <p className="py-3 text-center text-[12px] text-muted-foreground">
                              {locale === "ar" ? "فارغ" : "Empty"}
                            </p>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}
