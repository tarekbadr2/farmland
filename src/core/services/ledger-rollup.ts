/**
 * Period rollups of the journal.
 *
 * The accounting screen used to compute every balance from the raw journal,
 * read with a `limit(10000)` — Firestore's hard maximum. Past 10,000 entries
 * that read silently drops the oldest ones, and because each entry is
 * internally balanced the resulting trial balance still *balances* while being
 * materially wrong. A dairy posting a few hundred entries a month crosses that
 * line in its third or fourth year, and nothing about the totals looks off.
 *
 * So the books stop being derived from an unbounded scan. A Cloud Function
 * keeps a per-month, per-branch, per-fiscal-year rollup of the posted journal,
 * and balances are composed from those instead. The read is then bounded by
 * *time* — one document per month per branch — rather than by transaction
 * volume, which is the only thing that actually grows.
 *
 * Months only partly inside the requested window can't come from a monthly
 * rollup, so the caller supplies the raw entries for those edge months and they
 * are summed directly. In the common case (`from` = the 1st of some month,
 * `upTo` = today) that is exactly one month of entries.
 *
 * Pure arithmetic — no Firebase, no React. `rollupsFromEntries` is the same
 * function the backfill and the incremental trigger are checked against, so
 * "the rollups agree with the ledger" is a property this module can be tested
 * on directly.
 */

import type { Account, ID, JournalEntry } from "@/core/domain/types";
import { round } from "@/lib/utils";

import type { AccountBalance } from "./accounting";

/** Stand-in key for an entry with no branch / no fiscal year. */
export const UNSCOPED = "_none";

export interface RollupTotals {
  debit: number;
  credit: number;
}

export interface LedgerRollup {
  /** `${period}__${branchId}__${fiscalYearId}` — stable and derivable. */
  id: string;
  /** `YYYY-MM`. */
  period: string;
  branchId: string;
  fiscalYearId: string;
  accounts: Record<ID, RollupTotals>;
  /** Posted entries folded in — lets a rebuild spot an empty/stale rollup. */
  entryCount: number;
  updatedAt?: string;
}

/** `YYYY-MM` for an ISO date. */
export const monthOf = (date: string): string => date.slice(0, 7);

export function rollupId(period: string, branchId: string, fiscalYearId: string): string {
  return `${period}__${branchId}__${fiscalYearId}`;
}

/** Last calendar day of a `YYYY-MM`, as `YYYY-MM-DD`. */
export function monthEnd(period: string): string {
  const [y, m] = period.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${period}-${String(last).padStart(2, "0")}`;
}

/**
 * What one entry contributes, or null if it moves no balances. Only *posted*
 * entries count — drafts and voided entries are invisible to the books, which
 * is the same rule `accountBalances` applies.
 */
export function contributionOf(entry: JournalEntry): {
  period: string;
  branchId: string;
  fiscalYearId: string;
  id: string;
  accounts: Record<ID, RollupTotals>;
} | null {
  if (entry.status !== "posted") return null;
  if (!entry.date) return null;

  const period = monthOf(entry.date);
  const branchId = entry.branchId ?? UNSCOPED;
  const fiscalYearId = entry.fiscalYearId ?? UNSCOPED;
  const accounts: Record<ID, RollupTotals> = {};
  for (const l of entry.lines) {
    const row = (accounts[l.accountId] ??= { debit: 0, credit: 0 });
    row.debit += l.debit || 0;
    row.credit += l.credit || 0;
  }
  return { period, branchId, fiscalYearId, id: rollupId(period, branchId, fiscalYearId), accounts };
}

/**
 * Rebuild every rollup from a set of entries. This is the definition the
 * incremental trigger has to agree with — the backfill/repair path runs it
 * directly, and the tests use it as the oracle.
 */
export function rollupsFromEntries(entries: JournalEntry[]): LedgerRollup[] {
  const out = new Map<string, LedgerRollup>();
  for (const e of entries) {
    const c = contributionOf(e);
    if (!c) continue;
    let roll = out.get(c.id);
    if (!roll) {
      roll = {
        id: c.id,
        period: c.period,
        branchId: c.branchId,
        fiscalYearId: c.fiscalYearId,
        accounts: {},
        entryCount: 0,
      };
      out.set(c.id, roll);
    }
    roll.entryCount += 1;
    for (const [accountId, t] of Object.entries(c.accounts)) {
      const row = (roll.accounts[accountId] ??= { debit: 0, credit: 0 });
      row.debit = round(row.debit + t.debit, 2);
      row.credit = round(row.credit + t.credit, 2);
    }
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export interface BalanceWindow {
  from?: string;
  upTo?: string;
  fiscalYearId?: ID;
  /**
   * Months to read from the raw journal even when a rollup covers them.
   *
   * The rollups are maintained by a trigger, so they trail a write by a moment.
   * Pass the current month here and a just-posted entry shows up in the totals
   * immediately instead of after the round trip — without it, the default
   * unbounded view (which has no partial months at all) would compose purely
   * from rollups and briefly omit what the user just saved.
   */
  freshMonths?: string[];
}

/** Is every day of `period` inside the window? */
function fullyCovered(period: string, opts: BalanceWindow): boolean {
  if (opts.from && opts.from > `${period}-01`) return false;
  if (opts.upTo && opts.upTo < monthEnd(period)) return false;
  return true;
}

/** Does `period` share any day with the window at all? */
function overlaps(period: string, opts: BalanceWindow): boolean {
  if (opts.upTo && `${period}-01` > opts.upTo) return false;
  if (opts.from && monthEnd(period) < opts.from) return false;
  return true;
}

/**
 * The months a rollup can't answer for: those the window cuts through. The
 * caller reads the raw entries for exactly these and passes them as
 * `edgeEntries`. Derived from the rollups themselves, so a month with no
 * activity costs nothing.
 */
export function partialMonths(rollups: LedgerRollup[], opts: BalanceWindow = {}): string[] {
  const months = new Set<string>();
  for (const r of rollups) {
    if (opts.fiscalYearId && r.fiscalYearId !== opts.fiscalYearId) continue;
    // A month wholly outside the window is neither rolled up nor read raw — it
    // contributes nothing either way, and calling it "partial" would drag it
    // into the edge read.
    if (overlaps(r.period, opts) && !fullyCovered(r.period, opts)) months.add(r.period);
  }
  // The window's own edges may land in a month with no rollup yet — the current
  // month, before anything is posted to it — and entries there still count.
  // Only when the edge actually cuts the month, though: adding a fully-covered
  // edge month would be harmless arithmetically (the rollup is skipped and the
  // raw entries counted instead) but would pull a whole extra month of the
  // ledger into the read for nothing.
  for (const edge of [opts.from, opts.upTo]) {
    if (edge && !fullyCovered(monthOf(edge), opts)) months.add(monthOf(edge));
  }
  // Months whose rollup may not have caught up yet: take them from the source.
  for (const m of opts.freshMonths ?? []) {
    if (overlaps(m, opts)) months.add(m);
  }
  return [...months].sort();
}

/**
 * Per-account debit/credit totals composed from rollups plus the raw entries of
 * any month the window only partly covers. Produces exactly what
 * `accountBalances(accounts, allEntries, opts)` produces — that equivalence is
 * what `ledger-rollup.test.ts` pins down.
 *
 * `edgeEntries` may be a superset (the whole recent ledger is fine): only
 * entries landing in a partial month are counted, so nothing is double-counted
 * against a rollup.
 */
export function balancesFromRollups(
  accounts: Account[],
  rollups: LedgerRollup[],
  edgeEntries: JournalEntry[],
  opts: BalanceWindow = {},
): Map<ID, AccountBalance> {
  const out = new Map<ID, AccountBalance>();

  for (const a of accounts) {
    let debit = 0;
    let credit = 0;
    const opening = a.openingBalance ?? 0;
    // Same rule as accountBalances: an opening balance is the state *before*
    // any entry, so it belongs to a cumulative view and is left out of a
    // windowed one.
    if (opening !== 0 && !opts.from) {
      const onNormalSide = opening > 0;
      const amount = Math.abs(opening);
      const debitSide = a.nature === "debit" ? onNormalSide : !onNormalSide;
      if (debitSide) debit += amount;
      else credit += amount;
    }
    out.set(a.id, { accountId: a.id, debit, credit, balance: 0 });
  }

  const partial = new Set(partialMonths(rollups, opts));

  for (const r of rollups) {
    if (partial.has(r.period)) continue; // the raw entries below cover it
    if (opts.fiscalYearId && r.fiscalYearId !== opts.fiscalYearId) continue;
    if (!fullyCovered(r.period, opts)) continue;
    for (const [accountId, t] of Object.entries(r.accounts)) {
      const row = out.get(accountId);
      if (!row) continue; // points at an account we don't know — ignore
      row.debit += t.debit;
      row.credit += t.credit;
    }
  }

  for (const e of edgeEntries) {
    if (e.status !== "posted") continue;
    if (!partial.has(monthOf(e.date))) continue;
    if (opts.from && e.date < opts.from) continue;
    if (opts.upTo && e.date > opts.upTo) continue;
    if (opts.fiscalYearId && e.fiscalYearId !== opts.fiscalYearId) continue;
    for (const l of e.lines) {
      const row = out.get(l.accountId);
      if (!row) continue;
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
