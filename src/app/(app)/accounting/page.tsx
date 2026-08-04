"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, BookOpen, CheckCircle2, Lock, Plus, Scale, Sigma, TriangleAlert, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/provider";
import {
  useAccounts,
  useJournalEntries,
  useFiscalYears,
  useSetJournalStatus,
  useCloseFiscalYear,
  usePartners,
  useSaveJournalEntry,
  useCheques,
  useBranches,
} from "@/hooks/use-farm-data";
import {
  accountBalances,
  buildAccountTree,
  flattenTree,
  trialBalance,
  incomeStatement,
  balanceSheet,
  partnerBalances,
  LEDGER_READ_LIMIT,
} from "@/core/services/accounting";
import { JournalEntryDialog } from "@/components/accounting/journal-entry-dialog";
import { Can } from "@/lib/auth/guard";
import { AccountFormDialog } from "@/components/accounting/account-form-dialog";
import { VoucherDialog } from "@/components/accounting/voucher-dialog";
import { PartnerStatementDialog } from "@/components/accounting/partner-statement-dialog";
import { ChequeDialog, ChequeSettleDialog } from "@/components/accounting/cheque-dialog";
import { reverseEntry, journalNumber } from "@/core/services/posting";
import { defaultBranch, entriesForBranch } from "@/core/services/org";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/menu";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { Account, Cheque, JournalEntry, Partner } from "@/core/domain/types";

export default function AccountingPage() {
  const { locale, formatCurrency } = useI18n();
  const ar = locale === "ar";
  const { data: accounts = [] } = useAccounts();
  const { data: allEntries = [] } = useJournalEntries();
  // Hitting the read bound means the books are computed from a partial ledger.
  // Each entry is internally balanced, so a truncated set STILL balances — the
  // totals would look confident and be wrong. Say so instead.
  const ledgerTruncated = allEntries.length >= LEDGER_READ_LIMIT;
  const { data: branches = [] } = useBranches();
  const [branchScope, setBranchScope] = React.useState<string>("all");
  const fallbackBranch = defaultBranch(branches)?.id;
  // Everything below reads the scoped set, so the whole screen — balances,
  // trial balance, statements — follows the branch selector.
  const entries = React.useMemo(
    () => entriesForBranch(allEntries, branchScope, fallbackBranch),
    [allEntries, branchScope, fallbackBranch],
  );
  const { data: years = [] } = useFiscalYears();
  const setStatus = useSetJournalStatus();
  const closeYear = useCloseFiscalYear();

  const balances = React.useMemo(() => accountBalances(accounts, entries), [accounts, entries]);
  const tree = React.useMemo(() => buildAccountTree(accounts, balances), [accounts, balances]);
  const rows = React.useMemo(() => flattenTree(tree), [tree]);
  const tb = React.useMemo(() => trialBalance(accounts, entries), [accounts, entries]);
  // Reporting period. The income statement covers the window; the balance sheet
  // is always a snapshot as of the window's end (or today for "all time").
  const [period, setPeriod] = React.useState<"all" | "month" | "quarter" | "year" | "custom">("all");
  const [customFrom, setCustomFrom] = React.useState("");
  const [customTo, setCustomTo] = React.useState("");

  const range = React.useMemo((): { from?: string; upTo?: string } => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = ymd(now);
    switch (period) {
      case "month":
        return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), upTo: today };
      case "quarter":
        return {
          from: ymd(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)),
          upTo: today,
        };
      case "year":
        return { from: ymd(new Date(now.getFullYear(), 0, 1)), upTo: today };
      case "custom":
        return { from: customFrom || undefined, upTo: customTo || undefined };
      default:
        return {};
    }
  }, [period, customFrom, customTo]);

  const periodLabel =
    period === "all"
      ? ar ? "كل الفترات" : "All time"
      : period === "month"
        ? ar ? "هذا الشهر" : "This month"
        : period === "quarter"
          ? ar ? "هذا الربع" : "This quarter"
          : period === "year"
            ? ar ? "هذه السنة" : "This year"
            : ar ? "فترة مخصصة" : "Custom range";

  const pl = React.useMemo(
    () => incomeStatement(accounts, entries, range),
    [accounts, entries, range],
  );
  const bs = React.useMemo(
    () => balanceSheet(accounts, entries, { upTo: range.upTo }),
    [accounts, entries, range],
  );
  const { data: partners = [] } = usePartners();
  const { data: cheques = [] } = useCheques();
  const partnerName = (id?: string) => {
    const p = partners.find((x) => x.id === id);
    return p ? (ar ? p.nameAr : p.name) : "—";
  };
  const partnerBal = React.useMemo(
    () => partnerBalances(accounts, entries),
    [accounts, entries],
  );
  // Positive means they owe the farm; negative means the farm owes them.
  const receivables = partners
    .map((p) => ({ partner: p, row: partnerBal.get(p.id) }))
    .filter((x) => x.row && x.row.balance > 0);
  const payables = partners
    .map((p) => ({ partner: p, row: partnerBal.get(p.id) }))
    .filter((x) => x.row && x.row.balance < 0);
  const totalReceivable = receivables.reduce((s, x) => s + (x.row?.balance ?? 0), 0);
  const totalPayable = payables.reduce((s, x) => s + Math.abs(x.row?.balance ?? 0), 0);

  const openYear = years.find((y) => y.status === "open");
  const label = (a: Account) => (ar ? a.nameAr : a.name);
  const posted = entries.filter((e) => e.status === "posted").length;
  const drafts = entries.filter((e) => e.status === "draft").length;

  const saveEntry = useSaveJournalEntry();

  /** Correct a posted entry by booking its mirror image (قيد عكسي). */
  const reverse = async (entry: JournalEntry) => {
    const built = reverseEntry(entry, journalNumber(entry.date, entries.length + 1));
    try {
      await saveEntry.mutateAsync({
        date: built.date,
        description: built.description,
        reference: built.reference,
        number: built.number,
        status: "posted",
        lines: built.lines,
        sourceKind: built.sourceKind,
        fiscalYearId: built.fiscalYearId,
      });
      toast.success(ar ? "تم ترحيل القيد العكسي." : "Reversing entry posted.");
    } catch {
      toast.error(ar ? "تعذّر عكس القيد." : "Couldn't reverse that entry.");
    }
  };

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
          <>
            {/* Reporting period — drives the income statement, the balance-sheet
                as-of date, and the net-income stat card. */}
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="h-8 w-36 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{ar ? "كل الفترات" : "All time"}</SelectItem>
                <SelectItem value="month">{ar ? "هذا الشهر" : "This month"}</SelectItem>
                <SelectItem value="quarter">{ar ? "هذا الربع" : "This quarter"}</SelectItem>
                <SelectItem value="year">{ar ? "هذه السنة" : "This year"}</SelectItem>
                <SelectItem value="custom">{ar ? "مخصص" : "Custom"}</SelectItem>
              </SelectContent>
            </Select>
            {period === "custom" && (
              <>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 w-36 text-[12.5px]"
                  aria-label={ar ? "من" : "From"}
                />
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 w-36 text-[12.5px]"
                  aria-label={ar ? "إلى" : "To"}
                />
              </>
            )}
            {/* Only worth showing once the farm actually has more than one site. */}
            {branches.length > 1 && (
              <Select value={branchScope} onValueChange={setBranchScope}>
                <SelectTrigger className="h-8 w-44 text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? "كل الفروع" : "All branches"}</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {ar ? b.nameAr : b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Can permission="accounting.write">
              <VoucherDialog
                kind="receipt"
                trigger={
                  <Button variant="outline" size="sm">
                    <ArrowDownLeft /> {ar ? "سند قبض" : "Receipt"}
                  </Button>
                }
              />
              <VoucherDialog
                kind="payment"
                trigger={
                  <Button variant="outline" size="sm">
                    <ArrowUpRight /> {ar ? "سند صرف" : "Payment"}
                  </Button>
                }
              />
              <JournalEntryDialog
                trigger={
                  <Button size="sm">
                    <Plus /> {ar ? "قيد جديد" : "New entry"}
                  </Button>
                }
              />
            </Can>
          </>
        }
      />

      {ledgerTruncated && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/[0.07] px-4 py-3 text-[13px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            {ar
              ? `يُقرأ الدفتر بحد أقصى ${LEDGER_READ_LIMIT.toLocaleString("ar-EG")} قيد. الأرصدة أدناه محسوبة من جزء من الدفتر وقد تكون ناقصة — أغلق سنة مالية أو رحّل الأرشيف.`
              : `The ledger read is capped at ${LEDGER_READ_LIMIT.toLocaleString()} entries. The totals below are computed from part of the ledger and may be incomplete — close a fiscal year or archive older entries.`}
          </span>
        </div>
      )}

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
            hint={periodLabel}
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
          <TabsTrigger value="balances">{ar ? "أرصدة العملاء والموردين" : "Customer & supplier balances"}</TabsTrigger>
          <TabsTrigger value="cheques">{ar ? "أوراق القبض والدفع" : "Cheques"}</TabsTrigger>
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
                        {e.status === "posted" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground"
                            disabled={saveEntry.isPending}
                            onClick={() => reverse(e)}
                          >
                            <Undo2 className="size-3.5" /> {ar ? "عكس" : "Reverse"}
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
                {ledgerTruncated
                  ? ar
                    ? "محسوب من جزء من الدفتر — غير مؤكَّد."
                    : "Computed from a partial ledger — not a confirmation."
                  : tb.balanced
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

        {/* --------------------- Customer / supplier balances --------------------- */}
        <TabsContent value="balances">
          <div className="grid gap-3 lg:grid-cols-2">
            <PartnerBalanceCard
              title={ar ? "أرصدة العملاء" : "Customer balances"}
              caption={ar ? "مستحق لنا" : "Owed to the farm"}
              total={totalReceivable}
              rows={receivables.map((x) => ({
                partner: x.partner,
                name: ar ? x.partner.nameAr : x.partner.name,
                amount: x.row!.balance,
              }))}
              empty={ar ? "لا توجد مستحقات." : "Nothing outstanding."}
              formatCurrency={formatCurrency}
              statementLabel={ar ? "كشف حساب" : "Statement"}
            />
            <PartnerBalanceCard
              title={ar ? "أرصدة الموردين" : "Supplier balances"}
              caption={ar ? "مستحق عليها" : "Owed by the farm"}
              total={totalPayable}
              tone="destructive"
              rows={payables.map((x) => ({
                partner: x.partner,
                name: ar ? x.partner.nameAr : x.partner.name,
                amount: Math.abs(x.row!.balance),
              }))}
              empty={ar ? "لا توجد التزامات." : "Nothing owed."}
              formatCurrency={formatCurrency}
              statementLabel={ar ? "كشف حساب" : "Statement"}
            />
          </div>
        </TabsContent>

        {/* -------------------------------- Cheques ------------------------------- */}
        <TabsContent value="cheques">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-2 px-5 pb-2 pt-4">
              <div>
                <CardTitle>{ar ? "أوراق القبض والدفع" : "Cheques"}</CardTitle>
                <CardDescription>
                  {ar
                    ? "الشيك ليس نقدية بعد — يصبح نقدية عند التحصيل."
                    : "A cheque isn't cash yet — it becomes cash when it clears."}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <ChequeDialog
                  kind="receivable"
                  trigger={
                    <Button variant="outline" size="sm">
                      <ArrowDownLeft /> {ar ? "ورقة قبض" : "Received"}
                    </Button>
                  }
                />
                <ChequeDialog
                  kind="payable"
                  trigger={
                    <Button variant="outline" size="sm">
                      <ArrowUpRight /> {ar ? "ورقة دفع" : "Issued"}
                    </Button>
                  }
                />
              </div>
            </div>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="border-y border-border bg-muted/40 text-[12px] text-muted-foreground">
                    <tr>
                      <th className="p-2.5 text-start font-medium">{ar ? "رقم الشيك" : "Cheque"}</th>
                      <th className="p-2.5 text-start font-medium">{ar ? "النوع" : "Type"}</th>
                      <th className="p-2.5 text-start font-medium">{ar ? "الطرف" : "Party"}</th>
                      <th className="p-2.5 text-start font-medium">{ar ? "الاستحقاق" : "Due"}</th>
                      <th className="p-2.5 text-end font-medium">{ar ? "المبلغ" : "Amount"}</th>
                      <th className="p-2.5 text-start font-medium">{ar ? "الحالة" : "Status"}</th>
                      <th className="p-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {cheques.map((c) => (
                      <tr key={c.id} className="border-b border-border/60">
                        <td className="p-2.5 tabular-nums">{c.chequeNumber}</td>
                        <td className="p-2.5 text-muted-foreground">
                          {c.kind === "receivable" ? (ar ? "قبض" : "Receivable") : ar ? "دفع" : "Payable"}
                        </td>
                        <td className="p-2.5">{partnerName(c.partnerId)}</td>
                        <td className="p-2.5 whitespace-nowrap text-muted-foreground">
                          {formatDate(c.dueDate, locale)}
                        </td>
                        <td className="p-2.5 text-end tabular-nums">{formatCurrency(c.amount)}</td>
                        <td className="p-2.5">
                          <Badge variant={CHEQUE_TONE[c.status]}>
                            {ar ? CHEQUE_AR[c.status] : CHEQUE_EN[c.status]}
                          </Badge>
                        </td>
                        <td className="p-2.5">
                          {/* Only a held cheque can still go either way. */}
                          {c.status === "held" && (
                            <div className="flex justify-end gap-1">
                              <ChequeSettleDialog
                                cheque={c}
                                mode="collect"
                                trigger={
                                  <Button size="sm" variant="outline">
                                    {c.kind === "receivable"
                                      ? ar ? "تحصيل" : "Collect"
                                      : ar ? "سداد" : "Pay"}
                                  </Button>
                                }
                              />
                              <ChequeSettleDialog
                                cheque={c}
                                mode="bounce"
                                trigger={
                                  <Button size="sm" variant="ghost" className="text-muted-foreground">
                                    {ar ? "رد" : "Bounce"}
                                  </Button>
                                }
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {cheques.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-muted-foreground">
                          {ar ? "لا توجد أوراق مسجّلة." : "No cheques recorded."}
                        </td>
                      </tr>
                    )}
                  </tbody>
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
                <CardDescription>
                  {ar ? "الإيرادات ناقص المصروفات" : "Revenue less expenses"} · {periodLabel}
                </CardDescription>
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
                  {(bs.balanced
                    ? ar ? "الأصول = الخصوم + حقوق الملكية" : "Assets = liabilities + equity"
                    : ar ? "غير متوازنة!" : "Does not balance!")}
                  {" · "}
                  {ar ? "حتى" : "as of"} {range.upTo ? formatDate(range.upTo, locale) : ar ? "اليوم" : "today"}
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

/** One side of the AR/AP picture — who owes what, and the total. */
function PartnerBalanceCard({
  title,
  caption,
  total,
  rows,
  empty,
  formatCurrency,
  tone,
  statementLabel,
}: {
  title: string;
  caption: string;
  total: number;
  rows: { partner: Partner; name: string; amount: number }[];
  empty: string;
  formatCurrency: (n: number) => string;
  tone?: "destructive";
  statementLabel: string;
}) {
  return (
    <Card>
      <div className="px-5 pb-2 pt-4">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{caption}</CardDescription>
      </div>
      <CardContent className="space-y-1.5 text-[13px]">
        {rows.length === 0 && <p className="py-6 text-center text-muted-foreground">{empty}</p>}
        {rows.map((r) => (
          // The whole row opens that party's statement — the number alone rarely
          // answers the question, "what makes it up?" does.
          <PartnerStatementDialog
            key={r.partner.id}
            partner={r.partner}
            trigger={
              <button
                className="flex w-full items-center justify-between border-b border-border/50 py-1.5 text-start transition hover:bg-accent/40"
                aria-label={`${statementLabel} — ${r.name}`}
              >
                <span className="truncate">{r.name}</span>
                <span className="tabular-nums">{formatCurrency(r.amount)}</span>
              </button>
            }
          />
        ))}
        {rows.length > 0 && (
          <div className="flex items-center justify-between pt-2 text-[14px] font-semibold">
            <span>{caption}</span>
            <span className={cn("tabular-nums", tone === "destructive" && "text-destructive")}>
              {formatCurrency(total)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const CHEQUE_EN: Record<Cheque["status"], string> = {
  held: "Held",
  collected: "Cleared",
  bounced: "Bounced",
  cancelled: "Cancelled",
};
const CHEQUE_AR: Record<Cheque["status"], string> = {
  held: "بالمحفظة",
  collected: "محصّل",
  bounced: "مرتد",
  cancelled: "ملغى",
};
const CHEQUE_TONE: Record<Cheque["status"], "warning" | "success" | "destructive" | "secondary"> = {
  held: "warning",
  collected: "success",
  bounced: "destructive",
  cancelled: "secondary",
};
