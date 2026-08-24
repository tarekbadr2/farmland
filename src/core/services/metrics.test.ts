import { describe, it, expect } from "vitest";

import {
  animalEconomics,
  assetBookValue,
  assetsSummary,
  utilityCostSummary,
  enterprisePnl,
  feedMetrics,
  milkSummary,
  forecastMilk,
  breedingMetrics,
  financeMetrics,
} from "./metrics";
import { addDays } from "@/lib/date";
import type {
  Animal,
  Asset,
  BreedingEvent,
  DailyMilkPoint,
  FeedItem,
  HealthEvent,
  FeedConsumption,
  Transaction,
  UtilityReading,
} from "@/core/domain/types";

// Minimal builders — only the fields each function actually reads.
const animal = (over: Partial<Animal>): Animal =>
  ({
    id: "a1",
    penId: "pen1",
    sex: "male",
    status: "active",
    weightKg: 400,
    dateOfBirth: "2024-06-01",
    acquiredAt: "2025-01-01",
    ...over,
  }) as Animal;

const asset = (over: Partial<Asset>): Asset =>
  ({ id: "as1", name: "x", category: "machine", acquiredDate: "2020-01-01", cost: 0, ...over }) as Asset;

describe("animalEconomics", () => {
  it("computes a meat animal's cost per kg from purchase + feed + meds", () => {
    const a = animal({
      purpose: "meat",
      acquiredFrom: "purchased",
      acquisitionCost: 10000,
      acquisitionWeightKg: 50,
      weightKg: 400,
    });
    const health: HealthEvent[] = [{ animalId: "a1", date: "2025-03-01", cost: 900 } as HealthEvent];
    // two pen feedings, each cost/heads = 100 → 200 allocated
    const feed: FeedConsumption[] = [
      { zoneId: "pen1", date: "2025-02-01", cost: 1000, heads: 10 } as FeedConsumption,
      { zoneId: "pen1", date: "2025-04-01", cost: 1000, heads: 10 } as FeedConsumption,
    ];
    const e = animalEconomics({ animal: a, health, feedConsumption: feed, litres: 0, today: "2025-12-31" });

    expect(e.purpose).toBe("meat");
    expect(e.purchaseCost).toBe(10000);
    expect(e.feedCost).toBe(200);
    expect(e.healthCost).toBe(900);
    expect(e.totalCost).toBe(11100);
    expect(e.gainKg).toBe(350);
    expect(e.costPerKgLive).toBeCloseTo(27.8, 1); // 11100 / 400, rounded to 1dp
    expect(e.costPerKgGain).toBeCloseTo(31.7, 1); // 11100 / 350, rounded to 1dp
  });

  it("excludes feed from other pens and outside the window", () => {
    const a = animal({ penId: "pen1", acquisitionCost: 0 });
    const feed: FeedConsumption[] = [
      { zoneId: "pen2", date: "2025-02-01", cost: 5000, heads: 5 } as FeedConsumption, // wrong pen
      { zoneId: "pen1", date: "2024-01-01", cost: 5000, heads: 5 } as FeedConsumption, // before acquisition
      { zoneId: "pen1", date: "2025-02-01", cost: 500, heads: 5 } as FeedConsumption, // counts → 100
    ];
    const e = animalEconomics({ animal: a, health: [], feedConsumption: feed, litres: 0, today: "2025-12-31" });
    expect(e.feedCost).toBe(100);
  });

  it("gives a dairy animal a cost per litre and infers purpose from sex", () => {
    const a = animal({ sex: "female", acquisitionCost: 0, weightKg: 550 });
    const e = animalEconomics({ animal: a, health: [], feedConsumption: [], litres: 2000, today: "2025-12-31" });
    expect(e.purpose).toBe("dairy");
    expect(e.totalCost).toBe(0);
    expect(e.costPerLitre).toBe(0);

    const e2 = animalEconomics({
      animal: a,
      health: [{ animalId: "a1", date: "2025-05-01", cost: 4000 } as HealthEvent],
      feedConsumption: [],
      litres: 2000,
      today: "2025-12-31",
    });
    expect(e2.costPerLitre).toBeCloseTo(2, 3); // 4000 / 2000
  });

  it("books profit on a sold animal", () => {
    const a = animal({
      purpose: "meat",
      acquisitionCost: 10000,
      acquisitionWeightKg: 50,
      status: "sold",
      disposal: { type: "sold", date: "2025-12-01", weightKg: 400, proceeds: 24000 },
    });
    const e = animalEconomics({ animal: a, health: [], feedConsumption: [], litres: 0, today: "2025-12-31" });
    expect(e.sold).toBe(true);
    expect(e.currentWeightKg).toBe(400); // disposal weight wins
    expect(e.proceeds).toBe(24000);
    expect(e.profit).toBe(14000); // 24000 - 10000
  });
});

describe("assetBookValue", () => {
  it("never depreciates land", () => {
    const v = assetBookValue(asset({ category: "land", cost: 6_000_000, acquiredDate: "2010-01-01" }), "2025-01-01");
    expect(v.bookValue).toBe(6_000_000);
    expect(v.annualDepreciation).toBe(0);
  });

  it("writes down straight-line and floors at salvage", () => {
    const a = asset({ cost: 1_000_000, salvageValue: 100_000, usefulLifeYears: 10, acquiredDate: "2020-01-01" });
    const v = assetBookValue(a, "2025-01-01"); // ~5 yrs
    expect(v.annualDepreciation).toBe(90_000); // (1,000,000 - 100,000) / 10
    expect(v.bookValue).toBeGreaterThan(100_000);
    expect(v.bookValue).toBeLessThan(1_000_000);

    const old = assetBookValue({ ...a, acquiredDate: "2000-01-01" }, "2025-01-01"); // fully depreciated
    expect(old.bookValue).toBe(100_000); // floored at salvage
  });
});

describe("assetsSummary", () => {
  it("totals cost, book value and depreciation, excluding disposed", () => {
    const assets: Asset[] = [
      asset({ id: "1", category: "land", cost: 1_000_000, acquiredDate: "2010-01-01" }),
      asset({ id: "2", category: "machine", cost: 500_000, salvageValue: 0, usefulLifeYears: 10, acquiredDate: "2000-01-01" }),
      asset({ id: "3", category: "machine", cost: 999, status: "disposed" }),
    ];
    const s = assetsSummary(assets, "2025-01-01");
    expect(s.count).toBe(2); // disposed excluded
    expect(s.cost).toBe(1_500_000);
    expect(s.bookValue).toBe(1_000_000); // land held + machine fully depreciated to 0
    expect(s.depreciation).toBe(500_000);
  });
});

describe("utilityCostSummary", () => {
  it("prices readings and credits solar back", () => {
    const readings: UtilityReading[] = [
      {
        date: "2025-06-15",
        waterM3: 100,
        electricityKwh: 1000,
        dieselL: 50,
        gasM3: 20,
        solarKwh: 100,
        outageMinutes: 0,
        co2eKg: 0,
      },
    ];
    const c = utilityCostSummary(readings, "2025-06-20"); // within 30 days
    expect(c.water).toBe(800); // 100 * 8
    expect(c.electricity).toBe(2200); // 1000 * 2.2
    expect(c.gas).toBe(100); // 20 * 5
    expect(c.diesel).toBe(650); // 50 * 13
    expect(c.solarSavings).toBe(220); // 100 * 2.2
    expect(c.gross).toBe(3750);
    expect(c.net).toBe(3530);
  });

  it("ignores readings outside the window", () => {
    const readings: UtilityReading[] = [
      { date: "2025-01-01", waterM3: 100, electricityKwh: 0, dieselL: 0, outageMinutes: 0, co2eKg: 0 },
    ];
    expect(utilityCostSummary(readings, "2025-06-20").net).toBe(0);
  });
});

describe("enterprisePnl", () => {
  it("splits revenue and allocates direct costs by herd", () => {
    const animals: Animal[] = [
      animal({ id: "d1", sex: "female", weightKg: 600 }), // dairy, 600kg
      animal({ id: "m1", sex: "male", purpose: "meat", weightKg: 400 }), // meat, 400kg
    ];
    const txns: Transaction[] = [
      { date: "2025-06-01", kind: "income", category: "milk_sales", amount: 180000 } as Transaction,
      { date: "2025-06-01", kind: "income", category: "animal_sales", amount: 90000, animalId: "m1" } as Transaction,
      { date: "2025-06-01", kind: "expense", category: "feed", amount: 100000 } as Transaction,
      { date: "2025-06-01", kind: "expense", category: "labor", amount: 50000 } as Transaction,
    ];
    const p = enterprisePnl(txns, animals, [], "2025-12-31", 365);
    expect(p.dairy.revenue).toBe(180000);
    expect(p.meat.revenue).toBe(90000);
    expect(p.dairy.feed).toBe(60000); // 600/1000 of 100k
    expect(p.meat.feed).toBe(40000);
    expect(p.sharedOverhead).toBe(50000); // labour not split
    expect(p.dairy.grossMargin).toBe(120000); // 180k - 60k
    expect(p.meat.grossMargin).toBe(50000); // 90k - 40k
    expect(p.net).toBe(120000); // 120k + 50k - 50k overhead
  });
});

describe("feedMetrics daysCover", () => {
  const feedItem = (over: Partial<FeedItem>): FeedItem =>
    ({
      id: "f",
      farmId: "x",
      name: "f",
      nameAr: "f",
      category: "concentrate",
      unit: "kg",
      stock: 0,
      reorderLevel: 0,
      costPerUnit: 1,
      supplierId: "s",
      ...over,
    }) as FeedItem;

  it("counts feed of every unit toward days-of-cover, not only tons", () => {
    // 300 kg on hand, burning 10 kg/day (300 kg over the last 30 days) → 30 days.
    // The old bug summed only ton-denominated stock, so a kg-only store read 0.
    const items = [feedItem({ unit: "kg", stock: 300 })];
    const consumption = [
      { date: "2026-08-01", kg: 300, cost: 300, rationId: "r" },
    ] as unknown as FeedConsumption[];
    const m = feedMetrics(items, consumption, [], "2026-08-01");
    expect(m.daysCover).toBe(30);
  });
});

/* ------------------------------------------------------------------------- */

const milkPoint = (over: Partial<DailyMilkPoint>): DailyMilkPoint =>
  ({
    date: "2025-06-01",
    morningL: 0,
    eveningL: 0,
    totalL: 0,
    rejectedL: 0,
    avgFat: 0,
    avgProtein: 0,
    milkingCows: 0,
    ...over,
  }) as DailyMilkPoint;

describe("milkSummary", () => {
  it("reads today's point, per-cow yield and the month total", () => {
    const daily = [
      milkPoint({ date: "2025-06-01", totalL: 100, milkingCows: 50 }),
      milkPoint({ date: "2025-06-02", totalL: 200, milkingCows: 100 }),
    ];
    const s = milkSummary(daily, "2025-06-02");
    expect(s.today).toBe(200);
    expect(s.perCowToday).toBe(2); // 200 / 100
    expect(s.monthTotal).toBe(300); // both June points
    expect(s.avg30).toBe(150); // (100 + 200) / 2
    expect(s.milkingCows).toBe(100);
    expect(s.deltaPct).toBe(0); // no prior 30-day window
  });

  it("falls back to the last point when today isn't recorded", () => {
    const daily = [milkPoint({ date: "2025-06-01", totalL: 120, milkingCows: 60 })];
    const s = milkSummary(daily, "2025-06-09"); // no point for today
    expect(s.today).toBe(120);
    expect(s.perCowToday).toBe(2);
  });

  it("guards per-cow division when a day recorded zero milking cows", () => {
    const daily = [milkPoint({ date: "2025-06-01", totalL: 80, milkingCows: 0 })];
    expect(milkSummary(daily, "2025-06-01").perCowToday).toBe(80); // /max(1,0)
  });

  it("computes the 30-vs-prior-30 delta over a 60-day series", () => {
    // First 30 days at 100 L, next 30 at 110 L → +10%.
    const daily = Array.from({ length: 60 }, (_, i) =>
      milkPoint({ date: addDays("2025-01-01", i), totalL: i < 30 ? 100 : 110, milkingCows: 50 }),
    );
    const s = milkSummary(daily, addDays("2025-01-01", 59));
    expect(s.avg30).toBe(110);
    expect(s.deltaPct).toBe(10); // (110 - 100) / 100 * 100
  });
});

describe("forecastMilk", () => {
  it("returns an empty series with no history", () => {
    expect(forecastMilk([])).toEqual([]);
  });

  it("projects a flat series forward at its level for the given horizon", () => {
    const daily = Array.from({ length: 45 }, (_, i) =>
      milkPoint({ date: addDays("2025-01-01", i), totalL: 100 }),
    );
    const last = addDays("2025-01-01", 44);
    const f = forecastMilk(daily, 14);
    expect(f).toHaveLength(14);
    expect(f[0].date).toBe(addDays(last, 1)); // day after the last actual
    expect(f[13].date).toBe(addDays(last, 14));
    expect(f.every((p) => p.forecastL === 100)).toBe(true); // flat in → flat out
  });

  it("applies the heat penalty as a proportional haircut", () => {
    const daily = Array.from({ length: 45 }, (_, i) =>
      milkPoint({ date: addDays("2025-01-01", i), totalL: 100 }),
    );
    const f = forecastMilk(daily, 3, 10); // 10% penalty
    expect(f.every((p) => p.forecastL === 90)).toBe(true);
  });
});

const breedingEvent = (over: Partial<BreedingEvent>): BreedingEvent =>
  ({ id: "b", farmId: "f", animalId: "a", type: "heat", date: "2025-06-01", ...over }) as BreedingEvent;

describe("breedingMetrics", () => {
  const today = "2025-12-31";

  it("scores conception, services-per-conception and calf survival over the rolling year", () => {
    const events: BreedingEvent[] = [
      breedingEvent({ type: "heat", date: "2025-06-01" }),
      breedingEvent({ type: "ai", date: "2025-06-01" }),
      breedingEvent({ type: "ai", date: "2025-07-01" }),
      breedingEvent({ type: "pregnancy_check", date: "2025-08-01", result: "pregnant" }),
      breedingEvent({ type: "calving", date: "2025-09-01", outcome: "live" }),
      breedingEvent({ type: "calving", date: "2025-09-15", outcome: "stillbirth" }),
      breedingEvent({ type: "ai", date: "2020-01-01" }), // outside the 365-day window
    ];
    const animals: Animal[] = [
      animal({ id: "d1", sex: "female", isCalf: false, reproStatus: "pregnant", expectedCalvingDate: "2026-01-05" }),
      animal({ id: "d2", sex: "female", isCalf: false, reproStatus: "open" }),
    ];
    const m = breedingMetrics(events, animals, today);

    expect(m.heats).toBe(1);
    expect(m.inseminations).toBe(2); // the stale 2020 AI is excluded
    expect(m.checks).toBe(1);
    expect(m.conceptionRate).toBe(50); // 1 confirmed / 2 inseminations
    expect(m.servicesPerConception).toBe(2); // 2 / 1
    expect(m.calvings).toBe(2);
    expect(m.stillbirths).toBe(1);
    expect(m.calfSurvival).toBe(50); // 100 - 50% stillbirth
    expect(m.dueThisWeek).toBe(1); // due 2026-01-05, 5 days out
    expect(m.dueThisMonth).toBe(1);
    expect(m.pregnancyRate).toBe(50); // 1 pregnant / 2 breeding females
  });

  it("does not divide by zero with no inseminations or calvings", () => {
    const m = breedingMetrics([breedingEvent({ type: "heat" })], [], today);
    expect(m.conceptionRate).toBe(0);
    expect(m.servicesPerConception).toBe(0);
    expect(m.calfSurvival).toBe(100); // no calvings → no losses
  });
});

describe("financeMetrics", () => {
  const txn = (over: Partial<Transaction>): Transaction =>
    ({ id: "t", farmId: "f", date: "2025-06-05", kind: "income", category: "milk_sales", amount: 0, description: "", paymentMethod: "cash", ...over }) as Transaction;

  it("separates this month from last, with margin and deltas", () => {
    const txns: Transaction[] = [
      txn({ date: "2025-06-05", kind: "income", amount: 100000 }),
      txn({ date: "2025-06-10", kind: "expense", category: "feed", amount: 40000 }),
      txn({ date: "2025-05-20", kind: "income", amount: 80000 }),
      txn({ date: "2025-05-20", kind: "expense", category: "feed", amount: 20000 }),
    ];
    const m = financeMetrics(txns, "2025-06-15", 1000);
    expect(m.revenue).toBe(100000);
    expect(m.expenses).toBe(40000);
    expect(m.profit).toBe(60000);
    expect(m.margin).toBe(60); // 60000 / 100000
    expect(m.revenueDelta).toBe(25); // (100k - 80k) / 80k
    expect(m.expenseDelta).toBe(100); // (40k - 20k) / 20k
    // Cost per litre uses all expenses within 30 days (both rows: 5 and 26 days out).
    expect(m.costPerLiter).toBe(60); // (40000 + 20000) / 1000
  });

  it("zeroes deltas and margin when there is no baseline", () => {
    const m = financeMetrics([], "2025-06-15", 0);
    expect(m).toMatchObject({ revenue: 0, expenses: 0, profit: 0, margin: 0, revenueDelta: 0, expenseDelta: 0, costPerLiter: 0 });
  });
});
