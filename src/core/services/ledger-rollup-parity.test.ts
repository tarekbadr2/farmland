import { describe, it, expect } from "vitest";

import {
  applyToRollup,
  contribution,
  rollupId as fnRollupId,
  type Contribution,
  type JournalEntryDoc,
  type RollupTotals,
} from "../../../functions/src/ledger-rollup-math";
import { contributionOf, rollupId, rollupsFromEntries } from "./ledger-rollup";
import type { JournalEntry, JournalStatus } from "@/core/domain/types";

/**
 * Two things have to hold for the rollups to be trustworthy, and neither is
 * provable from either side alone.
 *
 * 1. The Cloud Function's arithmetic matches the app's. They're separate
 *    modules on opposite sides of a deployment boundary, so nothing but a test
 *    stops them drifting — same arrangement as `ledger-guard.test.ts`.
 * 2. Applying the trigger's incremental deltas over an arbitrary sequence of
 *    writes lands in the same place as recomputing from scratch. This is the
 *    real risk: an incremental aggregate that misses a case (an entry moving
 *    month, a post being reversed, a delete) drifts silently and the books go
 *    quietly wrong, which is the exact failure the rollups exist to prevent.
 */

/* ------------------------------- generators -------------------------------- */

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACCOUNT_IDS = ["1000", "1100", "2000", "4000", "5000"];
const BRANCHES = ["b1", "b2", undefined];
const YEARS = ["fy2025", "fy2026", undefined];
const STATUSES: JournalStatus[] = ["posted", "posted", "posted", "draft", "void"];

function makeEntry(i: number, rand: () => number): JournalEntry {
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const year = rand() < 0.5 ? 2025 : 2026;
  const month = 1 + Math.floor(rand() * 12);
  const day = 1 + Math.floor(rand() * 28);
  const amount = Math.round((rand() * 5000 + 0.01) * 100) / 100;
  const debitAcc = pick(ACCOUNT_IDS);
  const creditAcc = ACCOUNT_IDS[(ACCOUNT_IDS.indexOf(debitAcc) + 1) % ACCOUNT_IDS.length];
  return {
    id: `e${i}`,
    farmId: "f1",
    number: `JV-${year}-${i}`,
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    description: `entry ${i}`,
    status: pick(STATUSES),
    branchId: pick(BRANCHES),
    fiscalYearId: pick(YEARS),
    lines: [
      { accountId: debitAcc, debit: amount, credit: 0 },
      { accountId: creditAcc, debit: 0, credit: amount },
    ],
  };
}

/* ---------------------------- the trigger, in memory ------------------------ */

interface StoredRollup {
  period: string;
  branchId: string;
  fiscalYearId: string;
  accounts: Record<string, RollupTotals>;
  entryCount: number;
}

/**
 * The fold `onJournalEntryRollup` performs, minus Firestore: back out the
 * before image, add the after image, grouping by document so a move between
 * months is one read-modify-write per side.
 */
function handleWrite(
  store: Map<string, StoredRollup>,
  before: JournalEntry | undefined,
  after: JournalEntry | undefined,
): void {
  const b = contribution(before as JournalEntryDoc | undefined);
  const a = contribution(after as JournalEntryDoc | undefined);
  if (!b && !a) return;

  const changes: Array<{ contrib: Contribution; sign: 1 | -1 }> = [];
  if (b) changes.push({ contrib: b, sign: -1 });
  if (a) changes.push({ contrib: a, sign: 1 });

  const byDoc = new Map<string, Array<{ contrib: Contribution; sign: 1 | -1 }>>();
  for (const c of changes) {
    const list = byDoc.get(c.contrib.id) ?? [];
    list.push(c);
    byDoc.set(c.contrib.id, list);
  }

  for (const [id, list] of byDoc) {
    let data: { accounts?: Record<string, RollupTotals>; entryCount?: number } | undefined =
      store.get(id);
    for (const { contrib, sign } of list) data = applyToRollup(data, contrib, sign);
    const { period, branchId, fiscalYearId } = list[0].contrib;
    store.set(id, {
      period,
      branchId,
      fiscalYearId,
      accounts: data?.accounts ?? {},
      entryCount: data?.entryCount ?? 0,
    });
  }
}

/** Drop documents the trigger emptied out — the oracle never creates those. */
function nonEmpty(store: Map<string, StoredRollup>): Map<string, StoredRollup> {
  return new Map([...store].filter(([, r]) => Object.keys(r.accounts).length > 0));
}

/* ---------------------------------- tests ----------------------------------- */

describe("the function's rollup maths matches the app's", () => {
  it("derives the same contribution for every entry shape", () => {
    const rand = rng(11);
    for (let i = 0; i < 500; i++) {
      const entry = makeEntry(i, rand);
      const mine = contributionOf(entry);
      const theirs = contribution(entry as JournalEntryDoc);
      expect(theirs, `entry ${i}`).toEqual(mine);
    }
  });

  it("agrees on the document id", () => {
    expect(fnRollupId("2026-03", "b1", "fy2026")).toBe(rollupId("2026-03", "b1", "fy2026"));
  });

  it("ignores an entry with no lines, and one whose lines have no account", () => {
    const base = { date: "2026-03-04", status: "posted" };
    expect(contribution({ ...base })?.accounts).toEqual({});
    expect(contribution({ ...base, lines: [{ debit: 5 }] })?.accounts).toEqual({});
  });

  it("coerces amounts that arrived as strings or nulls", () => {
    // Firestore hands back whatever was written; a client bug or an import can
    // put a string in a number field, and NaN would poison the whole month.
    const c = contribution({
      date: "2026-03-04",
      status: "posted",
      lines: [{ accountId: "1000", debit: "12.5" as unknown as number, credit: null as unknown as number }],
    })!;
    expect(c.accounts["1000"]).toEqual({ debit: 12.5, credit: 0 });
  });
});

describe("incremental deltas converge on a full recompute", () => {
  it("survives an arbitrary sequence of creates, edits and deletes", () => {
    for (let seed = 0; seed < 10; seed++) {
      const rand = rng(seed * 31 + 5);
      const store = new Map<string, StoredRollup>();
      const live = new Map<string, JournalEntry>();

      for (let step = 0; step < 400; step++) {
        const roll = rand();
        const ids = [...live.keys()];

        if (roll < 0.5 || ids.length === 0) {
          // create
          const entry = makeEntry(step, rand);
          handleWrite(store, undefined, entry);
          live.set(entry.id, entry);
        } else if (roll < 0.85) {
          // edit — may change status, date, branch, fiscal year or amounts, i.e.
          // may move the entry to a different rollup document entirely
          const id = ids[Math.floor(rand() * ids.length)];
          const before = live.get(id)!;
          const after = { ...makeEntry(step, rand), id };
          handleWrite(store, before, after);
          live.set(id, after);
        } else {
          // delete
          const id = ids[Math.floor(rand() * ids.length)];
          const before = live.get(id)!;
          handleWrite(store, before, undefined);
          live.delete(id);
        }
      }

      const oracle = new Map(rollupsFromEntries([...live.values()]).map((r) => [r.id, r]));
      const got = nonEmpty(store);

      expect([...got.keys()].sort(), `seed ${seed}: rollup documents`).toEqual(
        [...oracle.keys()].sort(),
      );
      for (const [id, expected] of oracle) {
        const actual = got.get(id)!;
        expect(actual.accounts, `seed ${seed}: ${id} accounts`).toEqual(expected.accounts);
        expect(actual.entryCount, `seed ${seed}: ${id} entryCount`).toBe(expected.entryCount);
      }
    }
  });

  it("leaves no stale totals when the last entry in a month is removed", () => {
    const store = new Map<string, StoredRollup>();
    const entry: JournalEntry = {
      id: "e1",
      farmId: "f1",
      number: "JV-1",
      date: "2026-03-04",
      description: "",
      status: "posted",
      lines: [
        { accountId: "1000", debit: 100, credit: 0 },
        { accountId: "4000", debit: 0, credit: 100 },
      ],
    };
    handleWrite(store, undefined, entry);
    expect(nonEmpty(store).size).toBe(1);

    handleWrite(store, entry, undefined);
    // The document may linger, but it must carry nothing.
    expect(nonEmpty(store).size).toBe(0);
    const left = [...store.values()][0];
    expect(left.accounts).toEqual({});
    expect(left.entryCount).toBe(0);
  });

  it("moves totals across months when an entry is re-dated", () => {
    const store = new Map<string, StoredRollup>();
    const march: JournalEntry = {
      id: "e1",
      farmId: "f1",
      number: "JV-1",
      date: "2026-03-04",
      description: "",
      status: "posted",
      lines: [
        { accountId: "1000", debit: 100, credit: 0 },
        { accountId: "4000", debit: 0, credit: 100 },
      ],
    };
    handleWrite(store, undefined, march);
    const april = { ...march, date: "2026-04-04" };
    handleWrite(store, march, april);

    const got = nonEmpty(store);
    expect([...got.keys()]).toEqual([rollupId("2026-04", "_none", "_none")]);
    expect(got.get(rollupId("2026-04", "_none", "_none"))!.accounts["1000"]).toEqual({
      debit: 100,
      credit: 0,
    });
  });

  it("backs the totals out when the integrity guard voids a posted entry", () => {
    // ledger.ts flips an unbalanced posted entry to void. The rollup has to
    // follow, or the quarantine would keep counting.
    const store = new Map<string, StoredRollup>();
    const posted: JournalEntry = {
      id: "e1",
      farmId: "f1",
      number: "JV-1",
      date: "2026-03-04",
      description: "",
      status: "posted",
      lines: [
        { accountId: "1000", debit: 100, credit: 0 },
        { accountId: "4000", debit: 0, credit: 60 },
      ],
    };
    handleWrite(store, undefined, posted);
    handleWrite(store, posted, { ...posted, status: "void" });
    expect(nonEmpty(store).size).toBe(0);
  });
});
