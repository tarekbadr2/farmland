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
  PaymentMethod,
  Transaction,
  TxnCategory,
  TxnKind,
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
 * The account the cash side of a payment method hits. Cash and bank hit their
 * own accounts; a card settles through the bank (recorded distinctly on the
 * transaction, but there's no separate card account); credit sits in
 * receivables (income) or payables (expense) until it's settled.
 */
function accountKeyForMethod(method: PaymentMethod, kind: TxnKind): string {
  if (method === "bank" || method === "card") return "bank";
  if (method === "cash") return "cash";
  return kind === "income" ? "receivable" : "payable"; // credit
}

/**
 * Normalise a transaction's payment into slices that sum to its total.
 *
 * With no `payments` breakdown the single `paymentMethod` covers the whole
 * amount (the legacy one-line-per-side case). With a breakdown, its slices must
 * reconcile exactly to the total — otherwise the entry would be lopsided, so we
 * return null and let the caller flag the posting rather than book bad books.
 */
function paymentSlices(
  txn: Pick<Transaction, "payments" | "paymentMethod">,
  total: number,
): { method: PaymentMethod; amount: number }[] | null {
  const raw = (txn.payments ?? []).filter(
    (p) => p && Number.isFinite(p.amount) && p.amount > 0,
  );
  if (raw.length === 0) return [{ method: txn.paymentMethod, amount: total }];
  const slices = raw.map((p) => ({ method: p.method, amount: round(p.amount, 2) }));
  const sum = round(
    slices.reduce((s, p) => s + p.amount, 0),
    2,
  );
  return sum === total ? slices : null;
}

/**
 * One transaction → one balanced entry.
 *
 * Income debits where the money landed and credits the revenue account; an
 * expense debits the cost and credits where the money left. A split payment
 * (part cash/bank/card, part on credit) fans the cash side out into one line
 * per settlement account — cash, bank (card folds in here), and the partner's
 * receivable/payable for the credit slice. Returns null if the chart is missing
 * an account it needs, or the split doesn't reconcile, so a half-formed or
 * lopsided entry never posts.
 */
export function journalEntryFromTransaction(
  txn: Transaction,
  accounts: Account[],
  number: string,
): JournalEntry | null {
  const category = findBySystemKey(accounts, CATEGORY_ACCOUNT[txn.category]);
  if (!category) return null;

  const amount = round(Math.abs(txn.amount), 2);
  if (amount === 0) return null;

  const slices = paymentSlices(txn, amount);
  if (!slices) return null;

  // Fold slices that settle through the same account together (e.g. bank + card),
  // so a split books at most one line per distinct account.
  const byAccountKey = new Map<string, number>();
  for (const s of slices) {
    const key = accountKeyForMethod(s.method, txn.kind);
    byAccountKey.set(key, round((byAccountKey.get(key) ?? 0) + s.amount, 2));
  }

  const counters: { accountId: ID; amount: number }[] = [];
  for (const [key, amt] of byAccountKey) {
    if (amt <= 0) continue;
    const account = findBySystemKey(accounts, key);
    if (!account) return null; // chart missing an account it needs → don't half-post
    counters.push({ accountId: account.id, amount: amt });
  }
  if (counters.length === 0) return null;

  const line = (accountId: ID, debit: number, credit: number): JournalLine => ({
    accountId,
    debit,
    credit,
    partnerId: txn.counterpartyId,
    animalId: txn.animalId,
  });

  // Expense: debit the cost in full, credit each settlement account.
  // Income: credit the revenue in full, debit each settlement account.
  const categoryLine =
    txn.kind === "income" ? line(category.id, 0, amount) : line(category.id, amount, 0);
  const counterLines = counters.map((c) =>
    txn.kind === "income" ? line(c.accountId, c.amount, 0) : line(c.accountId, 0, c.amount),
  );
  const lines =
    txn.kind === "income" ? [...counterLines, categoryLine] : [categoryLine, ...counterLines];

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
  // Card settles through the bank, same as a transfer.
  const treasury = findBySystemKey(
    accounts,
    paymentMethod === "bank" || paymentMethod === "card" ? "bank" : "cash",
  );
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
export function nextSequence(
  existingNumbers: (string | undefined)[],
  prefix: string,
  year?: string,
): number {
  // Numbers are PREFIX-YEAR-SEQ. Scoping to the year makes each year restart at
  // 1 (INV-2026-0001), instead of the first 2026 invoice inheriting 2025's count.
  const scope = year ? `${prefix}-${year}-` : `${prefix}-`;
  let highest = 0;
  for (const number of existingNumbers) {
    if (!number || !number.startsWith(scope)) continue;
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
