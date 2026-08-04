import { describe, it, expect } from "vitest";

import {
  normalBalance,
  entryTotals,
  isBalanced,
  isValidLine,
  accountBalances,
  buildAccountTree,
  flattenTree,
  nextChildCode,
  trialBalance,
  incomeStatement,
  balanceSheet,
  accountLedger,
  partnerBalances,
  partnerStatement,
} from "./accounting";
import {
  chequeNumber,
  invoiceDocNumber,
  journalEntryFromCheque,
  journalEntryFromInvoice,
  journalEntryFromInvoicePayment,
  isIncomingInvoice,
  journalEntryFromVoucher,
  nextSequence,
  reverseEntry,
  voucherNumber,
} from "./posting";
import type { Account, Cheque, Invoice, JournalEntry } from "@/core/domain/types";

/* A small but realistic farm chart of accounts. */
const acc = (
  id: string,
  code: string,
  name: string,
  type: Account["type"],
  isGroup = false,
  parentId?: string,
  openingBalance?: number,
): Account => ({
  id,
  farmId: "f1",
  code,
  parentId: parentId ?? null,
  name,
  nameAr: name,
  type,
  nature: normalBalance(type),
  isGroup,
  openingBalance,
  active: true,
});

const ACCOUNTS: Account[] = [
  acc("a1", "1", "Assets", "asset", true),
  acc("a101", "101", "Cash", "asset", false, "a1"),
  acc("a102", "102", "Accounts receivable", "asset", false, "a1"),
  acc("a2", "2", "Liabilities", "liability", true),
  acc("a201", "201", "Accounts payable", "liability", false, "a2"),
  acc("a3", "3", "Equity", "equity", true),
  acc("a301", "301", "Capital", "equity", false, "a3"),
  acc("a4", "4", "Revenue", "revenue", true),
  acc("a401", "401", "Milk sales", "revenue", false, "a4"),
  acc("a5", "5", "Expenses", "expense", true),
  acc("a501", "501", "Feed", "expense", false, "a5"),
];

const entry = (
  id: string,
  number: string,
  date: string,
  lines: { accountId: string; debit?: number; credit?: number }[],
  status: JournalEntry["status"] = "posted",
): JournalEntry => ({
  id,
  farmId: "f1",
  number,
  date,
  description: number,
  status,
  lines: lines.map((l) => ({ accountId: l.accountId, debit: l.debit ?? 0, credit: l.credit ?? 0 })),
});

const ENTRIES: JournalEntry[] = [
  // Owner puts EGP 100,000 in.
  entry("j1", "JV-0001", "2026-01-01", [
    { accountId: "a101", debit: 100_000 },
    { accountId: "a301", credit: 100_000 },
  ]),
  // Milk sold for cash.
  entry("j2", "JV-0002", "2026-01-05", [
    { accountId: "a101", debit: 5_000 },
    { accountId: "a401", credit: 5_000 },
  ]),
  // Feed bought on credit.
  entry("j3", "JV-0003", "2026-01-07", [
    { accountId: "a501", debit: 2_000 },
    { accountId: "a201", credit: 2_000 },
  ]),
  // A draft must never touch the books.
  entry("j4", "JV-0004", "2026-01-08", [
    { accountId: "a101", debit: 999_999 },
    { accountId: "a401", credit: 999_999 },
  ], "draft"),
];

describe("normalBalance", () => {
  it("puts assets/expenses on debit and the rest on credit", () => {
    expect(normalBalance("asset")).toBe("debit");
    expect(normalBalance("expense")).toBe("debit");
    expect(normalBalance("liability")).toBe("credit");
    expect(normalBalance("equity")).toBe("credit");
    expect(normalBalance("revenue")).toBe("credit");
  });
});

describe("entry validity", () => {
  it("balances only when debits equal credits and something was entered", () => {
    expect(isBalanced([{ accountId: "a", debit: 10, credit: 0 }, { accountId: "b", debit: 0, credit: 10 }])).toBe(true);
    expect(isBalanced([{ accountId: "a", debit: 10, credit: 0 }, { accountId: "b", debit: 0, credit: 9 }])).toBe(false);
    // An all-zero entry is not a valid entry.
    expect(isBalanced([{ accountId: "a", debit: 0, credit: 0 }])).toBe(false);
  });

  it("reports the difference so the UI can show what's off", () => {
    const t = entryTotals([
      { accountId: "a", debit: 100, credit: 0 },
      { accountId: "b", debit: 0, credit: 60 },
    ]);
    expect(t).toMatchObject({ debit: 100, credit: 60, difference: 40, balanced: false });
  });

  it("rejects lines that sit on both sides or neither", () => {
    expect(isValidLine({ accountId: "a", debit: 5, credit: 0 })).toBe(true);
    expect(isValidLine({ accountId: "a", debit: 0, credit: 5 })).toBe(true);
    expect(isValidLine({ accountId: "a", debit: 5, credit: 5 })).toBe(false);
    expect(isValidLine({ accountId: "a", debit: 0, credit: 0 })).toBe(false);
    expect(isValidLine({ accountId: "a", debit: -5, credit: 0 })).toBe(false);
  });
});

describe("accountBalances", () => {
  const balances = accountBalances(ACCOUNTS, ENTRIES);

  it("nets each account on its own natural side", () => {
    expect(balances.get("a101")!.balance).toBe(105_000); // cash: debit-nature
    expect(balances.get("a301")!.balance).toBe(100_000); // capital: credit-nature
    expect(balances.get("a401")!.balance).toBe(5_000);
    expect(balances.get("a501")!.balance).toBe(2_000);
    expect(balances.get("a201")!.balance).toBe(2_000);
  });

  it("ignores draft and voided entries", () => {
    // j4 (draft) would have added 999,999 to cash.
    expect(balances.get("a101")!.debit).toBe(105_000);
  });

  it("seeds opening balances on the right side, including negatives", () => {
    const withOpening = [
      acc("o1", "601", "Cash b/f", "asset", false, undefined, 500),
      acc("o2", "602", "Overdrawn", "asset", false, undefined, -300),
    ];
    const b = accountBalances(withOpening, []);
    expect(b.get("o1")).toMatchObject({ debit: 500, credit: 0, balance: 500 });
    // A negative opening on a debit-nature account lands as a credit.
    expect(b.get("o2")).toMatchObject({ debit: 0, credit: 300, balance: -300 });
  });

  it("honours an as-of date", () => {
    const b = accountBalances(ACCOUNTS, ENTRIES, { upTo: "2026-01-05" });
    expect(b.get("a101")!.balance).toBe(105_000);
    expect(b.get("a501")!.balance).toBe(0); // feed posted 01-07, after the cutoff
  });
});

describe("buildAccountTree", () => {
  const tree = buildAccountTree(ACCOUNTS, accountBalances(ACCOUNTS, ENTRIES));

  it("nests children under their parent and sorts by code", () => {
    expect(tree.map((n) => n.code)).toEqual(["1", "2", "3", "4", "5"]);
    const assets = tree.find((n) => n.code === "1")!;
    expect(assets.children.map((c) => c.code)).toEqual(["101", "102"]);
    expect(assets.depth).toBe(0);
    expect(assets.children[0].depth).toBe(1);
  });

  it("rolls descendant totals up into group accounts", () => {
    const assets = tree.find((n) => n.code === "1")!;
    expect(assets.debit).toBe(105_000); // cash 105,000 + AR 0
    expect(assets.balance).toBe(105_000);
  });

  it("flattens depth-first for table rendering", () => {
    expect(flattenTree(tree).map((n) => n.code)).toEqual([
      "1", "101", "102", "2", "201", "3", "301", "4", "401", "5", "501",
    ]);
  });
});

describe("nextChildCode", () => {
  it("continues the sibling width", () => {
    expect(nextChildCode("102", ["10201", "10202"])).toBe("10203");
    expect(nextChildCode("1011", ["10111", "10112"])).toBe("10113");
  });

  it("defaults to 2-digit segments for a first child", () => {
    expect(nextChildCode("1", [])).toBe("101");
  });

  it("fills gaps left by deleted accounts", () => {
    expect(nextChildCode("102", ["10201", "10203"])).toBe("10202");
  });
});

describe("trialBalance", () => {
  const tb = trialBalance(ACCOUNTS, ENTRIES);

  it("balances and excludes group headers", () => {
    expect(tb.totalDebit).toBe(107_000); // cash 105,000 + feed 2,000
    expect(tb.totalCredit).toBe(107_000); // capital 100,000 + milk 5,000 + AP 2,000
    expect(tb.balanced).toBe(true);
    expect(tb.rows.every((r) => !r.account.isGroup)).toBe(true);
  });

  it("puts each account's net on one side only", () => {
    const cash = tb.rows.find((r) => r.account.id === "a101")!;
    expect(cash).toMatchObject({ debit: 105_000, credit: 0 });
    const ap = tb.rows.find((r) => r.account.id === "a201")!;
    expect(ap).toMatchObject({ debit: 0, credit: 2_000 });
  });

  it("hides untouched accounts unless asked", () => {
    expect(tb.rows.find((r) => r.account.id === "a102")).toBeUndefined();
    expect(
      trialBalance(ACCOUNTS, ENTRIES, { includeZero: true }).rows.find((r) => r.account.id === "a102"),
    ).toBeDefined();
  });
});

describe("incomeStatement", () => {
  it("nets revenue against expenses", () => {
    const pl = incomeStatement(ACCOUNTS, ENTRIES);
    expect(pl.totalRevenue).toBe(5_000);
    expect(pl.totalExpenses).toBe(2_000);
    expect(pl.netIncome).toBe(3_000);
  });
});

describe("balanceSheet", () => {
  it("balances once the period result is folded into equity", () => {
    const bs = balanceSheet(ACCOUNTS, ENTRIES);
    expect(bs.totalAssets).toBe(105_000);
    expect(bs.totalLiabilities).toBe(2_000);
    expect(bs.totalEquity).toBe(100_000);
    expect(bs.netIncome).toBe(3_000);
    // 105,000 === 2,000 + 100,000 + 3,000
    expect(bs.balanced).toBe(true);
  });
});

describe("period-aware statements", () => {
  const withFeb: JournalEntry[] = [
    ...ENTRIES,
    entry("j5", "JV-0005", "2026-02-10", [
      { accountId: "a101", debit: 8_000 },
      { accountId: "a401", credit: 8_000 },
    ]),
    entry("j6", "JV-0006", "2026-02-12", [
      { accountId: "a501", debit: 3_000 },
      { accountId: "a201", credit: 3_000 },
    ]),
  ];

  it("the income statement counts only flows inside the window", () => {
    const jan = incomeStatement(ACCOUNTS, withFeb, { from: "2026-01-01", upTo: "2026-01-31" });
    expect(jan.totalRevenue).toBe(5_000);
    expect(jan.totalExpenses).toBe(2_000);
    expect(jan.netIncome).toBe(3_000);

    const feb = incomeStatement(ACCOUNTS, withFeb, { from: "2026-02-01", upTo: "2026-02-28" });
    expect(feb.totalRevenue).toBe(8_000);
    expect(feb.totalExpenses).toBe(3_000);
    expect(feb.netIncome).toBe(5_000);
  });

  it("all-time income equals the sum of the periods", () => {
    const all = incomeStatement(ACCOUNTS, withFeb);
    expect(all.totalRevenue).toBe(13_000);
    expect(all.netIncome).toBe(8_000);
  });

  it("the balance sheet is a cumulative snapshot and balances as of any date", () => {
    const janEnd = balanceSheet(ACCOUNTS, withFeb, { upTo: "2026-01-31" });
    expect(janEnd.balanced).toBe(true);
    expect(janEnd.netIncome).toBe(3_000); // retained through Jan

    const febEnd = balanceSheet(ACCOUNTS, withFeb, { upTo: "2026-02-28" });
    expect(febEnd.balanced).toBe(true);
    expect(febEnd.netIncome).toBe(8_000); // retained through Feb
    expect(febEnd.totalAssets).toBe(113_000);
  });
});

describe("accountLedger", () => {
  it("walks one account in date order with a running balance", () => {
    const cash = ACCOUNTS.find((a) => a.id === "a101")!;
    const { rows, closing } = accountLedger(cash, ENTRIES);
    expect(rows.map((r) => r.running)).toEqual([100_000, 105_000]);
    expect(closing).toBe(105_000);
  });

  it("counts a credit against a debit-nature account", () => {
    const cash = ACCOUNTS.find((a) => a.id === "a101")!;
    const withPayment = [
      ...ENTRIES,
      entry("j5", "JV-0005", "2026-01-09", [
        { accountId: "a201", debit: 2_000 },
        { accountId: "a101", credit: 2_000 },
      ]),
    ];
    expect(accountLedger(cash, withPayment).closing).toBe(103_000);
  });
});

describe("vouchers", () => {
  const base = {
    date: "2026-02-01",
    amount: 5_000,
    treasuryAccountId: "a101", // cash
    counterAccountId: "a401", // milk sales
    description: "Milk sold for cash",
  };

  it("numbers receipts and payments in separate series", () => {
    expect(voucherNumber("receipt", "2026-02-01", 7)).toBe("RV-2026-0007");
    expect(voucherNumber("payment", "2026-02-01", 7)).toBe("PV-2026-0007");
  });

  it("a receipt debits the treasury and credits what it was for", () => {
    const e = journalEntryFromVoucher({ ...base, kind: "receipt" }, "f1", "RV-2026-0001")!;
    expect(e.lines[0]).toMatchObject({ accountId: "a101", debit: 5_000, credit: 0 });
    expect(e.lines[1]).toMatchObject({ accountId: "a401", debit: 0, credit: 5_000 });
    expect(isBalanced(e.lines)).toBe(true);
    expect(e.status).toBe("posted");
  });

  it("a payment credits the treasury instead", () => {
    const e = journalEntryFromVoucher(
      { ...base, kind: "payment", counterAccountId: "a501" },
      "f1",
      "PV-2026-0001",
    )!;
    expect(e.lines[0]).toMatchObject({ accountId: "a101", debit: 0, credit: 5_000 });
    expect(e.lines[1]).toMatchObject({ accountId: "a501", debit: 5_000, credit: 0 });
    expect(isBalanced(e.lines)).toBe(true);
  });

  it("refuses a zero amount or a self-transfer", () => {
    expect(journalEntryFromVoucher({ ...base, kind: "receipt", amount: 0 }, "f1", "RV-1")).toBeNull();
    expect(
      journalEntryFromVoucher(
        { ...base, kind: "receipt", counterAccountId: "a101" },
        "f1",
        "RV-1",
      ),
    ).toBeNull();
  });

  it("a posted voucher lands in the trial balance and keeps it balanced", () => {
    const e = journalEntryFromVoucher({ ...base, kind: "receipt" }, "f1", "RV-2026-0001")!;
    const tb = trialBalance(ACCOUNTS, [...ENTRIES, { ...e, id: "v1" }]);
    expect(tb.balanced).toBe(true);
    // Cash rose from 105,000 to 110,000.
    expect(tb.rows.find((r) => r.account.id === "a101")!.debit).toBe(110_000);
  });
});

describe("partner balances (AR/AP)", () => {
  // Give the fixture real AR/AP accounts to key off.
  const withKeys: Account[] = ACCOUNTS.map((a) =>
    a.id === "a102" ? { ...a, systemKey: "receivable" } : a.id === "a201" ? { ...a, systemKey: "payable" } : a,
  );

  const partnerEntries: JournalEntry[] = [
    // Sold milk to P1 on credit — they owe 8,000.
    entry("p1", "JV-1001", "2026-03-01", [
      { accountId: "a102", debit: 8_000 },
      { accountId: "a401", credit: 8_000 },
    ]),
    // P1 pays 3,000.
    entry("p2", "JV-1002", "2026-03-05", [
      { accountId: "a101", debit: 3_000 },
      { accountId: "a102", credit: 3_000 },
    ]),
    // Bought feed from P2 on credit — the farm owes 2,500.
    entry("p3", "JV-1003", "2026-03-06", [
      { accountId: "a501", debit: 2_500 },
      { accountId: "a201", credit: 2_500 },
    ]),
  ].map((e) => ({
    ...e,
    lines: e.lines.map((l) => ({
      ...l,
      partnerId: e.id === "p3" ? "supplier_2" : "customer_1",
    })),
  }));

  it("nets what each party owes, positive when they owe the farm", () => {
    const b = partnerBalances(withKeys, partnerEntries);
    expect(b.get("customer_1")).toMatchObject({ debit: 8_000, credit: 3_000, balance: 5_000 });
    // A supplier the farm owes shows negative.
    expect(b.get("supplier_2")!.balance).toBe(-2_500);
  });

  it("ignores revenue/expense lines even when they carry a partner", () => {
    // The milk-sales credit is tagged with customer_1 but must not count.
    expect(partnerBalances(withKeys, partnerEntries).get("customer_1")!.credit).toBe(3_000);
  });

  it("builds a statement with a running balance", () => {
    const { rows, closing } = partnerStatement("customer_1", withKeys, partnerEntries);
    expect(rows.map((r) => r.running)).toEqual([8_000, 5_000]);
    expect(closing).toBe(5_000);
  });
});

describe("reverseEntry", () => {
  const original = entry("j9", "JV-0009", "2026-04-01", [
    { accountId: "a501", debit: 2_000 },
    { accountId: "a201", credit: 2_000 },
  ]);

  it("swaps every side and stays balanced", () => {
    const r = reverseEntry(original, "JV-0010");
    expect(r.lines[0]).toMatchObject({ accountId: "a501", debit: 0, credit: 2_000 });
    expect(r.lines[1]).toMatchObject({ accountId: "a201", debit: 2_000, credit: 0 });
    expect(isBalanced(r.lines)).toBe(true);
    expect(r.reference).toBe("JV-0009");
    expect(r.status).toBe("posted");
  });

  it("nets the original to zero in the books", () => {
    const r = { ...reverseEntry(original, "JV-0010"), id: "j10" };
    const balances = accountBalances(ACCOUNTS, [original, r]);
    expect(balances.get("a501")!.balance).toBe(0);
    expect(balances.get("a201")!.balance).toBe(0);
  });

  it("keeps the trial balance balanced after a reversal", () => {
    const r = { ...reverseEntry(original, "JV-0010"), id: "j10" };
    expect(trialBalance(ACCOUNTS, [...ENTRIES, original, r]).balanced).toBe(true);
  });

  it("can be back-dated to the correction date", () => {
    const r = reverseEntry(original, "JV-0010", { date: "2026-04-15" });
    expect(r.date).toBe("2026-04-15");
  });
});

describe("cheques (أوراق قبض / دفع)", () => {
  // The lifecycle needs the four system accounts to key off.
  const chequeAccounts: Account[] = [
    { ...acc("c101", "1101", "Cash", "asset"), systemKey: "cash" },
    { ...acc("c102", "1102", "Bank", "asset"), systemKey: "bank" },
    { ...acc("c103", "1103", "Customers", "asset"), systemKey: "receivable" },
    { ...acc("c104", "1104", "Notes receivable", "asset"), systemKey: "notes_receivable" },
    { ...acc("c201", "2101", "Suppliers", "liability"), systemKey: "payable" },
    { ...acc("c202", "2102", "Notes payable", "liability"), systemKey: "notes_payable" },
  ];

  const incoming: Cheque = {
    id: "chq1",
    farmId: "f1",
    kind: "receivable",
    chequeNumber: "0012345",
    amount: 10_000,
    issuedDate: "2026-05-01",
    dueDate: "2026-06-01",
    partnerId: "customer_1",
    status: "held",
  };

  it("numbers receivable and payable cheques separately", () => {
    expect(chequeNumber("receivable", "2026-05-01", 3)).toBe("CR-2026-0003");
    expect(chequeNumber("payable", "2026-05-01", 3)).toBe("CP-2026-0003");
  });

  it("taking a cheque moves the debt out of receivables into notes", () => {
    const e = journalEntryFromCheque(incoming, "received", chequeAccounts, "CR-2026-0001")!;
    expect(e.lines[0]).toMatchObject({ accountId: "c104", debit: 10_000 }); // notes receivable up
    expect(e.lines[1]).toMatchObject({ accountId: "c103", credit: 10_000 }); // customer cleared
    expect(isBalanced(e.lines)).toBe(true);
  });

  it("collecting it turns the note into money in the chosen treasury", () => {
    const e = journalEntryFromCheque(incoming, "settled", chequeAccounts, "CR-2026-0002", {
      treasuryAccountId: "c101",
    })!;
    expect(e.lines[0]).toMatchObject({ accountId: "c101", debit: 10_000 });
    expect(e.lines[1]).toMatchObject({ accountId: "c104", credit: 10_000 });
  });

  it("a bounced cheque puts the debt back on the customer", () => {
    const e = journalEntryFromCheque(incoming, "bounced", chequeAccounts, "CR-2026-0003")!;
    expect(e.lines[0]).toMatchObject({ accountId: "c103", debit: 10_000 });
    expect(e.lines[1]).toMatchObject({ accountId: "c104", credit: 10_000 });
  });

  it("received-then-bounced leaves every account exactly where it started", () => {
    const a = { ...journalEntryFromCheque(incoming, "received", chequeAccounts, "CR-1")!, id: "e1" };
    const b = { ...journalEntryFromCheque(incoming, "bounced", chequeAccounts, "CR-2")!, id: "e2" };
    const balances = accountBalances(chequeAccounts, [a, b]);
    expect(balances.get("c104")!.balance).toBe(0); // the note is gone
    expect(balances.get("c103")!.balance).toBe(0); // the debt is back, netting the original
  });

  it("received-then-collected leaves the money in the bank and no note", () => {
    const a = { ...journalEntryFromCheque(incoming, "received", chequeAccounts, "CR-1")!, id: "e1" };
    const b = {
      ...journalEntryFromCheque(incoming, "settled", chequeAccounts, "CR-2", { treasuryAccountId: "c102" })!,
      id: "e2",
    };
    const balances = accountBalances(chequeAccounts, [a, b]);
    expect(balances.get("c102")!.balance).toBe(10_000); // bank up
    expect(balances.get("c104")!.balance).toBe(0); // note settled
    expect(balances.get("c103")!.balance).toBe(-10_000); // the original invoice cleared
  });

  it("mirrors the whole flow for a cheque the farm writes out", () => {
    const outgoing: Cheque = { ...incoming, id: "chq2", kind: "payable", partnerId: "supplier_1" };
    const issued = journalEntryFromCheque(outgoing, "received", chequeAccounts, "CP-1")!;
    expect(issued.lines[0]).toMatchObject({ accountId: "c201", debit: 10_000 }); // supplier cleared
    expect(issued.lines[1]).toMatchObject({ accountId: "c202", credit: 10_000 }); // note payable up

    const paid = journalEntryFromCheque(outgoing, "settled", chequeAccounts, "CP-2", {
      treasuryAccountId: "c102",
    })!;
    expect(paid.lines[0]).toMatchObject({ accountId: "c202", debit: 10_000 });
    expect(paid.lines[1]).toMatchObject({ accountId: "c102", credit: 10_000 }); // bank down
  });

  it("refuses to post when the chart is missing the note accounts", () => {
    const bare = [acc("x", "1", "Assets", "asset", true)];
    expect(journalEntryFromCheque(incoming, "received", bare, "CR-1")).toBeNull();
  });
});

describe("invoices & returns (مشتريات / مرتجعات)", () => {
  const invAccounts: Account[] = [
    { ...acc("i103", "1103", "Customers", "asset"), systemKey: "receivable" },
    { ...acc("i201", "2101", "Suppliers", "liability"), systemKey: "payable" },
    { ...acc("i401", "4105", "Other income", "revenue"), systemKey: "revenue_other" },
    { ...acc("i501", "5110", "Other expenses", "expense"), systemKey: "expense_other" },
  ];

  const doc = (kind: Invoice["kind"], id = "inv1"): Invoice => ({
    id,
    farmId: "f1",
    number: "A-1",
    kind,
    customerId: "party_1",
    issuedAt: "2026-07-01",
    dueAt: "2026-07-31",
    lines: [{ description: "Bran", qty: 10, unitPrice: 500 }],
    paidAmount: 0,
    status: "sent",
  });

  it("numbers each document type in its own series", () => {
    expect(invoiceDocNumber("sale", "2026-07-01", 2)).toBe("INV-2026-0002");
    expect(invoiceDocNumber("purchase", "2026-07-01", 2)).toBe("BILL-2026-0002");
    expect(invoiceDocNumber("sale_return", "2026-07-01", 2)).toBe("SRET-2026-0002");
    expect(invoiceDocNumber("purchase_return", "2026-07-01", 2)).toBe("PRET-2026-0002");
  });

  it("a sale debits the customer and credits revenue", () => {
    const e = journalEntryFromInvoice(doc("sale"), invAccounts, "INV-1", 5_000)!;
    expect(e.lines[0]).toMatchObject({ accountId: "i103", debit: 5_000 });
    expect(e.lines[1]).toMatchObject({ accountId: "i401", credit: 5_000 });
    expect(isBalanced(e.lines)).toBe(true);
  });

  it("a purchase debits the cost and credits the supplier", () => {
    const e = journalEntryFromInvoice(doc("purchase"), invAccounts, "BILL-1", 5_000)!;
    expect(e.lines[0]).toMatchObject({ accountId: "i501", debit: 5_000 });
    expect(e.lines[1]).toMatchObject({ accountId: "i201", credit: 5_000 });
  });

  it("nothing touches cash — an invoice is credit until it's paid", () => {
    const e = journalEntryFromInvoice(doc("purchase"), invAccounts, "BILL-1", 5_000)!;
    expect(e.lines.every((l) => l.accountId !== "cash" && l.accountId !== "bank")).toBe(true);
  });

  it("a sale return undoes the sale exactly", () => {
    const sale = { ...journalEntryFromInvoice(doc("sale"), invAccounts, "INV-1", 5_000)!, id: "e1" };
    const ret = {
      ...journalEntryFromInvoice(doc("sale_return", "inv2"), invAccounts, "SRET-1", 5_000)!,
      id: "e2",
    };
    const b = accountBalances(invAccounts, [sale, ret]);
    expect(b.get("i103")!.balance).toBe(0); // customer owes nothing
    expect(b.get("i401")!.balance).toBe(0); // revenue reversed
  });

  it("a purchase return undoes the purchase exactly", () => {
    const bill = {
      ...journalEntryFromInvoice(doc("purchase"), invAccounts, "BILL-1", 5_000)!,
      id: "e1",
    };
    const ret = {
      ...journalEntryFromInvoice(doc("purchase_return", "inv2"), invAccounts, "PRET-1", 5_000)!,
      id: "e2",
    };
    const b = accountBalances(invAccounts, [bill, ret]);
    expect(b.get("i201")!.balance).toBe(0); // supplier owed nothing
    expect(b.get("i501")!.balance).toBe(0); // cost reversed
  });

  it("a partial return leaves only the unreturned amount standing", () => {
    const bill = {
      ...journalEntryFromInvoice(doc("purchase"), invAccounts, "BILL-1", 5_000)!,
      id: "e1",
    };
    const ret = {
      ...journalEntryFromInvoice(doc("purchase_return", "inv2"), invAccounts, "PRET-1", 2_000)!,
      id: "e2",
    };
    const b = accountBalances(invAccounts, [bill, ret]);
    expect(b.get("i201")!.balance).toBe(3_000);
    expect(b.get("i501")!.balance).toBe(3_000);
  });

  it("treats a legacy invoice with no kind as a sale", () => {
    const legacy = { ...doc("sale"), kind: undefined } as Invoice;
    const e = journalEntryFromInvoice(legacy, invAccounts, "INV-1", 1_000)!;
    expect(e.lines[0]).toMatchObject({ accountId: "i103", debit: 1_000 });
  });

  it("books to an explicitly chosen account when given one", () => {
    const withAccount = { ...doc("purchase"), accountId: "i401" } as Invoice;
    const e = journalEntryFromInvoice(withAccount, invAccounts, "BILL-1", 1_000)!;
    expect(e.lines[0]).toMatchObject({ accountId: "i401", debit: 1_000 });
  });

  it("keeps the trial balance balanced across a bill and its return", () => {
    const bill = { ...journalEntryFromInvoice(doc("purchase"), invAccounts, "BILL-1", 5_000)!, id: "e1" };
    const ret = {
      ...journalEntryFromInvoice(doc("purchase_return", "inv2"), invAccounts, "PRET-1", 2_000)!,
      id: "e2",
    };
    expect(trialBalance(invAccounts, [bill, ret]).balanced).toBe(true);
  });
});

describe("invoice payments settle rather than re-recognise revenue", () => {
  const payAccounts: Account[] = [
    { ...acc("p101", "1101", "Cash", "asset"), systemKey: "cash" },
    { ...acc("p102", "1102", "Bank", "asset"), systemKey: "bank" },
    { ...acc("p103", "1103", "Customers", "asset"), systemKey: "receivable" },
    { ...acc("p201", "2101", "Suppliers", "liability"), systemKey: "payable" },
    { ...acc("p401", "4105", "Other income", "revenue"), systemKey: "revenue_other" },
    { ...acc("p501", "5110", "Other expenses", "expense"), systemKey: "expense_other" },
  ];

  const sale: Invoice = {
    id: "inv1",
    farmId: "f1",
    number: "A-1",
    kind: "sale",
    customerId: "party_1",
    issuedAt: "2026-07-01",
    dueAt: "2026-07-31",
    lines: [{ description: "Milk", qty: 1, unitPrice: 5_000 }],
    paidAmount: 0,
    status: "sent",
  };

  it("a payment debits cash and clears the receivable — revenue untouched", () => {
    const e = journalEntryFromInvoicePayment(sale, 5_000, "2026-07-10", "cash", payAccounts, "RV-1")!;
    expect(e.lines[0]).toMatchObject({ accountId: "p101", debit: 5_000 });
    expect(e.lines[1]).toMatchObject({ accountId: "p103", credit: 5_000 });
    expect(e.lines.some((l) => l.accountId === "p401")).toBe(false);
  });

  it("invoice then full payment: revenue counted once, receivable cleared", () => {
    const inv = { ...journalEntryFromInvoice(sale, payAccounts, "INV-1", 5_000)!, id: "e1" };
    const pay = {
      ...journalEntryFromInvoicePayment(sale, 5_000, "2026-07-10", "bank", payAccounts, "RV-1")!,
      id: "e2",
    };
    const b = accountBalances(payAccounts, [inv, pay]);
    expect(b.get("p401")!.balance).toBe(5_000); // revenue recognised exactly once
    expect(b.get("p103")!.balance).toBe(0); // customer settled
    expect(b.get("p102")!.balance).toBe(5_000); // money in the bank
  });

  it("paying a supplier bill debits the payable and credits the treasury", () => {
    const bill: Invoice = { ...sale, id: "inv2", kind: "purchase" };
    const e = journalEntryFromInvoicePayment(bill, 5_000, "2026-07-10", "bank", payAccounts, "PV-1")!;
    expect(e.lines[0]).toMatchObject({ accountId: "p201", debit: 5_000 });
    expect(e.lines[1]).toMatchObject({ accountId: "p102", credit: 5_000 });
  });

  it("a part payment leaves the rest outstanding", () => {
    const inv = { ...journalEntryFromInvoice(sale, payAccounts, "INV-1", 5_000)!, id: "e1" };
    const pay = {
      ...journalEntryFromInvoicePayment(sale, 2_000, "2026-07-10", "cash", payAccounts, "RV-1")!,
      id: "e2",
    };
    expect(accountBalances(payAccounts, [inv, pay]).get("p103")!.balance).toBe(3_000);
  });
});

describe("nextSequence", () => {
  it("continues from the highest number already issued", () => {
    expect(nextSequence(["JV-2026-0001", "JV-2026-0007", "JV-2026-0003"], "JV")).toBe(8);
  });

  it("starts at 1 when the series is empty", () => {
    expect(nextSequence([], "JV")).toBe(1);
    expect(nextSequence([undefined, undefined], "JV")).toBe(1);
  });

  it("keeps series apart so RV and PV don't share a counter", () => {
    const all = ["RV-2026-0004", "PV-2026-0009", "JV-2026-0002"];
    expect(nextSequence(all, "RV")).toBe(5);
    expect(nextSequence(all, "PV")).toBe(10);
    expect(nextSequence(all, "JV")).toBe(3);
  });

  it("does not collide when the list is truncated — the regression this fixes", () => {
    // A capped read returns the NEWEST entries; counting them would saturate and
    // re-issue the same number forever. The highest suffix still moves forward.
    const capped = ["JV-2026-1200", "JV-2026-1199", "JV-2026-1198"];
    expect(nextSequence(capped, "JV")).toBe(1201);
    expect(nextSequence([...capped, "JV-2026-1201"], "JV")).toBe(1202);
  });

  it("ignores malformed or foreign numbers rather than throwing", () => {
    expect(nextSequence(["JV-bad", "OTHER-2026-0099", "JV-2026-0005"], "JV")).toBe(6);
  });
});

describe("isIncomingInvoice", () => {
  it("money in on a sale or a purchase return", () => {
    expect(isIncomingInvoice("sale")).toBe(true);
    expect(isIncomingInvoice("purchase_return")).toBe(true);
    expect(isIncomingInvoice(undefined)).toBe(true); // legacy = sale
  });
  it("money out on a purchase or a sale return", () => {
    expect(isIncomingInvoice("purchase")).toBe(false);
    expect(isIncomingInvoice("sale_return")).toBe(false);
  });
});
