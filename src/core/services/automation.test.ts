import { describe, it, expect } from "vitest";

import {
  FEED_EXPENSE_CATEGORY,
  INVENTORY_EXPENSE_CATEGORY,
  blendedUnitCost,
  livestockAssetFor,
  purchaseTotal,
} from "./automation";
import type { Animal } from "@/core/domain/types";

/**
 * `blendedUnitCost` sets the carrying cost that flows into every later feed
 * costing, COGS and inventory balance-sheet value — an unguarded regression here
 * silently mis-values stock with no error surfaced. These tests pin the weighted
 * average, the empty-stock fallback and 2-dp rounding, plus the purchase-to-
 * asset mapping for bought livestock.
 */

describe("purchaseTotal", () => {
  it("multiplies quantity by unit cost, rounded to 2dp", () => {
    expect(purchaseTotal({ quantity: 3, unitCost: 1250 })).toBe(3750);
    expect(purchaseTotal({ quantity: 2.5, unitCost: 10.1 })).toBe(25.25);
  });

  it("does not accumulate binary-float error", () => {
    expect(purchaseTotal({ quantity: 3, unitCost: 0.1 })).toBe(0.3);
  });
});

describe("blendedUnitCost (moving average)", () => {
  it("blends two equal lots to their midpoint", () => {
    // 100 @ 10 + 100 @ 20 → 15.00
    expect(blendedUnitCost(100, 10, 100, 20)).toBe(15);
  });

  it("moves the average proportionally, not fully, on a large cheap delivery", () => {
    // 100 @ 20 (existing) + 300 @ 10 (delivery) → (2000 + 3000) / 400 = 12.5
    expect(blendedUnitCost(100, 20, 300, 10)).toBe(12.5);
  });

  it("returns the new unit cost when there is no existing stock", () => {
    expect(blendedUnitCost(0, 0, 50, 8)).toBe(8);
  });

  it("returns the new unit cost when combined quantity is non-positive", () => {
    // e.g. a correction against negative on-hand — fall back to the fresh price.
    expect(blendedUnitCost(-50, 12, 10, 9)).toBe(9);
  });

  it("rounds the blended cost to 2 decimal places", () => {
    // (1 * 10 + 2 * 11) / 3 = 10.6666… → 10.67
    expect(blendedUnitCost(1, 10, 2, 11)).toBe(10.67);
  });
});

describe("expense category mapping", () => {
  it("routes each inventory category to a transaction category", () => {
    expect(INVENTORY_EXPENSE_CATEGORY.medicine).toBe("medicine");
    expect(INVENTORY_EXPENSE_CATEGORY.fuel).toBe("fuel");
    expect(INVENTORY_EXPENSE_CATEGORY.tools).toBe("maintenance");
    expect(INVENTORY_EXPENSE_CATEGORY.equipment).toBe("maintenance");
  });

  it("always books feed to feed", () => {
    expect(FEED_EXPENSE_CATEGORY).toBe("feed");
  });
});

describe("livestockAssetFor", () => {
  const animal = (over: Partial<Animal> = {}): Animal =>
    ({
      id: "a1",
      farmId: "f1",
      tag: "A1",
      name: "Bessie",
      nameAr: "بسي",
      sex: "female",
      status: "active",
      dateOfBirth: "2024-01-01",
      acquisitionCost: 18000,
      acquiredAt: "2025-06-01",
      ...over,
    }) as Animal;

  it("builds a livestock asset from an animal bought with a price", () => {
    const asset = livestockAssetFor(animal());
    expect(asset).not.toBeNull();
    expect(asset!.id).toBe("asset_animal_a1"); // deterministic → updates, never duplicates
    expect(asset!.category).toBe("livestock");
    expect(asset!.cost).toBe(18000);
    expect(asset!.acquiredDate).toBe("2025-06-01");
    expect(asset!.status).toBe("active");
  });

  it("returns null for a home-bred animal with no acquisition cost", () => {
    expect(livestockAssetFor(animal({ acquisitionCost: 0 }))).toBeNull();
    expect(livestockAssetFor(animal({ acquisitionCost: undefined }))).toBeNull();
  });

  it("marks a departed animal's asset disposed", () => {
    expect(livestockAssetFor(animal({ status: "sold" }))!.status).toBe("disposed");
    expect(livestockAssetFor(animal({ status: "dead" }))!.status).toBe("disposed");
    expect(livestockAssetFor(animal({ status: "culled" }))!.status).toBe("disposed");
  });

  it("falls back to date of birth when there is no acquired-at date", () => {
    expect(livestockAssetFor(animal({ acquiredAt: undefined }))!.acquiredDate).toBe("2024-01-01");
  });
});
