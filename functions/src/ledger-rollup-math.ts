/**
 * The rollup arithmetic, with no Firebase in it.
 *
 * Split out from the trigger for the same reason `ledger-check` is split out
 * from `ledger`: the app's test suite imports this directly to prove it agrees
 * with `src/core/services/ledger-rollup.ts`, and importing the trigger would
 * boot firebase-admin. See `ledger-rollup.ts` for what the rollups are for.
 */

export const UNSCOPED = "_none";

export interface JournalLineDoc {
  accountId?: string;
  debit?: number;
  credit?: number;
}

export interface JournalEntryDoc {
  date?: string;
  status?: string;
  branchId?: string;
  fiscalYearId?: string;
  lines?: JournalLineDoc[];
}

export interface RollupTotals {
  debit: number;
  credit: number;
}

export interface Contribution {
  id: string;
  period: string;
  branchId: string;
  fiscalYearId: string;
  accounts: Record<string, RollupTotals>;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const rollupId = (period: string, branchId: string, fiscalYearId: string) =>
  `${period}__${branchId}__${fiscalYearId}`;

/** What one entry adds to the books, or null if it moves nothing. */
export function contribution(entry: JournalEntryDoc | undefined): Contribution | null {
  if (!entry) return null;
  // Only a posted entry moves balances; drafts and voids are invisible.
  if (entry.status !== "posted") return null;
  if (!entry.date) return null;

  const period = entry.date.slice(0, 7);
  const branchId = entry.branchId ?? UNSCOPED;
  const fiscalYearId = entry.fiscalYearId ?? UNSCOPED;
  const accounts: Record<string, RollupTotals> = {};
  for (const l of entry.lines ?? []) {
    const accountId = l.accountId;
    if (!accountId) continue;
    const row = (accounts[accountId] ??= { debit: 0, credit: 0 });
    row.debit += Number(l.debit) || 0;
    row.credit += Number(l.credit) || 0;
  }
  return { id: rollupId(period, branchId, fiscalYearId), period, branchId, fiscalYearId, accounts };
}

/**
 * Fold a signed contribution into a rollup document's data. `sign` is -1 to
 * back out a previous version of an entry and +1 to add the new one.
 *
 * Zeroed account rows are dropped rather than left at 0/0, so backing out the
 * last entry for an account doesn't leave a permanent tombstone in the map.
 */
export function applyToRollup(
  current: { accounts?: Record<string, RollupTotals>; entryCount?: number } | undefined,
  contrib: Contribution,
  sign: 1 | -1,
): { accounts: Record<string, RollupTotals>; entryCount: number } {
  const accounts: Record<string, RollupTotals> = { ...(current?.accounts ?? {}) };
  for (const [accountId, t] of Object.entries(contrib.accounts)) {
    const row = accounts[accountId] ?? { debit: 0, credit: 0 };
    const next = {
      debit: round2(row.debit + sign * t.debit),
      credit: round2(row.credit + sign * t.credit),
    };
    if (next.debit === 0 && next.credit === 0) delete accounts[accountId];
    else accounts[accountId] = next;
  }
  return {
    accounts,
    entryCount: Math.max(0, (current?.entryCount ?? 0) + sign),
  };
}
