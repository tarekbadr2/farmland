import { describe, it, expect } from "vitest";

import {
  DEFAULT_WAREHOUSE_ID,
  itemStockByWarehouse,
  movementDelta,
  stockInWarehouse,
  stockLedger,
  stocktakeAdjustments,
  stocktakeVariance,
  warehouseValue,
} from "./warehouse";
import type { InventoryItem, StockMovement } from "@/core/domain/types";

const item = (id: string, stock: number, unitCost = 10): InventoryItem =>
  ({
    id,
    farmId: "f1",
    sku: id,
    name: id,
    nameAr: id,
    category: "consumables",
    unit: "kg",
    stock,
    reorderLevel: 0,
    unitCost,
    supplierId: "s1",
    location: "",
  }) as InventoryItem;

const move = (
  id: string,
  itemId: string,
  kind: StockMovement["kind"],
  quantity: number,
  warehouseId?: string,
  date = "2026-01-01",
): StockMovement => ({ id, farmId: "f1", itemId, date, kind, quantity, warehouseId });

describe("movementDelta", () => {
  it("adds on in, subtracts on out and waste, and trusts a signed adjustment", () => {
    expect(movementDelta({ kind: "in", quantity: 10 })).toBe(10);
    expect(movementDelta({ kind: "out", quantity: 4 })).toBe(-4);
    expect(movementDelta({ kind: "waste", quantity: 3 })).toBe(-3);
    expect(movementDelta({ kind: "adjustment", quantity: -6 })).toBe(-6);
    expect(movementDelta({ kind: "adjustment", quantity: 6 })).toBe(6);
  });

  it("ignores the sign given on out/in — direction comes from the kind", () => {
    expect(movementDelta({ kind: "out", quantity: -4 })).toBe(-4);
    expect(movementDelta({ kind: "in", quantity: -10 })).toBe(10);
  });
});

describe("itemStockByWarehouse", () => {
  it("splits stock across the stores its movements name", () => {
    const rows = itemStockByWarehouse(item("i1", 30), [
      move("m1", "i1", "in", 20, "wh_feed"),
      move("m2", "i1", "in", 15, "wh_vet"),
      move("m3", "i1", "out", 5, "wh_feed"),
    ]);
    expect(rows).toEqual([
      { warehouseId: "wh_feed", quantity: 15 },
      { warehouseId: "wh_vet", quantity: 15 },
    ]);
  });

  it("treats movements written before stores existed as the default store", () => {
    const rows = itemStockByWarehouse(item("i1", 12), [move("m1", "i1", "in", 12)]);
    expect(rows).toEqual([{ warehouseId: DEFAULT_WAREHOUSE_ID, quantity: 12 }]);
  });

  it("attributes stock the movements can't explain to the default store", () => {
    // Opening stock of 100 with only 20 explained by a movement.
    const rows = itemStockByWarehouse(item("i1", 100), [move("m1", "i1", "in", 20, "wh_feed")]);
    expect(rows).toEqual([
      { warehouseId: "wh_feed", quantity: 20 },
      { warehouseId: DEFAULT_WAREHOUSE_ID, quantity: 80 },
    ]);
  });

  it("always sums back to the item's own stock figure", () => {
    const it1 = item("i1", 57.5);
    const movements = [
      move("m1", "i1", "in", 20, "wh_feed"),
      move("m2", "i1", "out", 5, "wh_feed"),
      move("m3", "i1", "in", 12.5, "wh_vet"),
    ];
    const total = itemStockByWarehouse(it1, movements).reduce((s, r) => s + r.quantity, 0);
    expect(total).toBe(57.5);
  });

  it("ignores other items' movements", () => {
    const rows = itemStockByWarehouse(item("i1", 10), [
      move("m1", "i1", "in", 10, "wh_feed"),
      move("m2", "i2", "in", 999, "wh_feed"),
    ]);
    expect(rows).toEqual([{ warehouseId: "wh_feed", quantity: 10 }]);
  });
});

describe("stockInWarehouse", () => {
  it("reads one store's holding, or zero when it holds none", () => {
    const movements = [move("m1", "i1", "in", 8, "wh_feed")];
    expect(stockInWarehouse(item("i1", 8), "wh_feed", movements)).toBe(8);
    expect(stockInWarehouse(item("i1", 8), "wh_vet", movements)).toBe(0);
  });
});

describe("warehouseValue", () => {
  it("values a store at each item's unit cost", () => {
    const items = [item("i1", 10, 25), item("i2", 4, 100)];
    const movements = [
      move("m1", "i1", "in", 10, "wh_feed"),
      move("m2", "i2", "in", 4, "wh_feed"),
    ];
    // 10 × 25 + 4 × 100 = 650
    expect(warehouseValue("wh_feed", items, movements)).toBe(650);
  });
});

describe("stockLedger", () => {
  const movements = [
    move("m2", "i1", "out", 4, "wh_feed", "2026-01-05"),
    move("m1", "i1", "in", 10, "wh_feed", "2026-01-02"),
    move("m3", "i1", "in", 6, "wh_vet", "2026-01-09"),
  ];

  it("walks movements oldest-first with a running quantity", () => {
    const { rows, closing } = stockLedger("i1", movements);
    expect(rows.map((r) => r.movement.id)).toEqual(["m1", "m2", "m3"]);
    expect(rows.map((r) => r.running)).toEqual([10, 6, 12]);
    expect(closing).toBe(12);
  });

  it("can follow a single store", () => {
    const { rows, closing } = stockLedger("i1", movements, { warehouseId: "wh_feed" });
    expect(rows.map((r) => r.movement.id)).toEqual(["m1", "m2"]);
    expect(closing).toBe(6);
  });
});

describe("stocktake", () => {
  it("reports a surplus and a shortage against what was expected", () => {
    const lines = stocktakeVariance([
      { itemId: "i1", expected: 100, counted: 96 },
      { itemId: "i2", expected: 40, counted: 43 },
      { itemId: "i3", expected: 12, counted: 12 },
    ]);
    expect(lines[0].variance).toBe(-4);
    expect(lines[1].variance).toBe(3);
    expect(lines[2].variance).toBe(0);
  });

  it("only the differing lines need an adjustment", () => {
    const lines = stocktakeVariance([
      { itemId: "i1", expected: 100, counted: 96 },
      { itemId: "i3", expected: 12, counted: 12 },
    ]);
    expect(stocktakeAdjustments(lines).map((l) => l.itemId)).toEqual(["i1"]);
  });

  it("a counted-to-expected adjustment lands the item exactly on the count", () => {
    const [line] = stocktakeVariance([{ itemId: "i1", expected: 100, counted: 96 }]);
    // Applying the variance as a signed adjustment reaches the counted figure.
    expect(100 + movementDelta({ kind: "adjustment", quantity: line.variance })).toBe(96);
  });
});
