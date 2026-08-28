import { describe, it, expect } from "vitest";

import {
  addDays,
  addMonths,
  ageFromDOB,
  diffDays,
  isSameMonth,
  monthKey,
  parseISODate,
  rangeDays,
  startOfMonth,
  toISODate,
} from "./date";

/**
 * The date engine sits under every withdrawal date, gestation date and rolling
 * metric window in the app — a regression here silently mis-dates safe-vs-
 * condemned milk and shifts every KPI window at once. These tests pin the
 * boundary behaviour (month/year/leap rollover, the string-coercion guard the
 * code comments itself flag as safety-critical) so it can't rot unnoticed.
 */

describe("toISODate / parseISODate round-trip", () => {
  it("round-trips a plain date in local time", () => {
    expect(toISODate(parseISODate("2026-08-19"))).toBe("2026-08-19");
  });

  it("zero-pads month and day", () => {
    expect(toISODate(parseISODate("2026-01-05"))).toBe("2026-01-05");
  });
});

describe("addDays", () => {
  it("adds within a month", () => {
    expect(addDays("2026-08-19", 5)).toBe("2026-08-24");
  });

  it("rolls across a month boundary", () => {
    expect(addDays("2026-08-30", 5)).toBe("2026-09-04");
  });

  it("rolls across a year boundary", () => {
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
  });

  it("subtracts with a negative count", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("handles the leap-day boundary", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // 2028 is a leap year
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("coerces a string count instead of concatenating (the safety guard)", () => {
    // A form's numeric input still hands over a string. "5" must add five days,
    // never concatenate into a six-month jump. This is the withdrawal-safety
    // case the source comment calls out explicitly.
    expect(addDays("2026-08-19", "5" as unknown as number)).toBe("2026-08-24");
  });

  it("anchors a 310-day buffalo gestation correctly", () => {
    // service on 2026-01-01 → expected calving 2026-11-07
    expect(addDays("2026-01-01", 310)).toBe("2026-11-07");
  });
});

describe("addMonths", () => {
  it("adds whole months", () => {
    expect(addMonths("2026-01-15", 2)).toBe("2026-03-15");
  });

  it("rolls across a year boundary", () => {
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("subtracts months", () => {
    expect(addMonths("2026-03-15", -3)).toBe("2025-12-15");
  });
});

describe("diffDays", () => {
  it("is positive when the first date is later", () => {
    expect(diffDays("2026-08-24", "2026-08-19")).toBe(5);
  });

  it("is negative when the first date is earlier", () => {
    expect(diffDays("2026-08-19", "2026-08-24")).toBe(-5);
  });

  it("is zero for the same day", () => {
    expect(diffDays("2026-08-19", "2026-08-19")).toBe(0);
  });

  it("counts across a year boundary", () => {
    expect(diffDays("2027-01-04", "2026-12-30")).toBe(5);
  });
});

describe("month helpers", () => {
  it("monthKey slices to yyyy-MM", () => {
    expect(monthKey("2026-08-19")).toBe("2026-08");
  });

  it("startOfMonth pins to the first", () => {
    expect(startOfMonth("2026-08-19")).toBe("2026-08-01");
  });

  it("isSameMonth compares yyyy-MM only", () => {
    expect(isSameMonth("2026-08-01", "2026-08-31")).toBe(true);
    expect(isSameMonth("2026-08-31", "2026-09-01")).toBe(false);
  });

  it("last-month-key idiom (addDays to before the 1st) crosses the year", () => {
    // metrics.ts derives the previous month via addDays(startOfMonth, -1).
    expect(monthKey(addDays(startOfMonth("2026-01-10"), -1))).toBe("2025-12");
  });
});

describe("rangeDays", () => {
  it("returns count days ending on endISO, oldest first", () => {
    expect(rangeDays("2026-08-19", 3)).toEqual(["2026-08-17", "2026-08-18", "2026-08-19"]);
  });

  it("returns a single day for count 1", () => {
    expect(rangeDays("2026-08-19", 1)).toEqual(["2026-08-19"]);
  });

  it("spans a month boundary", () => {
    expect(rangeDays("2026-09-01", 2)).toEqual(["2026-08-31", "2026-09-01"]);
  });
});

describe("ageFromDOB", () => {
  it("splits a whole-year age", () => {
    const { years } = ageFromDOB("2024-08-19", "2026-08-19");
    expect(years).toBe(2);
  });

  it("reports months for a sub-year age", () => {
    const { years, months } = ageFromDOB("2026-05-19", "2026-08-19");
    expect(years).toBe(0);
    expect(months).toBe(3);
  });

  it("exposes the raw day count", () => {
    expect(ageFromDOB("2026-08-09", "2026-08-19").days).toBe(10);
  });
});
