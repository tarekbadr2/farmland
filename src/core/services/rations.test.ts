import { describe, expect, it } from "vitest";

import {
  normalizeRation,
  percentTotal,
  isBalancedMix,
  resolveFeeding,
  rationCostPerHead,
  rationCostPerKg,
} from "./rations";
import type { FeedItem, FeedRation } from "@/core/domain/types";

const feed = (id: string, costPerUnit: number, unit: FeedItem["unit"] = "kg"): FeedItem => ({
  id,
  farmId: "f1",
  name: id,
  nameAr: id,
  category: "concentrate",
  unit,
  stock: 1000,
  reorderLevel: 0,
  costPerUnit,
  supplierId: "s1",
  dryMatterPct: 90,
  proteinPct: 18,
  energyMcalPerKg: 2.5,
});

const feeds = [feed("a", 10), feed("b", 4), feed("c", 5000, "ton")]; // c = 5/kg

const ration = (over: Partial<FeedRation> = {}): FeedRation => ({
  id: "r1",
  farmId: "f1",
  name: "Test",
  nameAr: "Test",
  targetGroup: "lactating",
  kgPerHead: 10,
  components: [
    { feedItemId: "a", percent: 40 },
    { feedItemId: "b", percent: 60 },
  ],
  costPerHead: 0,
  ...over,
});

describe("normalizeRation", () => {
  it("converts legacy kg-per-component rations to a total + percentages", () => {
    const legacy = {
      id: "r",
      farmId: "f1",
      name: "Legacy",
      nameAr: "Legacy",
      targetGroup: "dry",
      components: [
        { feedItemId: "a", kgPerHead: 20 },
        { feedItemId: "b", kgPerHead: 30 },
      ],
      costPerHead: 100,
    } as unknown as FeedRation;

    const n = normalizeRation(legacy);
    expect(n.kgPerHead).toBe(50);
    expect(n.components).toEqual([
      { feedItemId: "a", percent: 40 },
      { feedItemId: "b", percent: 60 },
    ]);
  });

  it("passes an already-current ration through unchanged", () => {
    const r = ration();
    const n = normalizeRation(r);
    expect(n.kgPerHead).toBe(10);
    expect(n.components).toEqual(r.components);
  });

  it("does not crash on an empty ration", () => {
    const n = normalizeRation({ components: [] } as unknown as FeedRation);
    expect(n.kgPerHead).toBe(0);
    expect(n.components).toEqual([]);
  });
});

describe("percentTotal / isBalancedMix", () => {
  it("sums shares and flags balance within rounding slack", () => {
    expect(percentTotal([{ percent: 40 }, { percent: 60 }])).toBe(100);
    expect(isBalancedMix([{ percent: 40 }, { percent: 60 }])).toBe(true);
    expect(isBalancedMix([{ percent: 40 }, { percent: 50 }])).toBe(false);
    expect(isBalancedMix([{ percent: 33.3 }, { percent: 33.3 }, { percent: 33.4 }])).toBe(true);
  });
});

describe("resolveFeeding", () => {
  it("splits the total kg/head by weight and costs each from live prices", () => {
    const { lines, totalKg, totalCost } = resolveFeeding(ration(), 5, feeds);
    // a: 10*0.4*5 = 20kg @10 = 200; b: 10*0.6*5 = 30kg @4 = 120
    expect(totalKg).toBe(50);
    expect(totalCost).toBe(320);
    expect(lines).toEqual([
      { feedItemId: "a", kg: 20, cost: 200 },
      { feedItemId: "b", kg: 30, cost: 120 },
    ]);
  });

  it("honours a per-feeding kg/head override", () => {
    const { totalKg, totalCost } = resolveFeeding(ration(), 5, feeds, { kgPerHead: 20 });
    expect(totalKg).toBe(100);
    expect(totalCost).toBe(640);
  });

  it("honours a per-feeding mix override", () => {
    const { totalKg, totalCost } = resolveFeeding(ration(), 1, feeds, {
      mix: [{ feedItemId: "c", percent: 100 }],
    });
    // 10kg of c @ 5/kg = 50
    expect(totalKg).toBe(10);
    expect(totalCost).toBe(50);
  });
});

describe("rationCostPerHead / rationCostPerKg", () => {
  it("prices one head and one kilogram of the blend", () => {
    // a: 4kg@10=40; b: 6kg@4=24 → 64/head over 10kg → 6.4/kg
    expect(rationCostPerHead(ration(), feeds)).toBe(64);
    expect(rationCostPerKg(ration(), feeds)).toBe(6.4);
  });

  it("prices per-kg by the kg actually drawn, not the nominal kg (mix ≠ 100%)", () => {
    // Components sum to 50%, so only 5 of the 10 kg/head is drawn.
    const half = ration({
      components: [
        { feedItemId: "a", percent: 20 },
        { feedItemId: "b", percent: 30 },
      ],
    });
    // a: 2kg@10=20; b: 3kg@4=12 → 32 over 5kg drawn → 6.4/kg.
    // Dividing by the nominal 10kg would understate cost to 3.2 (the bug).
    expect(rationCostPerKg(half, feeds)).toBe(6.4);
  });
});
