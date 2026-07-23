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
} from "./accounting";
import type { Account, JournalEntry } from "@/core/domain/types";

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
