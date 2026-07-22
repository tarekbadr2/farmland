"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Banknote, Percent, Receipt, Wallet } from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ChartCard, ChartTooltip, CHART_COLORS, axisProps, gridProps } from "@/components/common/chart";
import { DataTable, type Column } from "@/components/common/data-table";
import { RecordTransactionDialog } from "@/components/finance/record-transaction-dialog";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import { useAnimals, useHealth, useInvoices, useMilkDaily, usePartners, useTransactions } from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import { diffDays, formatDate, formatMonth } from "@/lib/date";
import { enterprisePnl, expenseBreakdown, financeMetrics, monthlyFinance } from "@/core/services/metrics";
import { downloadTableXlsx } from "@/lib/export";
import { round, sum } from "@/lib/utils";
import type { Invoice, Transaction } from "@/core/domain/types";

export default function FinancePage() {
  const { t, ln, locale, formatNumber, formatCurrency, formatCompact } = useI18n();
  const ar = locale === "ar";
  const { data: txns = [], isLoading } = useTransactions();
  const { data: invoices = [] } = useInvoices();
  const { data: partners = [] } = usePartners();
  const { data: daily = [] } = useMilkDaily();
  const { data: animalPage } = useAnimals({ pageSize: 100000 });
  const { data: health = [] } = useHealth();

  const milk30 = sum(daily.slice(-30).map((d) => d.totalL));
  const m = React.useMemo(() => financeMetrics(txns, TODAY, milk30), [txns, milk30]);
  const pnl = React.useMemo(
    () => enterprisePnl(txns, animalPage?.items ?? [], health, TODAY, 365),
    [txns, animalPage, health],
  );
  const series = React.useMemo(() => monthlyFinance(txns, 12), [txns]);
  const breakdown = React.useMemo(() => expenseBreakdown(txns, TODAY, 30), [txns]);

  // Rolling cash position — the number that decides whether payroll clears.
  const cashflow = React.useMemo(() => {
    let balance = 0;
    return series.map((s) => {
      balance += s.profit;
      return { ...s, balance };
    });
  }, [series]);

  const revenueMix = React.useMemo(() => {
    const last90 = txns.filter((x) => x.kind === "income" && diffDays(TODAY, x.date) <= 90);
    const grouped = new Map<string, number>();
    last90.forEach((x) => grouped.set(x.category, (grouped.get(x.category) ?? 0) + x.amount));
    return [...grouped.entries()].map(([category, amount], i) => ({
      category,
      label: t(`txn.${category}` as never),
      amount,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [txns, t]);

  const outstanding = invoices.filter((i) => i.status !== "paid");
  const overdue = invoices.filter((i) => i.status === "overdue");
  const invoiceTotal = (inv: Invoice) =>
    sum(inv.lines.map((l) => l.qty * l.unitPrice));

  const txnColumns: Column<Transaction>[] = [
    { key: "date", header: t("common.date"), cell: (x) => <span className="tabular text-[12.5px]">{formatDate(x.date, locale)}</span> },
    {
      key: "desc",
      header: t("common.name"),
      cell: (x) => (
        <div>
          <p className="text-[13px] font-medium">{x.description}</p>
          <p className="text-[11px] text-muted-foreground">{t(`txn.${x.category}` as never)}</p>
        </div>
      ),
    },
    {
      key: "party",
      header: t("partners.contact"),
      secondary: true,
      cell: (x) => {
        const p = partners.find((pp) => pp.id === x.counterpartyId);
        return <span className="text-[12px] text-muted-foreground">{p ? ln(p) : "—"}</span>;
      },
    },
    {
      key: "method",
      header: t("common.status"),
      secondary: true,
      cell: (x) => <Badge variant="outline">{x.paymentMethod}</Badge>,
    },
    {
      key: "amount",
      header: t("common.value"),
      align: "end",
      cell: (x) => (
        <span
          className={
            x.kind === "income"
              ? "tabular text-[12.5px] font-semibold text-[var(--success)]"
              : "tabular text-[12.5px] font-semibold text-destructive"
          }
        >
          {x.kind === "income" ? "+" : "−"}
          {formatCurrency(x.amount)}
        </span>
      ),
    },
  ];

  const invoiceColumns: Column<Invoice>[] = [
    { key: "number", header: "#", cell: (i) => <span className="tabular text-[13px] font-medium">{i.number}</span> },
    {
      key: "customer",
      header: t("partners.title"),
      cell: (i) => {
        const p = partners.find((pp) => pp.id === i.customerId);
        return <span className="text-[12.5px]">{p ? ln(p) : i.customerId}</span>;
      },
    },
    { key: "issued", header: t("common.date"), secondary: true, cell: (i) => <span className="tabular text-[12.5px]">{formatDate(i.issuedAt, locale)}</span> },
    { key: "due", header: t("tasks.due"), secondary: true, cell: (i) => <span className="tabular text-[12.5px]">{formatDate(i.dueAt, locale)}</span> },
    {
      key: "total",
      header: t("common.total"),
      align: "end",
      cell: (i) => <span className="tabular text-[12.5px] font-medium">{formatCurrency(invoiceTotal(i))}</span>,
    },
    {
      key: "balance",
      header: t("finance.outstanding"),
      align: "end",
      cell: (i) => {
        const bal = invoiceTotal(i) - i.paidAmount;
        return (
          <span className={bal > 0 ? "tabular text-[12.5px] font-semibold text-[var(--warning)]" : "tabular text-[12.5px] text-muted-foreground"}>
            {formatCurrency(Math.max(0, bal))}
          </span>
        );
      },
    },
    {
      key: "status",
      header: t("common.status"),
      cell: (i) => (
        <Badge
          variant={
            i.status === "paid"
              ? "success"
              : i.status === "overdue"
                ? "destructive"
                : i.status === "partial"
                  ? "warning"
                  : "secondary"
          }
        >
          {i.status}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("finance.title")}
        subtitle={t("finance.subtitle")}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadTableXlsx(
                  "transactions",
                  t("finance.title"),
                  txns.map((x) => ({
                    date: x.date,
                    kind: x.kind,
                    category: x.category,
                    amount: x.amount,
                    description: x.description,
                    method: x.paymentMethod,
                  })),
                  { subtitle: t("finance.subtitle"), rtl: locale === "ar" },
                )
              }
            >
              {t("common.export")}
            </Button>
            <RecordTransactionDialog />
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
          label={t("finance.income")}
          value={formatCompact(m.revenue)}
          icon={ArrowUpRight}
          tone="success"
          delta={m.revenueDelta}
        />
        <StatCard
          label={t("finance.expenses")}
          value={formatCompact(m.expenses)}
          icon={ArrowDownRight}
          tone="warning"
          delta={m.expenseDelta}
          invertDelta
        />
        <StatCard
          label={t("finance.profit")}
          value={formatCompact(m.profit)}
          icon={Wallet}
          tone={m.profit >= 0 ? "success" : "destructive"}
        />
        <StatCard label={t("finance.margin")} value={formatNumber(m.margin)} unit="%" icon={Percent} tone="info" />
        <StatCard
          label={t("finance.costPerLiter")}
          value={formatNumber(m.costPerLiter, { maximumFractionDigits: 2 })}
          unit="EGP"
          icon={Banknote}
          hint={`${t("finance.breakEven")} ${formatNumber(round(m.costPerLiter * 1.05, 2))}`}
        />
        <StatCard
          label={t("finance.outstanding")}
          value={formatCompact(sum(outstanding.map((i) => invoiceTotal(i) - i.paidAmount)))}
          icon={Receipt}
          tone={overdue.length ? "destructive" : "default"}
          hint={`${formatNumber(overdue.length)} ${t("finance.overdue").toLowerCase()}`}
        />
      </motion.div>

      {/* Enterprise P&L — dairy vs meat */}
      <motion.div variants={cardIn} initial="hidden" animate="show" className="mt-4">
        <Card>
          <div className="px-5 pb-2 pt-4">
            <CardTitle>{ar ? "الربحية حسب النشاط" : "Profitability by enterprise"}</CardTitle>
            <CardDescription>
              {ar ? "الحليب مقابل اللحم — آخر ١٢ شهرًا (تكاليف موزّعة)" : "Dairy vs. meat — last 12 months (allocated costs)"}
            </CardDescription>
          </div>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                { label: ar ? "الحليب" : "Dairy", d: pnl.dairy },
                { label: ar ? "اللحم" : "Meat", d: pnl.meat },
              ] as const).map((col) => (
                <div key={col.label} className="rounded-xl border border-border/70 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[14px] font-semibold">{col.label}</span>
                    <span className={"text-[15px] font-semibold " + (col.d.grossMargin >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive")}>
                      {formatCurrency(col.d.grossMargin)}
                    </span>
                  </div>
                  <ul className="space-y-1 text-[12.5px]">
                    <li className="flex justify-between"><span className="text-muted-foreground">{ar ? "الإيراد" : "Revenue"}</span><span className="tabular">{formatCurrency(col.d.revenue)}</span></li>
                    <li className="flex justify-between"><span className="text-muted-foreground">{ar ? "العلف (موزّع)" : "Feed (allocated)"}</span><span className="tabular text-muted-foreground">−{formatCurrency(col.d.feed)}</span></li>
                    <li className="flex justify-between"><span className="text-muted-foreground">{ar ? "علاج وبيطرة" : "Meds & vet"}</span><span className="tabular text-muted-foreground">−{formatCurrency(col.d.meds)}</span></li>
                    <li className="mt-1 flex justify-between border-t border-border/50 pt-1 font-medium"><span>{ar ? "هامش المساهمة" : "Gross margin"}</span><span className="tabular">{formatCurrency(col.d.grossMargin)}</span></li>
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1.5 text-[13px]">
              <div className="flex justify-between"><span className="text-muted-foreground">{ar ? "إيرادات أخرى" : "Other income"}</span><span className="tabular">{formatCurrency(pnl.otherIncome)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{ar ? "مصاريف مشتركة (عمالة، مرافق…)" : "Shared overhead (labour, utilities…)"}</span><span className="tabular text-muted-foreground">−{formatCurrency(pnl.sharedOverhead)}</span></div>
              <div className="flex justify-between border-t border-border/60 pt-1.5 text-[14px] font-semibold">
                <span>{ar ? "صافي ربح المزرعة" : "Farm net profit"}</span>
                <span className={"tabular " + (pnl.net >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive")}>{formatCurrency(pnl.net)}</span>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              {ar
                ? "العلف موزّع حسب وزن كل قطيع، والعلاج حسب تكلفته لكل نشاط. المصاريف المشتركة لا تُوزَّع."
                : "Feed is allocated by each herd's liveweight and meds by each herd's health cost; shared overhead isn't split."}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={gridStagger} initial="hidden" animate="show" className="mt-4 grid gap-3 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title={t("finance.pnl")} description={t("common.last12m")}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={series} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => formatMonth(v, locale)} minTickGap={10} />
              <YAxis {...axisProps} width={52} tickFormatter={(v: number) => formatCompact(v)} />
              <RTooltip
                content={
                  <ChartTooltip
                    labelFormatter={(l) => formatMonth(l, locale)}
                    formatter={(v) => formatCurrency(v)}
                  />
                }
              />
              <Bar dataKey="income" name={t("finance.income")} fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" name={t("finance.expenses")} fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
              <Line type="monotone" dataKey="profit" name={t("finance.profit")} stroke="var(--chart-3)" strokeWidth={2.2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("finance.byCategory")} description={t("common.last30")}>
          <div className="space-y-2 px-4 py-2">
            {breakdown.slice(0, 8).map((b, i) => (
              <motion.div
                key={b.category}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="truncate text-muted-foreground">{t(`txn.${b.category}` as never)}</span>
                  <span className="tabular font-medium">{formatCompact(b.amount)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${b.share}%` }}
                    transition={{ duration: 0.5, delay: i * 0.04 }}
                    className="h-full rounded-full"
                    style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </ChartCard>

        <ChartCard className="xl:col-span-2" title={t("finance.cashflow")} description={t("common.last12m")}>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={cashflow} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...axisProps} tickFormatter={(v: string) => formatMonth(v, locale)} minTickGap={10} />
              <YAxis {...axisProps} width={52} tickFormatter={(v: number) => formatCompact(v)} />
              <RTooltip
                content={
                  <ChartTooltip
                    labelFormatter={(l) => formatMonth(l, locale)}
                    formatter={(v) => formatCurrency(v)}
                  />
                }
              />
              <Area type="monotone" dataKey="balance" name={t("finance.cashflow")} stroke="var(--chart-2)" strokeWidth={2} fill="url(#cashFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("finance.income")} description={t("common.last90")}>
          <div className="flex items-center">
            <ResponsiveContainer width="55%" height={210}>
              <PieChart>
                <Pie data={revenueMix} dataKey="amount" nameKey="label" innerRadius={46} outerRadius={76} paddingAngle={2} stroke="none">
                  {revenueMix.map((r) => (
                    <Cell key={r.category} fill={r.color} />
                  ))}
                </Pie>
                <RTooltip content={<ChartTooltip formatter={(v) => formatCurrency(v)} />} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="flex-1 space-y-2 pe-3">
              {revenueMix.map((r) => (
                <li key={r.category} className="flex items-center gap-2 text-[12px]">
                  <span className="size-2 rounded-[3px]" style={{ background: r.color }} />
                  <span className="truncate text-muted-foreground">{r.label}</span>
                  <span className="tabular ms-auto font-medium">{formatCompact(r.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>
      </motion.div>

      <motion.div variants={cardIn} initial="hidden" animate="show" className="mt-4">
        <Card>
          <div className="px-5 pb-2 pt-4">
            <CardTitle>{t("finance.transactions")}</CardTitle>
            <CardDescription>
              {formatNumber(txns.length)} {t("common.results")}
            </CardDescription>
          </div>
          <CardContent className="px-0 pb-0">
            <Tabs defaultValue="txns">
              <div className="px-5">
                <TabsList className="mb-2">
                  <TabsTrigger value="txns">{t("finance.transactions")}</TabsTrigger>
                  <TabsTrigger value="invoices">{t("finance.invoices")}</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="txns">
                <DataTable
                  columns={txnColumns}
                  rows={[...txns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60)}
                  loading={isLoading}
                  mobileCard={(x) => (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium">{x.description}</p>
                        <p className="tabular text-[12px] text-muted-foreground">
                          {formatDate(x.date, locale)} · {t(`txn.${x.category}` as never)}
                        </p>
                      </div>
                      <span
                        className={
                          x.kind === "income"
                            ? "tabular shrink-0 text-[13px] font-semibold text-[var(--success)]"
                            : "tabular shrink-0 text-[13px] font-semibold text-destructive"
                        }
                      >
                        {x.kind === "income" ? "+" : "−"}
                        {formatCompact(x.amount)}
                      </span>
                    </div>
                  )}
                />
              </TabsContent>

              <TabsContent value="invoices">
                <DataTable
                  columns={invoiceColumns}
                  rows={invoices}
                  mobileCard={(i) => (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="tabular truncate text-[13.5px] font-medium">{i.number}</p>
                        <p className="tabular text-[12px] text-muted-foreground">
                          {formatCurrency(invoiceTotal(i))}
                        </p>
                      </div>
                      <Badge variant={i.status === "paid" ? "success" : i.status === "overdue" ? "destructive" : "warning"}>
                        {i.status}
                      </Badge>
                    </div>
                  )}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat label={t("finance.milkSales")} value={formatCompact(sum(txns.filter((x) => x.category === "milk_sales" && diffDays(TODAY, x.date) <= 30).map((x) => x.amount)))} />
        <MiniStat label={t("finance.animalSales")} value={formatCompact(sum(txns.filter((x) => x.category === "animal_sales" && diffDays(TODAY, x.date) <= 30).map((x) => x.amount)))} />
        <MiniStat label={t("txn.feed")} value={formatCompact(sum(txns.filter((x) => x.category === "feed" && diffDays(TODAY, x.date) <= 30).map((x) => x.amount)))} />
        <MiniStat label={t("txn.labor")} value={formatCompact(sum(txns.filter((x) => x.category === "labor" && diffDays(TODAY, x.date) <= 60).map((x) => x.amount)))} />
      </div>
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold">{value}</p>
    </Card>
  );
}
