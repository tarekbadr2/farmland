/**
 * Branches and currencies (الفروع والعملات).
 *
 * **Money is always stored in the farm's base currency.** A journal line's
 * debit/credit is base; the entry's `currency` and `exchangeRate` record what
 * was actually transacted so the document can be shown as it was written and
 * audited. Storing base means the trial balance, statements and every existing
 * calculation keep working untouched — the alternative, mixed-currency line
 * amounts, would silently sum pounds and dollars together.
 */

import type { Branch, Currency, ID, JournalEntry } from "@/core/domain/types";
import { round } from "@/lib/utils";

/* -------------------------------- Currency --------------------------------- */

/** Convert a foreign amount into base currency at the given rate. */
export function toBase(amount: number, rateToBase: number): number {
  return round(amount * (rateToBase || 1), 2);
}

/** Convert a base amount back into a foreign currency, for display. */
export function fromBase(baseAmount: number, rateToBase: number): number {
  if (!rateToBase) return baseAmount;
  return round(baseAmount / rateToBase, 2);
}

export function baseCurrency(currencies: Currency[]): Currency | undefined {
  return currencies.find((c) => c.isBase) ?? currencies[0];
}

export function findCurrency(currencies: Currency[], code?: string): Currency | undefined {
  if (!code) return baseCurrency(currencies);
  return currencies.find((c) => c.code === code);
}

/** The rate for a code, defaulting to 1 (i.e. it is the base). */
export function rateFor(currencies: Currency[], code?: string): number {
  return findCurrency(currencies, code)?.rateToBase ?? 1;
}

/**
 * Format an amount in its original currency alongside the base figure — what a
 * document should show when it wasn't written in the farm's own money.
 */
export function describeForeignAmount(
  baseAmount: number,
  currency: Currency | undefined,
  base: Currency | undefined,
): { original: number; code: string; isForeign: boolean } {
  const isForeign = Boolean(currency && base && currency.code !== base.code);
  return {
    original: isForeign ? fromBase(baseAmount, currency!.rateToBase) : baseAmount,
    code: (isForeign ? currency!.code : base?.code) ?? "",
    isForeign,
  };
}

/** A rate must be a positive number, or conversions silently produce nonsense. */
export function isValidRate(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0;
}

/* --------------------------------- Branches -------------------------------- */

export function defaultBranch(branches: Branch[]): Branch | undefined {
  return branches.find((b) => b.isDefault) ?? branches[0];
}

/**
 * Narrow the ledger to one branch.
 *
 * Entries written before branches existed carry no branchId. They belong to the
 * default branch rather than to nothing — otherwise switching to that branch
 * would hide the farm's entire history.
 */
export function entriesForBranch(
  entries: JournalEntry[],
  branchId: ID | "all",
  defaultBranchId?: ID,
): JournalEntry[] {
  if (branchId === "all") return entries;
  return entries.filter((e) => (e.branchId ?? defaultBranchId) === branchId);
}

/** How many entries each branch carries, for the scope selector. */
export function entryCountByBranch(
  entries: JournalEntry[],
  defaultBranchId?: ID,
): Map<ID, number> {
  const counts = new Map<ID, number>();
  for (const e of entries) {
    const id = e.branchId ?? defaultBranchId;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
