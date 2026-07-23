/**
 * Turns farm documents into balanced journal entries.
 *
 * The ledger should never be hand-maintained alongside the operational data —
 * a milk sale recorded on the finance page must land in the books by itself.
 * This module owns that translation: which account each kind of money touches,
 * and which side it lands on.
 */

import type { Account, ID, JournalEntry, JournalLine, Transaction, TxnCategory } from "@/core/domain/types";
import { findBySystemKey } from "@/core/data/chart-of-accounts";
import { round } from "@/lib/utils";

/** Which ledger account each transaction category books against. */
export const CATEGORY_ACCOUNT: Record<TxnCategory, string> = {
  milk_sales: "revenue_milk",
  animal_sales: "revenue_livestock",
  manure_sales: "revenue_manure",
  other_income: "revenue_other",
  feed: "expense_feed",
  medicine: "expense_medicine",
  veterinary: "expense_medicine",
  labor: "expense_labor",
  fuel: "expense_fuel",
  utilities: "expense_utilities",
  maintenance: "expense_maintenance",
  transport: "expense_transport",
  rent: "expense_rent",
  other_expense: "expense_other",
};

/**
 * The account the cash side of a transaction hits. Credit sales sit in
 * receivables and credit purchases in payables until they're settled.
 */
function counterKey(txn: Pick<Transaction, "kind" | "paymentMethod">): string {
  if (txn.paymentMethod === "bank") return "bank";
  if (txn.paymentMethod === "cash") return "cash";
  return txn.kind === "income" ? "receivable" : "payable";
}

/**
 * One transaction → one balanced entry.
 *
 * Income debits where the money landed and credits the revenue account;
 * an expense debits the cost and credits where the money left. Returns null if
 * the chart is missing an account it needs, so a half-formed entry never posts.
 */
export function journalEntryFromTransaction(
  txn: Transaction,
  accounts: Account[],
  number: string,
): JournalEntry | null {
  const category = findBySystemKey(accounts, CATEGORY_ACCOUNT[txn.category]);
  const counter = findBySystemKey(accounts, counterKey(txn));
  if (!category || !counter) return null;

  const amount = round(Math.abs(txn.amount), 2);
  if (amount === 0) return null;

  const line = (accountId: ID, side: "debit" | "credit"): JournalLine => ({
    accountId,
    debit: side === "debit" ? amount : 0,
    credit: side === "credit" ? amount : 0,
    partnerId: txn.counterpartyId,
    animalId: txn.animalId,
  });

  const lines =
    txn.kind === "income"
      ? [line(counter.id, "debit"), line(category.id, "credit")]
      : [line(category.id, "debit"), line(counter.id, "credit")];

  return {
    id: `jv_${txn.id}`,
    farmId: txn.farmId,
    number,
    date: txn.date,
    description: txn.description,
    reference: txn.invoiceId,
    status: "posted",
    lines,
    sourceKind: "manual",
    sourceId: txn.id,
  };
}

/** Sequential entry number, e.g. JV-2026-0007. */
export function journalNumber(date: string, seq: number): string {
  return `JV-${date.slice(0, 4)}-${String(seq).padStart(4, "0")}`;
}

/** سند قبض / سند صرف — cash in and cash out. */
export type VoucherKind = "receipt" | "payment";

/** Vouchers get their own number series so RV-0001 and PV-0001 can coexist. */
export function voucherNumber(kind: VoucherKind, date: string, seq: number): string {
  const prefix = kind === "receipt" ? "RV" : "PV";
  return `${prefix}-${date.slice(0, 4)}-${String(seq).padStart(4, "0")}`;
}

export interface VoucherInput {
  kind: VoucherKind;
  date: string;
  amount: number;
  /** The cash box or bank account the money moves through. */
  treasuryAccountId: ID;
  /** What it was for — the income, expense, receivable or payable account. */
  counterAccountId: ID;
  description: string;
  partnerId?: ID;
  reference?: string;
}

/**
 * A voucher is just a two-line journal entry with a cash side.
 *
 * A receipt debits the treasury (money arrived) and credits whatever it was
 * for; a payment does the reverse. Building it here means vouchers land in the
 * same ledger as everything else and can't drift from it.
 */
export function journalEntryFromVoucher(
  input: VoucherInput,
  farmId: ID,
  number: string,
): Omit<JournalEntry, "id"> | null {
  const amount = round(Math.abs(input.amount), 2);
  if (amount === 0 || input.treasuryAccountId === input.counterAccountId) return null;

  const treasury: JournalLine = {
    accountId: input.treasuryAccountId,
    debit: input.kind === "receipt" ? amount : 0,
    credit: input.kind === "receipt" ? 0 : amount,
    partnerId: input.partnerId,
  };
  const counter: JournalLine = {
    accountId: input.counterAccountId,
    debit: input.kind === "receipt" ? 0 : amount,
    credit: input.kind === "receipt" ? amount : 0,
    partnerId: input.partnerId,
  };

  return {
    farmId,
    number,
    date: input.date,
    description: input.description,
    reference: input.reference,
    status: "posted",
    lines: [treasury, counter],
    sourceKind: "voucher",
  };
}

/** Post a batch of transactions, numbering them in date order. */
export function journalFromTransactions(
  transactions: Transaction[],
  accounts: Account[],
): JournalEntry[] {
  const ordered = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const out: JournalEntry[] = [];
  let seq = 1;
  for (const txn of ordered) {
    const entry = journalEntryFromTransaction(txn, accounts, journalNumber(txn.date, seq));
    if (entry) {
      out.push(entry);
      seq++;
    }
  }
  return out;
}
