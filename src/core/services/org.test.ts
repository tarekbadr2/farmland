import { describe, it, expect } from "vitest";

import {
  baseCurrency,
  defaultBranch,
  describeForeignAmount,
  entriesForBranch,
  entryCountByBranch,
  findCurrency,
  fromBase,
  isValidRate,
  rateFor,
  toBase,
} from "./org";
import type { Branch, Currency, JournalEntry } from "@/core/domain/types";

const cur = (code: string, rateToBase: number, isBase = false): Currency => ({
  id: `cur_${code}`,
  farmId: "f1",
  code,
  name: code,
  nameAr: code,
  rateToBase,
  isBase,
  active: true,
});

const CURRENCIES: Currency[] = [cur("EGP", 1, true), cur("USD", 48), cur("EUR", 52)];

const branch = (id: string, isDefault = false): Branch => ({
  id,
  farmId: "f1",
  name: id,
  nameAr: id,
  isDefault,
  active: true,
});

const BRANCHES: Branch[] = [branch("main", true), branch("north"), branch("south")];

const entry = (id: string, branchId?: string): JournalEntry =>
  ({
    id,
    farmId: "f1",
    number: id,
    date: "2026-09-01",
    description: id,
    status: "posted",
    lines: [],
    branchId,
  }) as JournalEntry;

describe("currency conversion", () => {
  it("converts a foreign amount into base", () => {
    // 100 USD at 48 = 4,800 EGP
    expect(toBase(100, 48)).toBe(4_800);
  });

  it("converts base back into a foreign currency", () => {
    expect(fromBase(4_800, 48)).toBe(100);
  });

  it("round-trips without drifting", () => {
    expect(fromBase(toBase(250, 52), 52)).toBe(250);
  });

  it("treats a missing or zero rate as base — never divides by zero", () => {
    expect(toBase(100, 0)).toBe(100);
    expect(fromBase(100, 0)).toBe(100);
  });

  it("identifies the base currency, falling back to the first", () => {
    expect(baseCurrency(CURRENCIES)!.code).toBe("EGP");
    expect(baseCurrency([cur("USD", 48)])!.code).toBe("USD");
  });

  it("looks up a rate by code and defaults to 1", () => {
    expect(rateFor(CURRENCIES, "USD")).toBe(48);
    expect(rateFor(CURRENCIES, "EGP")).toBe(1);
    // An unknown code must not silently scale the amount.
    expect(rateFor(CURRENCIES, "JPY")).toBe(1);
    expect(rateFor(CURRENCIES)).toBe(1);
  });

  it("finds a currency, or the base when none is named", () => {
    expect(findCurrency(CURRENCIES, "EUR")!.code).toBe("EUR");
    expect(findCurrency(CURRENCIES)!.code).toBe("EGP");
  });
});

describe("describeForeignAmount", () => {
  const base = CURRENCIES[0];

  it("shows a foreign document in its own money", () => {
    const d = describeForeignAmount(4_800, CURRENCIES[1], base);
    expect(d).toMatchObject({ original: 100, code: "USD", isForeign: true });
  });

  it("leaves a base-currency document alone", () => {
    const d = describeForeignAmount(4_800, base, base);
    expect(d).toMatchObject({ original: 4_800, code: "EGP", isForeign: false });
  });

  it("treats an unspecified currency as base", () => {
    expect(describeForeignAmount(500, undefined, base).isForeign).toBe(false);
  });
});

describe("isValidRate", () => {
  it("rejects anything that isn't a positive number", () => {
    expect(isValidRate(48)).toBe(true);
    expect(isValidRate(0)).toBe(false);
    expect(isValidRate(-1)).toBe(false);
    expect(isValidRate(Number.NaN)).toBe(false);
    expect(isValidRate(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("branches", () => {
  it("finds the default branch, falling back to the first", () => {
    expect(defaultBranch(BRANCHES)!.id).toBe("main");
    expect(defaultBranch([branch("only")])!.id).toBe("only");
  });

  it('"all" returns everything', () => {
    const entries = [entry("a", "north"), entry("b", "south")];
    expect(entriesForBranch(entries, "all")).toHaveLength(2);
  });

  it("filters to one branch", () => {
    const entries = [entry("a", "north"), entry("b", "south"), entry("c", "north")];
    expect(entriesForBranch(entries, "north").map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("counts pre-branch history against the default rather than hiding it", () => {
    // Entries written before branches existed have no branchId.
    const entries = [entry("old1"), entry("old2"), entry("new", "north")];
    expect(entriesForBranch(entries, "main", "main").map((e) => e.id)).toEqual(["old1", "old2"]);
    expect(entriesForBranch(entries, "north", "main").map((e) => e.id)).toEqual(["new"]);
  });

  it("tallies entries per branch for the scope selector", () => {
    const counts = entryCountByBranch(
      [entry("a", "north"), entry("b", "north"), entry("c"), entry("d", "south")],
      "main",
    );
    expect(counts.get("north")).toBe(2);
    expect(counts.get("south")).toBe(1);
    expect(counts.get("main")).toBe(1); // the unassigned one
  });
});
