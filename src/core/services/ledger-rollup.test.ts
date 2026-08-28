import { describe, it, expect } from "vitest";

import { accountBalances } from "./accounting";
import {
  UNSCOPED,
  balancesFromRollups,
  contributionOf,
  monthEnd,
  partialMonths,
  rollupId,
  rollupsFromEntries,
  type BalanceWindow,
  type LedgerRollup,
} from "./ledger-rollup";
import type { Account, JournalEntry, JournalStatus } from "@/core/domain/types";

/**
 * The whole point of the rollups is that they are indistinguishable from the
 * raw ledger. So the central test is an equivalence: for a generated ledger and
 * a matrix of windows, balances composed from rollups must equal balances
 * computed the old way, entry by entry. If they ever diverge the books are
 * wrong, and it doesn't matter which side is at fault.
 */

/* ------------------------------- generators -------------------------------- */

/** Deterministic PRNG — a seeded mulberry32, so a failure is reproducible. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const account = (id: string, nature: "debit" | "credit", openingBalance = 0): Account => ({
  id,
  farmId: "f1",
  code: id,
  name: id,
  nameAr: id,
  type: nature === "debit" ? "asset" : "liability",
  nature,
  isGroup: false,
  openingBalance,
  active: true,
});

const ACCOUNTS: Account[] = [
  account("1000", "debit", 5000),
  account("1100", "debit"),
  account("2000", "credit", -250.5),
  account("2100", "credit", 1200.25),
  account("4000", "credit"),
  account("5000", "debit"),
];

const BRANCHES = ["b1", "b2", undefined];
const YEARS = ["fy2025", "fy2026", undefined];
const STATUSES: JournalStatus[] = ["posted", "posted", "posted", "draft", "void"];

/** A ledger spread over two years, with drafts, voids, and mixed scoping. */
function generateLedger(count: number, seed = 7): JournalEntry[] {
  const rand = rng(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const entries: JournalEntry[] = [];

  for (let i = 0; i < count; i++) {
    const year = rand() < 0.5 ? 2025 : 2026;
    const month = 1 + Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 28);
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    // Two-sided and balanced, with amounts that exercise rounding.
    const amount = round2(rand() * 5000 + 0.01);
    const debitAcc = pick(ACCOUNTS).id;
    let creditAcc = pick(ACCOUNTS).id;
    if (creditAcc === debitAcc) creditAcc = ACCOUNTS[(ACCOUNTS.findIndex((a) => a.id === debitAcc) + 1) % ACCOUNTS.length].id;

    entries.push({
      id: `e${i}`,
      farmId: "f1",
      number: `JV-${year}-${String(i).padStart(4, "0")}`,
      date,
      description: `entry ${i}`,
      status: pick(STATUSES),
      branchId: pick(BRANCHES),
      fiscalYearId: pick(YEARS),
      lines: [
        { accountId: debitAcc, debit: amount, credit: 0 },
        { accountId: creditAcc, debit: 0, credit: amount },
      ],
    });
  }
  return entries;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Compose the way the app does: rollups, plus raw entries for edge months. */
function compose(
  accounts: Account[],
  entries: JournalEntry[],
  opts: BalanceWindow = {},
) {
  const rollups = rollupsFromEntries(entries);
  const months = new Set(partialMonths(rollups, opts));
  // Only the edge months are fetched in production; mimic that bound here so
  // the test can't accidentally pass by handing over the whole ledger.
  const edge = entries.filter((e) => months.has(e.date.slice(0, 7)));
  return { balances: balancesFromRollups(accounts, rollups, edge, opts), rollups, edge };
}

function expectSameBalances(entries: JournalEntry[], opts: BalanceWindow = {}) {
  const expected = accountBalances(ACCOUNTS, entries, opts);
  const { balances } = compose(ACCOUNTS, entries, opts);
  for (const a of ACCOUNTS) {
    expect({ id: a.id, ...balances.get(a.id) }).toEqual({ id: a.id, ...expected.get(a.id) });
  }
}

/* --------------------------------- the proof -------------------------------- */

describe("rollup balances match the raw ledger", () => {
  const entries = generateLedger(400);

  it("agrees over the whole ledger (no window)", () => {
    expectSameBalances(entries);
  });

  it("agrees for a month-aligned window (every month fully covered)", () => {
    expectSameBalances(entries, { from: "2026-01-01", upTo: "2026-12-31" });
  });

  it("agrees when both edges cut through a month", () => {
    expectSameBalances(entries, { from: "2025-03-17", upTo: "2026-07-09" });
  });

  it("agrees for an as-of date with no lower bound (the balance-sheet case)", () => {
    expectSameBalances(entries, { upTo: "2026-05-14" });
  });

  it("agrees for a from-only window (opening balances drop out)", () => {
    expectSameBalances(entries, { from: "2025-06-15" });
  });

  it("agrees when scoped to a fiscal year", () => {
    expectSameBalances(entries, { fiscalYearId: "fy2026" });
    expectSameBalances(entries, { fiscalYearId: "fy2025", upTo: "2025-08-20" });
  });

  it("agrees for a window inside a single month", () => {
    expectSameBalances(entries, { from: "2026-04-05", upTo: "2026-04-19" });
  });

  it("agrees for a window that selects nothing", () => {
    expectSameBalances(entries, { from: "2030-01-01", upTo: "2030-12-31" });
  });

  it("agrees across many random windows and seeds", () => {
    const rand = rng(99);
    for (let s = 0; s < 8; s++) {
      const ledger = generateLedger(150, s * 13 + 1);
      for (let w = 0; w < 12; w++) {
        const y1 = rand() < 0.5 ? 2025 : 2026;
        const m1 = 1 + Math.floor(rand() * 12);
        const d1 = 1 + Math.floor(rand() * 28);
        const y2 = y1 + (rand() < 0.5 ? 0 : 1);
        const m2 = 1 + Math.floor(rand() * 12);
        const d2 = 1 + Math.floor(rand() * 28);
        const a = `${y1}-${String(m1).padStart(2, "0")}-${String(d1).padStart(2, "0")}`;
        const b = `${y2}-${String(m2).padStart(2, "0")}-${String(d2).padStart(2, "0")}`;
        const [from, upTo] = a <= b ? [a, b] : [b, a];
        const opts = { from, upTo };
        const expected = accountBalances(ACCOUNTS, ledger, opts);
        const { balances } = compose(ACCOUNTS, ledger, opts);
        for (const acc of ACCOUNTS) {
          expect(balances.get(acc.id), `seed ${s}, window ${from}..${upTo}, account ${acc.id}`).toEqual(
            expected.get(acc.id),
          );
        }
      }
    }
  });
});

describe("freshMonths keeps just-written entries visible", () => {
  const entries = generateLedger(400, 21);

  it("gives the same answer whichever months are marked fresh", () => {
    // Marking a month fresh only changes where the numbers are read FROM —
    // rollup or raw journal. It must never change what they are.
    for (const fresh of [[], ["2026-06"], ["2025-01", "2026-12"], ["2026-06", "2026-07"]]) {
      expectSameBalances(entries, { freshMonths: fresh });
      expectSameBalances(entries, { from: "2026-01-01", upTo: "2026-12-31", freshMonths: fresh });
      expectSameBalances(entries, { upTo: "2026-08-15", freshMonths: fresh });
    }
  });

  it("reads a fresh month raw even on an otherwise unbounded view", () => {
    // The default accounting view has no window, so nothing is partial and the
    // whole answer would come from rollups — including the month the user is
    // posting into right now.
    const { edge } = compose(ACCOUNTS, entries, { freshMonths: ["2026-06"] });
    expect(new Set(edge.map((e) => e.date.slice(0, 7)))).toEqual(new Set(["2026-06"]));
  });

  it("does not pull in a fresh month that falls outside the window", () => {
    const { edge } = compose(ACCOUNTS, entries, {
      from: "2026-01-01",
      upTo: "2026-03-31",
      freshMonths: ["2026-09"],
    });
    expect(edge.every((e) => e.date.slice(0, 7) !== "2026-09")).toBe(true);
  });
});

describe("the read is bounded by time, not by volume", () => {
  it("keeps the same rollup count as entries pile up", () => {
    const small = rollupsFromEntries(generateLedger(200, 3)).length;
    const large = rollupsFromEntries(generateLedger(20_000, 3)).length;
    // 24 months x 3 branches x 3 fiscal-year scopes is the ceiling either way —
    // 100x the entries must not mean meaningfully more documents to read.
    expect(large).toBeLessThanOrEqual(24 * 3 * 3);
    expect(large).toBeGreaterThanOrEqual(small);
  });

  it("only needs the edge months as raw entries", () => {
    const entries = generateLedger(3000, 5);
    // The shape the accounting screen asks for: this year to date.
    const { edge } = compose(ACCOUNTS, entries, { from: "2026-01-01", upTo: "2026-06-14" });
    const distinctMonths = new Set(edge.map((e) => e.date.slice(0, 7)));
    expect(distinctMonths).toEqual(new Set(["2026-06"]));
    expect(edge.length).toBeLessThan(entries.length / 10);
  });
});

/* ------------------------------- unit details ------------------------------- */

describe("rollup mechanics", () => {
  it("ignores drafts and voided entries", () => {
    const base = {
      id: "e",
      farmId: "f1",
      number: "JV-1",
      date: "2026-03-04",
      description: "",
      lines: [
        { accountId: "1000", debit: 10, credit: 0 },
        { accountId: "4000", debit: 0, credit: 10 },
      ],
    };
    expect(contributionOf({ ...base, status: "draft" } as JournalEntry)).toBeNull();
    expect(contributionOf({ ...base, status: "void" } as JournalEntry)).toBeNull();
    expect(contributionOf({ ...base, status: "posted" } as JournalEntry)).not.toBeNull();
  });

  it("keys unscoped entries under a stand-in rather than dropping them", () => {
    const c = contributionOf({
      id: "e",
      farmId: "f1",
      number: "JV-1",
      date: "2026-03-04",
      description: "",
      status: "posted",
      lines: [{ accountId: "1000", debit: 10, credit: 0 }],
    } as JournalEntry)!;
    expect(c.id).toBe(rollupId("2026-03", UNSCOPED, UNSCOPED));
  });

  it("sums repeated hits on one account within an entry", () => {
    const c = contributionOf({
      id: "e",
      farmId: "f1",
      number: "JV-1",
      date: "2026-03-04",
      description: "",
      status: "posted",
      lines: [
        { accountId: "1000", debit: 10, credit: 0 },
        { accountId: "1000", debit: 2.5, credit: 0 },
        { accountId: "4000", debit: 0, credit: 12.5 },
      ],
    } as JournalEntry)!;
    expect(c.accounts["1000"]).toEqual({ debit: 12.5, credit: 0 });
  });

  it("gets month ends right, leap year included", () => {
    expect(monthEnd("2026-01")).toBe("2026-01-31");
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2024-02")).toBe("2024-02-29");
    expect(monthEnd("2026-04")).toBe("2026-04-30");
    expect(monthEnd("2026-12")).toBe("2026-12-31");
  });

  it("treats a month the window cuts through as partial, and a whole one as not", () => {
    const rollups: LedgerRollup[] = [
      { id: "x", period: "2026-03", branchId: UNSCOPED, fiscalYearId: UNSCOPED, accounts: {}, entryCount: 1 },
      { id: "y", period: "2026-04", branchId: UNSCOPED, fiscalYearId: UNSCOPED, accounts: {}, entryCount: 1 },
    ];
    // March is entered mid-month; April is covered end to end.
    expect(partialMonths(rollups, { from: "2026-03-10", upTo: "2026-04-30" })).toEqual(["2026-03"]);
    expect(partialMonths(rollups, { from: "2026-03-01", upTo: "2026-04-30" })).toEqual([]);
  });

  it("counts a month with entries but no rollup yet", () => {
    // Nothing posted into May yet, but the window ends there — May must still be
    // fetched raw, or an entry written a moment later would go missing.
    expect(partialMonths([], { upTo: "2026-05-14" })).toEqual(["2026-05"]);
  });

  it("ignores lines pointing at unknown accounts, like the raw path does", () => {
    const entries: JournalEntry[] = [
      {
        id: "e",
        farmId: "f1",
        number: "JV-1",
        date: "2026-03-04",
        description: "",
        status: "posted",
        lines: [
          { accountId: "9999", debit: 10, credit: 0 },
          { accountId: "1000", debit: 0, credit: 10 },
        ],
      } as JournalEntry,
    ];
    expectSameBalances(entries);
  });
});
