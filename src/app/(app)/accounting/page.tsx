"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { BookOpen, CheckCircle2, Lock, Plus, Scale, Sigma, Wallet } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import {
  useAccounts,
  useJournalEntries,
  useFiscalYears,
  useSetJournalStatus,
  useCloseFiscalYear,
} from "@/hooks/use-farm-data";
import {
  accountBalances,
  buildAccountTree,
  flattenTree,
  trialBalance,
  incomeStatement,
  balanceSheet,
} from "@/core/services/accounting";
import { JournalEntryDialog } from "@/components/accounting/journal-entry-dialog";
import { AccountFormDialog } from "@/components/accounting/account-form-dialog";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Account, JournalEntry } from "@/core/domain/types";

export default function AccountingPage() {
  const { locale, formatCurrency } = useI18n();
  const ar = locale === "ar";
  const { data: accounts = [] } = useAccounts();
  const { data: entries = [] } = useJournalEntries();
  const { data: years = [] } = useFiscalYears();
  const setStatus = useSetJournalStatus();
  const closeYear = useCloseFiscalYear();

  const balances = React.useMemo(() => accountBalances(accounts, entries), [accounts, entries]);
  const tree = React.useMemo(() => buildAccountTree(accounts, balances), [accounts, balances]);
  const rows = React.useMemo(() => flattenTree(tree), [tree]);
  const tb = React.useMemo(() => trialBalance(accounts, entries), [accounts, entries]);
  const pl = React.useMemo(() => incomeStatement(accounts, entries), [accounts, entries]);
  const bs = React.useMemo(() => balanceSheet(accounts, entries), [accounts, entries]);

  const openYear = years.find((y) => y.status === "open");
  const label = (a: Account) => (ar ? a.nameAr : a.name);
  const posted = entries.filter((e) => e.status === "posted").length;
  const drafts = entries.filter((e) => e.status === "draft").length;

  const post = async (entry: JournalEntry) => {
    try {
      await setStatus.mutateAsync({ id: entry.id, status: "posted" });
      toast.success(ar ? "تم ترحيل القيد." : "Entry posted.");
    } catch {
      toast.error(ar ? "تعذّر الترحيل." : "Couldn't post that entry.");
    }
  };

  return (
    <>
      <PageHeader
        title={ar ? "الحسابات" : "Accounting"}
        subtitle={
          ar
            ? "شجرة الحسابات والقيود وميزان المراجعة والقوائم المالية."
            : "Chart of accounts, journal, trial balance and financial statements."
        }
        actions={
          <JournalEntryDialog
            trigger={
              <Button size="sm">
                <Plus /> {ar ? "قيد جديد" : "New entry"}
              </Button>
            }
          />
        }
      />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <motion.div variants={cardIn}>
          <StatCard
            label={ar ? "إجمالي الأصول" : "Total assets"}
            value={formatCurrency(bs.totalAssets)}
            icon={Wallet}
          />
        </motion.div>
        <motion.div variants={cardIn}>
          <StatCard
            label={ar ? "إجمالي الخصوم" : "Total liabilities"}
            value={formatCurrency(bs.totalLiabilities)}
            icon={Scale}
          />
        </motion.div>
        <motion.div variants={cardIn}>
          <StatCard
            label={ar ? "صافي الربح" : "Net income"}
            value={formatCurrency(pl.netIncome)}
            icon={Sigma}
            tone={pl.netIncome >= 0 ? "success" : "destructive"}
          />
        </motion.div>
        <motion.div variants={cardIn}>
          <StatCard
            label={ar ? "القيود المرحّلة" : "Posted entries"}
            value={String(posted)}
            icon={BookOpen}
            hint={drafts ? (ar ? `${drafts} مسودة` : `${drafts} draft`) : undefined}
          />
        </motion.div>
      </motion.div>

      <Tabs defaultValue="tree">
        <TabsList className="mb-4 flex w-full overflow-x-auto lg:w-auto">
          <TabsTrigger value="tree">{ar ? "شجرة الحسابات" : "Chart of accounts"}</TabsTrigger>
          <TabsTrigger value="journal">{ar ? "القيود" : "Journal"}</TabsTrigger>
          <TabsTrigger value="trial">{ar ? "ميزان المراجعة" : "Trial balance"}</TabsTrigger>
          <TabsTrigger value="statements">{ar ? "القوائم المالية" : "Statements"}</TabsTrigger>
        </TabsList>

        {/* --------------------------- Chart of accounts -------------------------- */}
        <TabsContent value="tree">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-2 px-5 pb-2 pt-4">
              <div>
                <CardTitle>{ar ? "شجرة الحسابات" : "Chart of accounts"}</CardTitle>
                <CardDescription>
                  {ar
                    ? "الأرصدة محسوبة من القيود المرحّلة فقط."
                    : "Balances come from posted entries only."}
                </CardDescription>
              </div>
              <AccountFormDialog
                trigger={
                  <Button variant="outline" size="sm">
                    <Plus /> {ar ? "حساب" : "Account"}
                  </Button>
                }
              />
            </div>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="border-y border-border bg-muted/40 text-[12px] text-muted-foreground">
                    <tr>
                      <th className="p-2.5 text-start font-medium">{ar ? "الكود" : "Code"}</th>
                      <th className="p-2.5 text-start font-medium">{ar ? "اسم الحساب" : "Account"}</th>
                      <th className="p-2.5 text-start font-medium">{ar ? "النوع" : "Type"}</th>
                      <th className="p-2.5 text-start font-medium">{ar ? "الطبيعة" : "Nature"}</th>
                      <th className="p-2.5 text-end font-medium">{ar ? "الرصيد" : "Balance"}</th>
                      <th className="w-10 p-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((n) => (
                      <tr
                        key={n.id}
                        className={cn(
                          "border-b border-border/60",
                          n.isGroup && "bg-muted/25 font-semibold",
                        )}
                      >
                        <td className="p-2.5 tabular-nums text-muted-foreground">{n.code}</td>
                        <td className="p-2.5">
                          {/* Indentation carries the hierarchy. */}
                          <span style={{ paddingInlineStart: `${n.depth * 16}px` }}>{label(n)}</span>
                        </td>
                        <td className="p-2.5 text-muted-foreground">
                          {ar ? TYPE_AR[n.type] : TYPE_EN[n.type]}
                        </td>
                        <td className="p-2.5">
                          <Badge variant={n.nature === "debit" ? "default" : "secondary"}>
                            {n.nature === "debit" ? (ar ? "مدين" : "Debit") : ar ? "دائن" : "Credit"}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-end tabular-nums">
                          {n.balance ? formatCurrency(n.balance) : "—"}
                        </td>
                        <td className="p-2.5">
                          {!n.isGroup ? null : (
                            <AccountFormDialog
                              parent={n}
                              trigger={
                                <button
                                  className="text-muted-foreground transition hover:text-primary"
                                  aria-label={ar ? "إضافة حساب فرعي" : "Add sub-account"}
                                >
                                  <Plus className="size-3.5" />
                                </button>
                              }
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------------------- Journal ------------------------------- */}
        <TabsContent value="journal">
          <Card>
            <div className="px-5 pb-2 pt-4">
              <CardTitle>{ar ? "دفتر اليومية" : "Journal"}</CardTitle>
              <CardDescription>
                {ar
                  ? "القيد المرحّل لا يُعدَّل — يُعكس بقيد مضاد."
                  : "A posted entry is never edited — reverse it instead."}
              </CardDescription>
            </div>
            <CardContent className="space-y-2.5">
              {entries.length === 0 && (
                <p className="py-6 text-center text-[13px] text-muted-foreground">
                  {ar ? "لا توجد قيود بعد." : "No entries yet."}
                </p>
              )}
              {entries.slice(0, 60).map((e) => {
                const total = e.lines.reduce((s, l) => s + (l.debit || 0), 0);
                return (
                  <div key={e.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium">{e.description}</p>
                        <p className="text-[11.5px] text-muted-foreground">
                          {e.number} · {formatDate(e.date, locale)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold tabular-nums">
                          {formatCurrency(total)}
                        </span>
                        <Badge
                          variant={
                            e.status === "posted"
                              ? "success"
                              : e.status === "void"
                                ? "destructive"
                                : "warning"
                          }
                        >
                          {e.status === "posted"
                            ? ar ? "مرحّل" : "Posted"
                            : e.status === "void"
                              ? ar ? "ملغى" : "Void"
                              : ar ? "مسودة" : "Draft"}
                        </Badge>
                        {e.status === "draft" && (
                          <Button size="sm" variant="outline" onClick={() => post(e)}>
                            {ar ? "ترحيل" : "Post"}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
                      {e.lines.map((l, i) => {
                        const a = accounts.find((x) => x.id === l.accountId);
                        return (
                          <div
                            key={`${e.id}_${i}`}
                            className="flex items-center justify-between text-[12px]"
                          >
                            <span className={cn("truncate", l.credit > 0 && "ps-6")}>
                              {a ? `${a.code} · ${label(a)}` : l.accountId}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {l.debit > 0
                                ? `${ar ? "مدين" : "Dr"} ${formatCurrency(l.debit)}`
                                : `${ar ? "دائن" : "Cr"} ${formatCurrency(l.credit)}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------------------- Trial balance ---------------------------- */}
        <TabsContent value="trial">
          <Card>
            <div className="px-5 pb-2 pt-4">
              <CardTitle>{ar ? "ميزان المراجعة" : "Trial balance"}</CardTitle>
              <CardDescription>
                {tb.balanced
                  ? ar ? "الميزان متوازن." : "The ledger balances."
                  : ar ? "الميزان غير متوازن!" : "The ledger does not balance!"}
              </CardDescription>
            </div>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="border-y border-border bg-muted/40 text-[12px] text-muted-foreground">
                    <tr>
                      <th className="p-2.5 text-start font-medium">{ar ? "الكود" : "Code"}</th>
                      <th className="p-2.5 text-start font-medium">{ar ? "الحساب" : "Account"}</th>
                      <th className="p-2.5 text-end font-medium">{ar ? "مدين" : "Debit"}</th>
                      <th className="p-2.5 text-end font-medium">{ar ? "دائن" : "Credit"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tb.rows.map((r) => (
                      <tr key={r.account.id} className="border-b border-border/60">
                        <td className="p-2.5 tabular-nums text-muted-foreground">{r.account.code}</td>
                        <td className="p-2.5">{label(r.account)}</td>
                        <td className="p-2.5 text-end tabular-nums">
                          {r.debit ? formatCurrency(r.debit) : "—"}
                        </td>
                        <td className="p-2.5 text-end tabular-nums">
                          {r.credit ? formatCurrency(r.credit) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="p-2.5" colSpan={2}>
                        {ar ? "الإجمالي" : "Total"}
                      </td>
                      <td className="p-2.5 text-end tabular-nums">{formatCurrency(tb.totalDebit)}</td>
                      <td className="p-2.5 text-end tabular-nums">{formatCurrency(tb.totalCredit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------ Statements ------------------------------ */}
        <TabsContent value="statements">
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <div className="px-5 pb-2 pt-4">
                <CardTitle>{ar ? "قائمة الدخل" : "Income statement"}</CardTitle>
                <CardDescription>{ar ? "الإيرادات ناقص المصروفات" : "Revenue less expenses"}</CardDescription>
              </div>
              <CardContent className="space-y-1.5 text-[13px]">
                <Section title={ar ? "الإيرادات" : "Revenue"} />
                {pl.revenue.map((l) => (
                  <Row key={l.account.id} label={label(l.account)} value={formatCurrency(l.amount)} />
                ))}
                <Row bold label={ar ? "إجمالي الإيرادات" : "Total revenue"} value={formatCurrency(pl.totalRevenue)} />

                <Section title={ar ? "المصروفات" : "Expenses"} />
                {pl.expenses.map((l) => (
                  <Row key={l.account.id} label={label(l.account)} value={formatCurrency(l.amount)} />
                ))}
                <Row bold label={ar ? "إجمالي المصروفات" : "Total expenses"} value={formatCurrency(pl.totalExpenses)} />

                <div className="mt-2 flex items-center justify-between border-t-2 border-border pt-2 text-[14px] font-semibold">
                  <span>{ar ? "صافي الربح" : "Net income"}</span>
                  <span className={cn("tabular-nums", pl.netIncome < 0 && "text-destructive")}>
                    {formatCurrency(pl.netIncome)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <div className="px-5 pb-2 pt-4">
                <CardTitle>{ar ? "الميزانية العمومية" : "Balance sheet"}</CardTitle>
                <CardDescription>
                  {bs.balanced
                    ? ar ? "الأصول = الخصوم + حقوق الملكية" : "Assets = liabilities + equity"
                    : ar ? "غير متوازنة!" : "Does not balance!"}
                </CardDescription>
              </div>
              <CardContent className="space-y-1.5 text-[13px]">
                <Section title={ar ? "الأصول" : "Assets"} />
                {bs.assets.map((l) => (
                  <Row key={l.account.id} label={label(l.account)} value={formatCurrency(l.amount)} />
                ))}
                <Row bold label={ar ? "إجمالي الأصول" : "Total assets"} value={formatCurrency(bs.totalAssets)} />

                <Section title={ar ? "الخصوم" : "Liabilities"} />
                {bs.liabilities.map((l) => (
                  <Row key={l.account.id} label={label(l.account)} value={formatCurrency(l.amount)} />
                ))}
                <Row bold label={ar ? "إجمالي الخصوم" : "Total liabilities"} value={formatCurrency(bs.totalLiabilities)} />

                <Section title={ar ? "حقوق الملكية" : "Equity"} />
                {bs.equity.map((l) => (
                  <Row key={l.account.id} label={label(l.account)} value={formatCurrency(l.amount)} />
                ))}
                <Row label={ar ? "ربح الفترة" : "Profit for the period"} value={formatCurrency(bs.netIncome)} />
                <Row
                  bold
                  label={ar ? "إجمالي حقوق الملكية" : "Total equity"}
                  value={formatCurrency(bs.totalEquity + bs.netIncome)}
                />
              </CardContent>
            </Card>

            {/* Fiscal year control lives with the statements — closing a year is a
                reporting act, not a bookkeeping one. */}
            <Card className="lg:col-span-2">
              <div className="px-5 pb-2 pt-4">
                <CardTitle>{ar ? "السنة المالية" : "Fiscal year"}</CardTitle>
                <CardDescription>
                  {ar ? "إغلاق السنة يمنع أي ترحيل إليها." : "Closing a year blocks further posting into it."}
                </CardDescription>
              </div>
              <CardContent className="space-y-2">
                {years.length === 0 && (
                  <p className="text-[13px] text-muted-foreground">
                    {ar ? "لم تُنشأ سنة مالية بعد." : "No fiscal year yet."}
                  </p>
                )}
                {years.map((y) => (
                  <div
                    key={y.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                  >
                    <div>
                      <p className="text-[13.5px] font-medium">{y.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {formatDate(y.startDate, locale)} — {formatDate(y.endDate, locale)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={y.status === "open" ? "success" : "secondary"}>
                        {y.status === "open" ? (ar ? "مفتوحة" : "Open") : ar ? "مغلقة" : "Closed"}
                      </Badge>
                      {y.status === "open" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={closeYear.isPending}
                          onClick={async () => {
                            await closeYear.mutateAsync(y.id);
                            toast.success(ar ? "تم إغلاق السنة." : "Fiscal year closed.");
                          }}
                        >
                          <Lock className="size-3.5" /> {ar ? "إغلاق" : "Close"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {openYear && (
                  <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <CheckCircle2 className="size-3.5 text-primary" />
                    {ar
                      ? `الترحيل الحالي إلى سنة ${openYear.name}.`
                      : `Posting into ${openYear.name}.`}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

const TYPE_EN: Record<Account["type"], string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense",
};
const TYPE_AR: Record<Account["type"], string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات",
};

function Section({ title }: { title: string }) {
  return (
    <p className="pt-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </p>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between", bold && "font-semibold")}>
      <span className="truncate">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
