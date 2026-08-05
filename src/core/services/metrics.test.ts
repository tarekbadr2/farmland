import { describe, it, expect } from "vitest";

import {
  animalEconomics,
  assetBookValue,
  assetsSummary,
  utilityCostSummary,
  enterprisePnl,
  feedMetrics,
} from "./metrics";
import type {
  Animal,
  Asset,
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
