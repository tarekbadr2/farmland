import { describe, it, expect } from "vitest";

import { DemoFarmRepository } from "./demo-repository";
import { trialBalance } from "@/core/services/accounting";
import { TODAY } from "@/core/data/seed";

/**
 * Integration cover for the document → ledger wiring.
 *
 * The pure posting functions are tested in accounting.test.ts; what these
 * exercise is that the repository actually calls them, writes the entry, and
 * leaves the books balanced. That's the seam where a purchase bill could
 * silently fail to reach the ledger.
 *
 * getDataset() is a module-level singleton, so every repository instance shares
 * one dataset — each test therefore reads balances as deltas rather than
 * assuming it starts from zero.
 */
const repo = new DemoFarmRepository();

async function balanceOf(systemKey: string): Promise<number> {
  const accounts = await repo.getAccounts();
  const entries = await repo.getJournalEntries();
  const account = accounts.find((a) => a.systemKey === systemKey)!;
  const { rows } = trialBalance(accounts, entries, { includeZero: true });
  const row = rows.find((r) => r.account.id === account.id);
  return row ? row.debit - row.credit : 0;
}

async function booksBalance(): Promise<boolean> {
  const [accounts, entries] = await Promise.all([repo.getAccounts(), repo.getJournalEntries()]);
  return trialBalance(accounts, entries).balanced;
}

describe("demo repository — documents reach the ledger", () => {
  it("starts from balanced books", async () => {
    expect(await booksBalance()).toBe(true);
  });

  it("a purchase bill debits the cost and credits the supplier", async () => {
    const beforeExpense = await balanceOf("expense_other");
    const beforePayable = await balanceOf("payable");

    await repo.saveInvoice({
      kind: "purchase",
      number: "TEST-BILL-1",
      customerId: "partner_x",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: [{ description: "Bran", qty: 10, unitPrice: 500 }],
      paidAmount: 0,
      status: "sent",
    });

    // 10 × 500 = 5,000 of cost, owed to the supplier.
    expect((await balanceOf("expense_other")) - beforeExpense).toBe(5_000);
    expect((await balanceOf("payable")) - beforePayable).toBe(-5_000); // credit side
    expect(await booksBalance()).toBe(true);
  });

  it("a draft stays out of the books until it's issued", async () => {
    const before = await balanceOf("expense_other");
    await repo.saveInvoice({
      kind: "purchase",
      number: "TEST-DRAFT-1",
      customerId: "partner_x",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: [{ description: "Ghost", qty: 1, unitPrice: 9_999 }],
      paidAmount: 0,
      status: "draft",
    });
    expect(await balanceOf("expense_other")).toBe(before);
  });

  it("paying a bill clears the payable and takes money out — cost unchanged", async () => {
    const bill = await repo.saveInvoice({
      kind: "purchase",
      number: "TEST-BILL-2",
      customerId: "partner_x",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: [{ description: "Maize", qty: 1, unitPrice: 3_000 }],
      paidAmount: 0,
      status: "sent",
    });

    const expenseAfterBill = await balanceOf("expense_other");
    const payableAfterBill = await balanceOf("payable");
    const cashAfterBill = await balanceOf("cash");

    await repo.recordInvoicePayment({
      invoiceId: bill.id,
      amount: 3_000,
      date: TODAY,
      paymentMethod: "cash",
    });

    // The debt goes down, cash goes out, and the cost is NOT counted twice.
    expect((await balanceOf("payable")) - payableAfterBill).toBe(3_000);
    expect((await balanceOf("cash")) - cashAfterBill).toBe(-3_000);
    expect(await balanceOf("expense_other")).toBe(expenseAfterBill);
    expect(await booksBalance()).toBe(true);
  });

  it("a purchase return backs the bill out again", async () => {
    const beforeExpense = await balanceOf("expense_other");
    const beforePayable = await balanceOf("payable");

    const line = [{ description: "Spoiled bran", qty: 4, unitPrice: 500 }];
    await repo.saveInvoice({
      kind: "purchase",
      number: "TEST-BILL-3",
      customerId: "partner_x",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: line,
      paidAmount: 0,
      status: "sent",
    });
    await repo.saveInvoice({
      kind: "purchase_return",
      number: "TEST-PRET-1",
      customerId: "partner_x",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: line,
      paidAmount: 0,
      status: "sent",
    });

    expect(await balanceOf("expense_other")).toBe(beforeExpense);
    expect(await balanceOf("payable")).toBe(beforePayable);
    expect(await booksBalance()).toBe(true);
  });

  it("a recorded cost lands in the ledger and keeps it balanced", async () => {
    const before = await balanceOf("expense_maintenance");
    await repo.recordCost({
      category: "maintenance",
      amount: 1_200,
      date: TODAY,
      description: "Tractor service",
      paymentMethod: "cash",
    });
    expect((await balanceOf("expense_maintenance")) - before).toBe(1_200);
    expect(await booksBalance()).toBe(true);
  });

  it("a cheque moves the debt into notes and keeps the books balanced", async () => {
    const beforeNotes = await balanceOf("notes_receivable");
    const cheque = await repo.saveCheque({
      kind: "receivable",
      chequeNumber: "TEST-9001",
      amount: 7_500,
      issuedDate: TODAY,
      dueDate: TODAY,
      partnerId: "partner_x",
      status: "held",
    });
    expect((await balanceOf("notes_receivable")) - beforeNotes).toBe(7_500);
    expect(await booksBalance()).toBe(true);

    // Collecting turns the note into cash.
    const cashBefore = await balanceOf("cash");
    const accounts = await repo.getAccounts();
    const cashAccount = accounts.find((a) => a.systemKey === "cash")!;
    await repo.setChequeStatus(cheque.id, "collected", { treasuryAccountId: cashAccount.id });

    expect((await balanceOf("cash")) - cashBefore).toBe(7_500);
    expect(await balanceOf("notes_receivable")).toBe(beforeNotes);
    expect(await booksBalance()).toBe(true);
  });
});
