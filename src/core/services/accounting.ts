/**
 * Double-entry bookkeeping engine.
 *
 * Pure arithmetic over the account tree and journal entries — no React, no
 * Firebase — so the books can be reasoned about and unit-tested directly.
 * Only *posted* entries move balances; drafts and voided entries are ignored.
 */

import type {
  Account,
  AccountNature,
  AccountType,
  ID,
  JournalEntry,
  JournalLine,
} from "@/core/domain/types";
import { round } from "@/lib/utils";

/**
 * How many journal entries the books are read from. Lives here — a pure,
 * dependency-free module — so the accounting page can import it without pulling
 * the Firestore adapter (and its SDK) into its bundle. The Firebase adapter
 * re-exports it for its own read bound.
 *
 * Capped at 10,000: that is Firestore's hard maximum for a query `limit()`, and
 * exceeding it makes the query itself throw `invalid-argument` ("Limit value in
 * the structured query is over the maximum of 10000") — which fails not just
 * ledger reads but every accounting *write*, since a save reads the ledger to
 * allocate the next document number.
 */
export const LEDGER_READ_LIMIT = 10_000;

/** Which side increases this kind of account (طبيعة الحساب). */
export function normalBalance(type: AccountType): AccountNature {
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

/* ------------------------------ Entry validity ----------------------------- */

export interface EntryTotals {
  debit: number;
  credit: number;
  difference: number;
  balanced: boolean;
}

/** Sum an entry's sides. A valid entry has equal debits and credits (and at
 *  least one non-zero line). */
export function entryTotals(lines: JournalLine[]): EntryTotals {
  const debit = round(lines.reduce((s, l) => s + (l.debit || 0), 0), 2);
  const credit = round(lines.reduce((s, l) => s + (l.credit || 0), 0), 2);
  const difference = round(debit - credit, 2);
  return { debit, credit, difference, balanced: difference === 0 && debit > 0 };
}

export function isBalanced(lines: JournalLine[]): boolean {
  return entryTotals(lines).balanced;
}

/** A line must sit on exactly one side — never both, never neither. */
export function isValidLine(line: JournalLine): boolean {
  const d = line.debit || 0;
  const c = line.credit || 0;
  if (d < 0 || c < 0) return false;
  return (d > 0 && c === 0) || (c > 0 && d === 0);
}

/* -------------------------------- Balances --------------------------------- */

export interface AccountBalance {
  accountId: ID;
  /** Total posted to each side, including the opening balance. */
  debit: number;
  credit: number;
  /** Net, expressed in the account's own nature (positive = normal side). */
  balance: number;
}

const POSTED = (e: JournalEntry) => e.status === "posted";

/**
 * Per-account debit/credit totals from the posted journal, seeded with each
 * account's opening balance. A negative opening balance simply lands on the
 * opposite side.
 */
export function accountBalances(
  accounts: Account[],
  entries: JournalEntry[],
  opts: { from?: string; upTo?: string; fiscalYearId?: ID } = {},
): Map<ID, AccountBalance> {
  const out = new Map<ID, AccountBalance>();

  for (const a of accounts) {
    let debit = 0;
    let credit = 0;
    const opening = a.openingBalance ?? 0;
    // The opening balance is the state *before* any entry, so it belongs to a
    // cumulative (as-of) view. A period view with a lower bound counts only the
    // flows inside the window, so the opening is left out.
    if (opening !== 0 && !opts.from) {
      const onNormalSide = opening > 0;
      const amount = Math.abs(opening);
      const debitSide = a.nature === "debit" ? onNormalSide : !onNormalSide;
      if (debitSide) debit += amount;
      else credit += amount;
    }
    out.set(a.id, { accountId: a.id, debit, credit, balance: 0 });
  }

  for (const e of entries) {
    if (!POSTED(e)) continue;
    if (opts.from && e.date < opts.from) continue;
    if (opts.upTo && e.date > opts.upTo) continue;
    if (opts.fiscalYearId && e.fiscalYearId !== opts.fiscalYearId) continue;
    for (const l of e.lines) {
      const row = out.get(l.accountId);
      if (!row) continue; // line points at an account we don't know — ignore
      row.debit += l.debit || 0;
      row.credit += l.credit || 0;
    }
  }

  for (const a of accounts) {
    const row = out.get(a.id)!;
    row.debit = round(row.debit, 2);
    row.credit = round(row.credit, 2);
    row.balance = round(a.nature === "debit" ? row.debit - row.credit : row.credit - row.debit, 2);
  }
  return out;
}

/* --------------------------------- The tree -------------------------------- */

export interface AccountNode extends Account {
  children: AccountNode[];
  /** Own + all descendants. */
  debit: number;
  credit: number;
  balance: number;
  depth: number;
}

const byCode = (a: { code: string }, b: { code: string }) =>
  a.code.localeCompare(b.code, undefined, { numeric: true });

/**
 * Nest accounts by parentId and roll debit/credit totals up into the group
 * accounts, so a parent shows the sum of everything beneath it.
 */
export function buildAccountTree(
  accounts: Account[],
  balances?: Map<ID, AccountBalance>,
): AccountNode[] {
  const nodes = new Map<ID, AccountNode>();
  for (const a of accounts) {
    const b = balances?.get(a.id);
    nodes.set(a.id, {
      ...a,
      children: [],
      debit: b?.debit ?? 0,
      credit: b?.credit ?? 0,
      balance: 0,
      depth: 0,
    });
  }

  const roots: AccountNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Roll totals upward, then settle depth + ordering.
  const settle = (node: AccountNode, depth: number): { debit: number; credit: number } => {
    node.depth = depth;
    node.children.sort(byCode);
    let debit = node.debit;
    let credit = node.credit;
    for (const c of node.children) {
      const sub = settle(c, depth + 1);
      debit += sub.debit;
      credit += sub.credit;
    }
    node.debit = round(debit, 2);
    node.credit = round(credit, 2);
    node.balance = round(
      node.nature === "debit" ? node.debit - node.credit : node.credit - node.debit,
      2,
    );
    return { debit: node.debit, credit: node.credit };
  };

  roots.sort(byCode);
  roots.forEach((r) => settle(r, 0));
  return roots;
}

/** Depth-first flatten — the shape a tree table renders from. */
export function flattenTree(nodes: AccountNode[]): AccountNode[] {
  const out: AccountNode[] = [];
  const walk = (list: AccountNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * Next free child code. Width is inferred from existing siblings so a tree that
 * uses 2-digit segments (102 → 10201) keeps doing so, defaulting to 2.
 */
export function nextChildCode(parentCode: string, siblingCodes: string[], width?: number): string {
  const kids = siblingCodes.filter((c) => c.startsWith(parentCode) && c.length > parentCode.length);
  const w = width ?? (kids.length ? kids[0].length - parentCode.length : 2);
  const taken = new Set(kids);
  for (let n = 1; n < 10 ** w; n++) {
    const candidate = parentCode + String(n).padStart(w, "0");
    if (!taken.has(candidate)) return candidate;
  }
  return parentCode + String(kids.length + 1);
}

/* ------------------------------ Trial balance ------------------------------ */

export interface TrialBalanceRow {
  account: Account;
  debit: number;
  credit: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

/**
 * ميزان المراجعة — one row per posting account that has movement, plus the
 * grand totals. A healthy ledger has equal columns.
 */
export function trialBalance(
  accounts: Account[],
  entries: JournalEntry[],
  opts: { upTo?: string; includeZero?: boolean } = {},
): TrialBalance {
  const balances = accountBalances(accounts, entries, { upTo: opts.upTo });
  const rows: TrialBalanceRow[] = [];

  for (const a of [...accounts].sort(byCode)) {
    if (a.isGroup) continue; // groups are just headers; their leaves carry the numbers
    const b = balances.get(a.id)!;
    if (!opts.includeZero && b.debit === 0 && b.credit === 0) continue;
    // Present the net on its natural side rather than both columns gross.
    const net = round(b.debit - b.credit, 2);
    rows.push({ account: a, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
  }

  const totalDebit = round(rows.reduce((s, r) => s + r.debit, 0), 2);
  const totalCredit = round(rows.reduce((s, r) => s + r.credit, 0), 2);
  return { rows, totalDebit, totalCredit, balanced: round(totalDebit - totalCredit, 2) === 0 };
}

/* --------------------------- Statements (P&L / BS) -------------------------- */

export interface StatementLine {
  account: Account;
  amount: number;
}

export interface IncomeStatement {
  revenue: StatementLine[];
  expenses: StatementLine[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

/** قائمة الدخل — revenue less expenses over the period. */
export function incomeStatement(
  accounts: Account[],
  entries: JournalEntry[],
  opts: { from?: string; upTo?: string; fiscalYearId?: ID } = {},
): IncomeStatement {
  const balances = accountBalances(accounts, entries, opts);
  const pick = (type: AccountType) =>
    [...accounts]
      .filter((a) => a.type === type && !a.isGroup)
      .sort(byCode)
      .map((a) => ({ account: a, amount: balances.get(a.id)!.balance }))
      .filter((l) => l.amount !== 0);

  const revenue = pick("revenue");
  const expenses = pick("expense");
  const totalRevenue = round(revenue.reduce((s, l) => s + l.amount, 0), 2);
  const totalExpenses = round(expenses.reduce((s, l) => s + l.amount, 0), 2);
  return {
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
    netIncome: round(totalRevenue - totalExpenses, 2),
  };
}

export interface BalanceSheet {
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  /** Profit for the period, folded into equity so the sheet balances. */
  netIncome: number;
  balanced: boolean;
}

/** الميزانية — assets against liabilities + equity (including the period result). */
export function balanceSheet(
  accounts: Account[],
  entries: JournalEntry[],
  opts: { upTo?: string; fiscalYearId?: ID } = {},
): BalanceSheet {
  // A balance sheet is always a snapshot as of a date — never a windowed range —
  // so it uses only the upper bound. Retained earnings must be the cumulative
  // result up to that date for the sheet to balance, so `from` is deliberately
  // dropped before both the balances and the net-income roll-in.
  const asOf = { upTo: opts.upTo, fiscalYearId: opts.fiscalYearId };
  const balances = accountBalances(accounts, entries, asOf);
  const pick = (type: AccountType) =>
    [...accounts]
      .filter((a) => a.type === type && !a.isGroup)
      .sort(byCode)
      .map((a) => ({ account: a, amount: balances.get(a.id)!.balance }))
      .filter((l) => l.amount !== 0);

  const assets = pick("asset");
  const liabilities = pick("liability");
  const equity = pick("equity");
  const { netIncome } = incomeStatement(accounts, entries, asOf);

  const totalAssets = round(assets.reduce((s, l) => s + l.amount, 0), 2);
  const totalLiabilities = round(liabilities.reduce((s, l) => s + l.amount, 0), 2);
  const totalEquity = round(equity.reduce((s, l) => s + l.amount, 0), 2);

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    netIncome,
    balanced: round(totalAssets - (totalLiabilities + totalEquity + netIncome), 2) === 0,
  };
}

/* ------------------------------ Ledger listing ----------------------------- */

export interface LedgerRow {
  entry: JournalEntry;
  line: JournalLine;
  debit: number;
  credit: number;
  /** Running balance in the account's nature. */
  running: number;
}

/** دفتر الأستاذ — one account's movements in date order with a running balance. */
export function accountLedger(
  account: Account,
  entries: JournalEntry[],
): { rows: LedgerRow[]; closing: number } {
  const rows: LedgerRow[] = [];
  let running = account.openingBalance ?? 0;

  const relevant = entries
    .filter((e) => e.status === "posted" && e.lines.some((l) => l.accountId === account.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));

  for (const entry of relevant) {
    for (const line of entry.lines) {
      if (line.accountId !== account.id) continue;
      const debit = line.debit || 0;
      const credit = line.credit || 0;
      running += account.nature === "debit" ? debit - credit : credit - debit;
      rows.push({ entry, line, debit, credit, running: round(running, 2) });
    }
  }
  return { rows, closing: round(running, 2) };
}

/* --------------------------- Partner balances (AR/AP) ---------------------- */

/** The accounts that represent money owed either way. */
const PARTNER_ACCOUNT_KEYS = new Set([
  "receivable",
  "payable",
  "notes_receivable",
  "notes_payable",
]);

export interface PartnerBalance {
  partnerId: ID;
  debit: number;
  credit: number;
  /** Positive → they owe the farm. Negative → the farm owes them. */
  balance: number;
}

/**
 * ارصدة عملاء / موردين — what each party owes or is owed.
 *
 * Only receivable/payable accounts count. A milk sale line tagged with the
 * customer must not inflate their balance — the revenue is the farm's, the
 * debt is what sits in receivables.
 */
export function partnerBalances(
  accounts: Account[],
  entries: JournalEntry[],
): Map<ID, PartnerBalance> {
  const arApIds = new Set(
    accounts.filter((a) => a.systemKey && PARTNER_ACCOUNT_KEYS.has(a.systemKey)).map((a) => a.id),
  );
  const out = new Map<ID, PartnerBalance>();

  for (const entry of entries) {
    if (entry.status !== "posted") continue;
    for (const line of entry.lines) {
      if (!line.partnerId || !arApIds.has(line.accountId)) continue;
      const row =
        out.get(line.partnerId) ??
        { partnerId: line.partnerId, debit: 0, credit: 0, balance: 0 };
      row.debit += line.debit || 0;
      row.credit += line.credit || 0;
      out.set(line.partnerId, row);
    }
  }

  for (const row of out.values()) {
    row.debit = round(row.debit, 2);
    row.credit = round(row.credit, 2);
    row.balance = round(row.debit - row.credit, 2);
  }
  return out;
}

export interface StatementRow {
  entry: JournalEntry;
  debit: number;
  credit: number;
  running: number;
}

/** One party's account movements in date order, with a running balance. */
export function partnerStatement(
  partnerId: ID,
  accounts: Account[],
  entries: JournalEntry[],
): { rows: StatementRow[]; closing: number } {
  const arApIds = new Set(
    accounts.filter((a) => a.systemKey && PARTNER_ACCOUNT_KEYS.has(a.systemKey)).map((a) => a.id),
  );
  const rows: StatementRow[] = [];
  let running = 0;

  const ordered = [...entries]
    .filter((e) => e.status === "posted")
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));

  for (const entry of ordered) {
    for (const line of entry.lines) {
      if (line.partnerId !== partnerId || !arApIds.has(line.accountId)) continue;
      const debit = line.debit || 0;
      const credit = line.credit || 0;
      running += debit - credit;
      rows.push({ entry, debit, credit, running: round(running, 2) });
    }
  }
  return { rows, closing: round(running, 2) };
}
