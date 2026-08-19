import { describe, it, expect } from "vitest";

import {
  GESTATION_DAYS,
  STANDARD_SHIFT_HOURS,
  applyBreedingEvent,
  applyHealthEvent,
  assertBreedingAllowed,
  assertHealthAllowed,
  assertMilkAllowed,
  attendanceFromClock,
  daysUntilBreedable,
  isMilkAllowed,
  isUnderWithdrawal,
  kgPerUnit,
} from "./rules";
import type { Animal, BreedingEvent, HealthEvent } from "./types";

/**
 * The herd rule engine is applied by BOTH the demo and Firestore adapters, so a
 * regression here corrupts stored animal state identically in production. These
 * tests pin the food-safety boundary (withdrawal), the reproduction date anchor
 * (gestation from the service, not the check), the lactation/calf counters, and
 * the payroll + feed-unit conversions.
 */

const animal = (over: Partial<Animal> = {}): Animal =>
  ({
    id: "a1",
    farmId: "f1",
    tag: "A1",
    name: "A1",
    nameAr: "A1",
    sex: "female",
    status: "active",
    ...over,
  }) as Animal;

describe("event guards", () => {
  it("rejects breeding on a male or a departed animal", () => {
    expect(() => assertBreedingAllowed(animal({ sex: "male" }))).toThrow("breeding-female-only");
    expect(() => assertBreedingAllowed(animal({ status: "sold" }))).toThrow("animal-not-on-farm");
    expect(() => assertBreedingAllowed(animal({ status: "dead" }))).toThrow("animal-not-on-farm");
    expect(() => assertBreedingAllowed(animal())).not.toThrow();
  });

  it("allows a clinical event on any live animal but not a terminal one", () => {
    expect(() => assertHealthAllowed(animal({ status: "active" }))).not.toThrow();
    expect(() => assertHealthAllowed(animal({ status: "quarantine" }))).not.toThrow();
    expect(() => assertHealthAllowed(animal({ status: "culled" }))).toThrow("animal-not-on-farm");
  });

  it("mirrors the breeding guard for milk (female + on-farm)", () => {
    expect(isMilkAllowed({ status: "active", sex: "female" })).toBe(true);
    expect(isMilkAllowed({ status: "active", sex: "male" })).toBe(false);
    expect(isMilkAllowed({ status: "sold", sex: "female" })).toBe(false);
    expect(() => assertMilkAllowed(animal({ sex: "male" }))).toThrow("milk-female-only");
    expect(() => assertMilkAllowed(animal({ status: "dead" }))).toThrow("animal-not-on-farm");
  });
});

describe("applyBreedingEvent", () => {
  const ev = (over: Partial<BreedingEvent>): Parameters<typeof applyBreedingEvent>[1] =>
    ({ type: "heat", date: "2026-01-01", ...over }) as BreedingEvent;

  it("heat marks the animal open and records the heat date", () => {
    expect(applyBreedingEvent(animal(), ev({ type: "heat", date: "2026-02-10" }))).toEqual({
      reproStatus: "open",
      lastHeatDate: "2026-02-10",
    });
  });

  it("insemination increments the service count without claiming pregnancy", () => {
    const patch = applyBreedingEvent(
      animal({ servicesThisLactation: 1 }),
      ev({ type: "ai", date: "2026-03-01" }),
    );
    expect(patch).toEqual({
      reproStatus: "inseminated",
      lastServiceDate: "2026-03-01",
      servicesThisLactation: 2,
    });
  });

  it("a positive pregnancy check dates calving from the SERVICE, not the check", () => {
    const patch = applyBreedingEvent(
      animal({ lastServiceDate: "2026-01-01" }),
      ev({ type: "pregnancy_check", date: "2026-02-15", result: "pregnant" }),
    );
    expect(patch.reproStatus).toBe("pregnant");
    // 2026-01-01 + 310 days, NOT 2026-02-15 + 310.
    expect(patch.expectedCalvingDate).toBe("2026-11-07");
  });

  it("falls back to the check date only when no service is on record", () => {
    const patch = applyBreedingEvent(
      animal(),
      ev({ type: "pregnancy_check", date: "2026-02-15", result: "pregnant" }),
    );
    expect(patch.expectedCalvingDate).toBe(addDaysLocal("2026-02-15", GESTATION_DAYS));
  });

  it("an open check clears any expected calving date", () => {
    const patch = applyBreedingEvent(
      animal({ expectedCalvingDate: "2026-11-07" }),
      ev({ type: "pregnancy_check", date: "2026-02-15", result: "open" }),
    );
    expect(patch).toEqual({ reproStatus: "open", expectedCalvingDate: undefined });
  });

  it("a live calving freshens the cow and increments lactation AND calves born", () => {
    const patch = applyBreedingEvent(
      animal({ lactationNumber: 2, calvesBorn: 2, servicesThisLactation: 3 }),
      ev({ type: "calving", date: "2026-11-07", outcome: "live" }),
    );
    expect(patch.milkStatus).toBe("lactating");
    expect(patch.reproStatus).toBe("fresh");
    expect(patch.lactationNumber).toBe(3);
    expect(patch.calvesBorn).toBe(3);
    expect(patch.servicesThisLactation).toBe(0);
    expect(patch.lastCalvingDate).toBe("2026-11-07");
  });

  it("a stillbirth still freshens and still milks, but does NOT count a calf", () => {
    const patch = applyBreedingEvent(
      animal({ lactationNumber: 2, calvesBorn: 2 }),
      ev({ type: "calving", date: "2026-11-07", outcome: "stillbirth" }),
    );
    expect(patch.milkStatus).toBe("lactating");
    expect(patch.lactationNumber).toBe(3); // she still freshened
    expect(patch.calvesBorn).toBe(2); // but no live calf
  });

  it("an abortion re-opens the cow and resets the service count", () => {
    const patch = applyBreedingEvent(
      animal({ servicesThisLactation: 2, expectedCalvingDate: "2026-11-07" }),
      ev({ type: "abortion", date: "2026-06-01" }),
    );
    expect(patch).toEqual({
      reproStatus: "open",
      expectedCalvingDate: undefined,
      servicesThisLactation: 0,
    });
  });

  it("dry-off records the dry date and status", () => {
    expect(applyBreedingEvent(animal(), ev({ type: "dry_off", date: "2026-09-01" }))).toEqual({
      milkStatus: "dry",
      dryDate: "2026-09-01",
    });
  });
});

describe("applyHealthEvent", () => {
  const ev = (over: Partial<HealthEvent>): Parameters<typeof applyHealthEvent>[1] =>
    ({ type: "diagnosis", date: "2026-01-01", ...over }) as HealthEvent;

  it("a diagnosis drops the health score and can quarantine", () => {
    const patch = applyHealthEvent(
      animal({ healthScore: 100 }),
      ev({ type: "diagnosis", isolation: true }),
    );
    expect(patch.healthScore).toBe(75);
    expect(patch.status).toBe("quarantine");
  });

  it("clamps the health score to the 0..100 range", () => {
    expect(applyHealthEvent(animal({ healthScore: 10 }), ev({ type: "diagnosis" })).healthScore).toBe(0);
    expect(applyHealthEvent(animal({ healthScore: 100 }), ev({ type: "treatment" })).healthScore).toBe(100);
  });

  it("recovering pulls a quarantined animal back to active", () => {
    const patch = applyHealthEvent(
      animal({ status: "quarantine", healthScore: 40 }),
      ev({ type: "treatment", outcome: "recovered" }),
    );
    expect(patch.status).toBe("active");
    expect(patch.healthScore).toBe(82);
  });

  it("a death zeroes production/repro state and marks the animal dead", () => {
    const patch = applyHealthEvent(animal({ healthScore: 50 }), ev({ outcome: "died" }));
    expect(patch.status).toBe("dead");
    expect(patch.milkStatus).toBe("not_applicable");
    expect(patch.reproStatus).toBe("not_applicable");
    expect(patch.healthScore).toBe(0);
  });

  it("a vaccination is routine and does not move the score", () => {
    expect(applyHealthEvent(animal({ healthScore: 90 }), ev({ type: "vaccination" }))).toEqual({});
  });
});

describe("isUnderWithdrawal (food safety)", () => {
  it("is true on and before the withdrawal date, false the day after", () => {
    const a = animal({ withdrawalUntil: "2026-08-19" });
    expect(isUnderWithdrawal(a, "2026-08-18")).toBe(true);
    expect(isUnderWithdrawal(a, "2026-08-19")).toBe(true); // inclusive — still withheld ON the day
    expect(isUnderWithdrawal(a, "2026-08-20")).toBe(false);
  });

  it("is false when no withdrawal is set", () => {
    expect(isUnderWithdrawal(animal(), "2026-08-19")).toBe(false);
  });
});

describe("daysUntilBreedable", () => {
  it("is null with no calving on record", () => {
    expect(daysUntilBreedable(animal(), "2026-08-19")).toBeNull();
  });

  it("counts down the voluntary waiting period and goes negative once eligible", () => {
    const a = animal({ lastCalvingDate: "2026-08-01" }); // +60 days → 2026-09-30
    expect(daysUntilBreedable(a, "2026-09-01")).toBe(29);
    expect(daysUntilBreedable(a, "2026-10-05")).toBeLessThan(0);
  });
});

describe("attendanceFromClock", () => {
  it("computes worked hours and overtime past a standard shift", () => {
    const row = attendanceFromClock(
      { employeeId: "e1", date: "2026-08-19", status: "present", clockIn: "07:00", clockOut: "17:30" },
      "f1",
      "att1",
    );
    expect(row.hours).toBe(10.5);
    expect(row.overtimeHours).toBe(10.5 - STANDARD_SHIFT_HOURS);
  });

  it("wraps a night shift past midnight", () => {
    const row = attendanceFromClock(
      { employeeId: "e1", date: "2026-08-19", status: "present", clockIn: "22:00", clockOut: "06:00" },
      "f1",
      "att1",
    );
    expect(row.hours).toBe(8);
    expect(row.overtimeHours).toBe(0);
  });

  it("reports zero for absent/leave regardless of stray times", () => {
    const row = attendanceFromClock(
      { employeeId: "e1", date: "2026-08-19", status: "absent", clockIn: "07:00", clockOut: "17:00" },
      "f1",
      "att1",
    );
    expect(row.hours).toBe(0);
    expect(row.overtimeHours).toBe(0);
  });

  it("reports zero while still clocked in (no clock-out yet)", () => {
    const row = attendanceFromClock(
      { employeeId: "e1", date: "2026-08-19", status: "present", clockIn: "07:00" },
      "f1",
      "att1",
    );
    expect(row.hours).toBe(0);
  });
});

describe("kgPerUnit (feed conversion)", () => {
  it("converts each stock unit to kilograms", () => {
    expect(kgPerUnit("kg")).toBe(1);
    expect(kgPerUnit("bale")).toBe(25);
    expect(kgPerUnit("ton")).toBe(1000);
  });
});

// Local mirror of addDays to assert the gestation fallback without importing the
// SUT's own helper into an assertion (keeps the test independent of it).
function addDaysLocal(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
