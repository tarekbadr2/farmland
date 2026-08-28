import { describe, it, expect } from "vitest";

import { journalEntryFromTransaction } from "./posting";
import { normalBalance } from "./accounting";
import type { Account, Transaction } from "@/core/domain/types";

/**
 * `journalEntryFromTransaction` maps a money row to a balanced journal entry.
 * These pin the split-payment behaviour: a purchase paid part cash / part card /
 * part on credit fans the cash side into one line per settlement account (card
 * folding into the bank), with the credit slice landing in payables tagged to
 * the supplier — and the whole entry always balancing.
 */

const acct = (id: string, systemKey: string, type: Account["type"]): Account => ({
  id,
  farmId: "f1",
  code: id,
  parentId: null,
  name: systemKey,
  nameAr: systemKey,
  type,
  nature: normalBalance(type),
  isGroup: false,
  active: true,
  systemKey,
});

const ACCOUNTS: Account[] = [
  acct("cash", "cash", "asset"),
  acct("bank", "bank", "asset"),
  acct("ar", "receivable", "asset"),
  acct("ap", "payable", "liability"),
  acct("feed", "expense_feed", "expense"),
  acct("milk", "revenue_milk", "revenue"),
];

const txn = (over: Partial<Transaction>): Transaction =>
  ({
    id: "t1",
    farmId: "f1",
    date: "2026-06-01",
    kind: "expense",
    category: "feed",
    amount: 1000,
    description: "Bran — 2 t",
    paymentMethod: "cash",
    ...over,
  }) as Transaction;

const sum = (ns: number[]) => Math.round(ns.reduce((s, n) => s + n, 0) * 100) / 100;
const debits = (e: { lines: { debit: number }[] }) => sum(e.lines.map((l) => l.debit));
const credits = (e: { lines: { credit: number }[] }) => sum(e.lines.map((l) => l.credit));
const lineFor = (e: { lines: { accountId: string }[] }, id: string) =>
  e.lines.filter((l) => l.accountId === id);

describe("journalEntryFromTransaction — legacy single method", () => {
  it("books a cash expense as Dr cost, Cr cash", () => {
    const e = journalEntryFromTransaction(txn({ paymentMethod: "cash" }), ACCOUNTS, "JV-1")!;
    expect(e.lines).toHaveLength(2);
    expect(lineFor(e, "feed")[0]).toMatchObject({ debit: 1000, credit: 0 });
    expect(lineFor(e, "cash")[0]).toMatchObject({ debit: 0, credit: 1000 });
    expect(debits(e)).toBe(credits(e));
  });

  it("books a credit expense to payables, tagged to the supplier", () => {
    const e = journalEntryFromTransaction(
      txn({ paymentMethod: "credit", counterpartyId: "sup1" }),
      ACCOUNTS,
      "JV-1",
    )!;
    expect(lineFor(e, "ap")[0]).toMatchObject({ credit: 1000, partnerId: "sup1" });
    expect(debits(e)).toBe(credits(e));
  });

  it("settles a card payment through the bank account", () => {
    const e = journalEntryFromTransaction(txn({ paymentMethod: "card" }), ACCOUNTS, "JV-1")!;
    expect(lineFor(e, "bank")[0]).toMatchObject({ credit: 1000 });
    expect(lineFor(e, "cash")).toHaveLength(0);
  });
});

describe("journalEntryFromTransaction — split payment", () => {
  it("fans a cash + card + credit split into one line per account", () => {
    const e = journalEntryFromTransaction(
      txn({
        counterpartyId: "sup1",
        payments: [
          { method: "cash", amount: 600 },
          { method: "card", amount: 300 },
          { method: "credit", amount: 100 },
        ],
      }),
      ACCOUNTS,
      "JV-1",
    )!;
    expect(lineFor(e, "feed")[0]).toMatchObject({ debit: 1000, credit: 0 });
    expect(lineFor(e, "cash")[0]).toMatchObject({ credit: 600 });
    expect(lineFor(e, "bank")[0]).toMatchObject({ credit: 300 }); // card settles through bank
    expect(lineFor(e, "ap")[0]).toMatchObject({ credit: 100, partnerId: "sup1" });
    expect(debits(e)).toBe(1000);
    expect(credits(e)).toBe(1000);
  });

  it("folds bank + card slices into a single bank line", () => {
    const e = journalEntryFromTransaction(
      txn({
        payments: [
          { method: "cash", amount: 500 },
          { method: "bank", amount: 400 },
          { method: "card", amount: 100 },
        ],
      }),
      ACCOUNTS,
      "JV-1",
    )!;
    expect(lineFor(e, "bank")).toHaveLength(1);
    expect(lineFor(e, "bank")[0]).toMatchObject({ credit: 500 }); // 400 + 100
    expect(debits(e)).toBe(credits(e));
  });

  it("refuses a split that doesn't reconcile to the total", () => {
    const e = journalEntryFromTransaction(
      txn({
        payments: [
          { method: "cash", amount: 600 },
          { method: "credit", amount: 300 },
        ], // sums to 900, not 1000
      }),
      ACCOUNTS,
      "JV-1",
    );
    expect(e).toBeNull();
  });

  it("splits an income sale: Dr cash + Dr receivable, Cr revenue", () => {
    const e = journalEntryFromTransaction(
      txn({
        kind: "income",
        category: "milk_sales",
        amount: 1000,
        counterpartyId: "cust1",
        payments: [
          { method: "cash", amount: 700 },
          { method: "credit", amount: 300 },
        ],
      }),
      ACCOUNTS,
      "JV-1",
    )!;
    expect(lineFor(e, "cash")[0]).toMatchObject({ debit: 700 });
    expect(lineFor(e, "ar")[0]).toMatchObject({ debit: 300, partnerId: "cust1" });
    expect(lineFor(e, "milk")[0]).toMatchObject({ credit: 1000 });
    expect(debits(e)).toBe(credits(e));
  });

  it("returns null when a needed account is missing from the chart", () => {
    const noPayable = ACCOUNTS.filter((a) => a.systemKey !== "payable");
    const e = journalEntryFromTransaction(
      txn({
        payments: [
          { method: "cash", amount: 600 },
          { method: "credit", amount: 400 },
        ],
      }),
      noPayable,
      "JV-1",
    );
    expect(e).toBeNull();
  });
});
