/**
 * Turns farm documents into balanced journal entries.
 *
 * The ledger should never be hand-maintained alongside the operational data —
 * a milk sale recorded on the finance page must land in the books by itself.
 * This module owns that translation: which account each kind of money touches,
 * and which side it lands on.
 */

import type {
  Account,
  Cheque,
  ChequeKind,
  ID,
  Invoice,
  InvoiceKind,
  JournalEntry,
  JournalLine,
  Transaction,
  TxnCategory,
} from "@/core/domain/types";
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

/**
 * قيد عكسي — the mirror image of an entry.
 *
 * A posted entry is history and must never be edited, so a mistake (or a goods
 * return) is corrected by posting its opposite: every debit becomes a credit
 * and vice-versa. The pair nets to zero, the audit trail keeps both, and the
 * trial balance stays balanced throughout.
 */
export function reverseEntry(
  entry: JournalEntry,
  number: string,
  opts: { date?: string; description?: string } = {},
): Omit<JournalEntry, "id"> {
  return {
    farmId: entry.farmId,
    number,
    date: opts.date ?? entry.date,
    description: opts.description ?? `Reversal of ${entry.number} — ${entry.description}`,
    reference: entry.number,
    fiscalYearId: entry.fiscalYearId,
    status: "posted",
    // Swap the sides; everything else about the line is preserved.
    lines: entry.lines.map((l) => ({
      ...l,
      debit: l.credit || 0,
      credit: l.debit || 0,
    })),
    sourceKind: entry.sourceKind,
    sourceId: entry.sourceId,
  };
}

/* --------------------------------- Cheques --------------------------------- */

/** Which stage of a cheque's life is being booked. */
export type ChequePhase = "received" | "settled" | "bounced";

/** Cheques get their own series: أوراق قبض CR-, أوراق دفع CP-. */
export function chequeNumber(kind: ChequeKind, date: string, seq: number): string {
  const prefix = kind === "receivable" ? "CR" : "CP";
  return `${prefix}-${date.slice(0, 4)}-${String(seq).padStart(4, "0")}`;
}

/**
 * One stage of a cheque's life → one balanced entry.
 *
 * `received`  — taking a customer's cheque moves their debt from receivables
 *               into notes receivable (and the mirror for one we write out).
 * `settled`   — the cheque cleared: the note becomes real money in a treasury.
 * `bounced`   — it didn't clear, so the debt goes back where it came from.
 *
 * Returns null when the chart is missing an account it needs, so a half-formed
 * entry can never post.
 */
export function journalEntryFromCheque(
  cheque: Cheque,
  phase: ChequePhase,
  accounts: Account[],
  number: string,
  opts: { date?: string; treasuryAccountId?: ID } = {},
): Omit<JournalEntry, "id"> | null {
  const amount = round(Math.abs(cheque.amount), 2);
  if (amount === 0) return null;

  const receivable = cheque.kind === "receivable";
  const note = findBySystemKey(accounts, receivable ? "notes_receivable" : "notes_payable");
  const party = findBySystemKey(accounts, receivable ? "receivable" : "payable");
  if (!note || !party) return null;

  const line = (accountId: ID, side: "debit" | "credit"): JournalLine => ({
    accountId,
    debit: side === "debit" ? amount : 0,
    credit: side === "credit" ? amount : 0,
    partnerId: cheque.partnerId,
  });

  let lines: JournalLine[];
  let what: string;

  if (phase === "received") {
    // The party's balance clears; the note takes its place.
    lines = receivable
      ? [line(note.id, "debit"), line(party.id, "credit")]
      : [line(party.id, "debit"), line(note.id, "credit")];
    what = receivable ? "Cheque received" : "Cheque issued";
  } else if (phase === "settled") {
    const treasury = opts.treasuryAccountId
      ? accounts.find((a) => a.id === opts.treasuryAccountId)
      : findBySystemKey(accounts, "bank") ?? findBySystemKey(accounts, "cash");
    if (!treasury) return null;
    lines = receivable
      ? [line(treasury.id, "debit"), line(note.id, "credit")]
      : [line(note.id, "debit"), line(treasury.id, "credit")];
    what = receivable ? "Cheque collected" : "Cheque paid";
  } else {
    // Bounced (or cancelled): undo the note, the debt returns to the party.
    lines = receivable
      ? [line(party.id, "debit"), line(note.id, "credit")]
      : [line(note.id, "debit"), line(party.id, "credit")];
    what = "Cheque returned unpaid";
  }

  return {
    farmId: cheque.farmId,
    number,
    date: opts.date ?? cheque.dueDate,
    description: `${what} — ${cheque.chequeNumber}`,
    reference: cheque.chequeNumber,
    status: "posted",
    lines,
    sourceKind: "voucher",
    sourceId: cheque.id,
  };
}

/* -------------------------------- Invoices --------------------------------- */

/** Invoice number series: مبيعات INV-, مشتريات BILL-, and their returns. */
export function invoiceSeries(kind: InvoiceKind): string {
  return kind === "sale"
    ? "INV"
    : kind === "purchase"
      ? "BILL"
      : kind === "sale_return"
        ? "SRET"
        : "PRET";
}

export function invoiceDocNumber(kind: InvoiceKind, date: string, seq: number): string {
  return `${invoiceSeries(kind)}-${date.slice(0, 4)}-${String(seq).padStart(4, "0")}`;
}

/** The default account each document books its non-cash side against. */
function invoiceAccountKey(kind: InvoiceKind): string {
  return kind === "sale" || kind === "sale_return" ? "revenue_other" : "expense_other";
}

/**
 * An invoice → one balanced entry, booked on credit.
 *
 * A sale debits the customer and credits revenue; a purchase debits the cost
 * and credits the supplier. Returns post the exact mirror of their counterpart,
 * so a full return leaves both accounts back where they started. Payment is a
 * separate event (a voucher or a recorded payment), which is why nothing here
 * touches cash.
 */
export function journalEntryFromInvoice(
  invoice: Invoice,
  accounts: Account[],
  number: string,
  total: number,
): Omit<JournalEntry, "id"> | null {
  const kind = invoice.kind ?? "sale";
  const amount = round(Math.abs(total), 2);
  if (amount === 0) return null;

  const isSaleSide = kind === "sale" || kind === "sale_return";
  const party = findBySystemKey(accounts, isSaleSide ? "receivable" : "payable");
  const category =
    (invoice.accountId ? accounts.find((a) => a.id === invoice.accountId) : undefined) ??
    findBySystemKey(accounts, invoiceAccountKey(kind));
  if (!party || !category) return null;

  const line = (accountId: ID, side: "debit" | "credit"): JournalLine => ({
    accountId,
    debit: side === "debit" ? amount : 0,
    credit: side === "credit" ? amount : 0,
    partnerId: invoice.customerId,
  });

  let lines: JournalLine[];
  if (kind === "sale") lines = [line(party.id, "debit"), line(category.id, "credit")];
  else if (kind === "purchase") lines = [line(category.id, "debit"), line(party.id, "credit")];
  else if (kind === "sale_return") lines = [line(category.id, "debit"), line(party.id, "credit")];
  else lines = [line(party.id, "debit"), line(category.id, "credit")]; // purchase_return

  return {
    farmId: invoice.farmId,
    number,
    date: invoice.issuedAt,
    description: `${invoiceSeries(kind)} ${invoice.number}`,
    reference: invoice.number,
    status: "posted",
    lines,
    sourceKind: kind === "purchase" || kind === "purchase_return" ? "purchase" : "invoice",
    sourceId: invoice.id,
  };
}

/**
 * A payment against an invoice → money in, debt down.
 *
 * Revenue was already recognised when the invoice posted, so settling it must
 * NOT credit revenue again — it debits the treasury and clears the receivable
 * (or, on a purchase, debits the payable and credits the treasury). Getting
 * this wrong double-counts income, which is why it lives here beside the
 * invoice's own entry rather than being inferred from a transaction category.
 */
export function journalEntryFromInvoicePayment(
  invoice: Invoice,
  amount: number,
  date: string,
  paymentMethod: Transaction["paymentMethod"],
  accounts: Account[],
  number: string,
): Omit<JournalEntry, "id"> | null {
  const value = round(Math.abs(amount), 2);
  if (value === 0) return null;

  const kind = invoice.kind ?? "sale";
  const incoming = kind === "sale" || kind === "purchase_return";
  const party = findBySystemKey(accounts, incoming ? "receivable" : "payable");
  const treasury = findBySystemKey(accounts, paymentMethod === "bank" ? "bank" : "cash");
  if (!party || !treasury) return null;

  const line = (accountId: ID, side: "debit" | "credit"): JournalLine => ({
    accountId,
    debit: side === "debit" ? value : 0,
    credit: side === "credit" ? value : 0,
    partnerId: invoice.customerId,
  });

  const lines = incoming
    ? [line(treasury.id, "debit"), line(party.id, "credit")]
    : [line(party.id, "debit"), line(treasury.id, "credit")];

  return {
    farmId: invoice.farmId,
    number,
    date,
    description: `Payment · ${invoice.number}`,
    reference: invoice.number,
    status: "posted",
    lines,
    sourceKind: "voucher",
    sourceId: invoice.id,
  };
}

/**
 * Next sequence number for a document series.
 *
 * Counting existing documents is wrong twice over: reads are bounded, so past
 * the cap the count saturates and every new document collides on the same
 * number; and it ignores gaps left by a series that started mid-year. Taking
 * the highest suffix already issued survives both.
 *
 * It's still last-write-wins under true concurrency — two people saving in the
 * same second can collide. A counter document in a transaction is the complete
 * answer; this closes the systematic failure, not the racy one.
 */
export function nextSequence(existingNumbers: (string | undefined)[], prefix: string): number {
  let highest = 0;
  for (const number of existingNumbers) {
    if (!number || !number.startsWith(`${prefix}-`)) continue;
    const suffix = Number(number.slice(number.lastIndexOf("-") + 1));
    if (Number.isFinite(suffix) && suffix > highest) highest = suffix;
  }
  return highest + 1;
}

/**
 * Does settling this invoice bring money in or send it out?
 *
 * A sale and a purchase return are collected (money in); a purchase and a sale
 * return are paid (money out). The finance page reads this to book the cash-side
 * transaction on the right side — hardcoding "income" booked phantom income when
 * a supplier bill was paid.
 */
export function isIncomingInvoice(kind?: InvoiceKind): boolean {
  const k = kind ?? "sale";
  return k === "sale" || k === "purchase_return";
}
