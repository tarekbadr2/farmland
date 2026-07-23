import { describe, it, expect } from "vitest";

import {
  allocateOutputCosts,
  checkWorkOrder,
  stockOf,
  unitCostOf,
  workOrderCost,
  workOrderNumber,
  type StockLookup,
} from "./production";
import type { FeedItem, InventoryItem, WorkOrder } from "@/core/domain/types";

const inv = (id: string, stock: number, unitCost: number): InventoryItem =>
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

const feed = (id: string, stock: number, costPerUnit: number): FeedItem =>
  ({
    id,
    farmId: "f1",
    name: id,
    nameAr: id,
    category: "concentrate",
    unit: "kg",
    stock,
    reorderLevel: 0,
    costPerUnit,
    supplierId: "s1",
    dryMatterPct: 90,
    proteinPct: 16,
    energyMcalPerKg: 2.8,
  }) as FeedItem;

const STOCK: StockLookup = {
  inventory: [inv("cheese", 0, 0), inv("salt", 100, 5), inv("rennet", 10, 200)],
  feed: [feed("bran", 1_000, 4), feed("maize", 500, 9), feed("ration", 0, 0)],
};

const order = (over: Partial<WorkOrder> = {}): WorkOrder =>
  ({
    id: "wo1",
    farmId: "f1",
    number: "WO-2026-0001",
    date: "2026-08-01",
    name: "Make cheese",
    status: "planned",
    inputs: [{ source: "inventory", itemId: "salt", quantity: 10 }],
    outputs: [{ source: "inventory", itemId: "cheese", quantity: 5 }],
    ...over,
  }) as WorkOrder;

describe("unit cost / stock lookup across both lists", () => {
  it("reads unitCost from inventory and costPerUnit from feed", () => {
    expect(unitCostOf({ source: "inventory", itemId: "salt" }, STOCK)).toBe(5);
    expect(unitCostOf({ source: "feed", itemId: "maize" }, STOCK)).toBe(9);
  });

  it("reads on-hand quantity from either list", () => {
    expect(stockOf({ source: "inventory", itemId: "salt" }, STOCK)).toBe(100);
    expect(stockOf({ source: "feed", itemId: "bran" }, STOCK)).toBe(1_000);
  });

  it("returns zero for an item it doesn't know", () => {
    expect(unitCostOf({ source: "inventory", itemId: "ghost" }, STOCK)).toBe(0);
    expect(stockOf({ source: "feed", itemId: "ghost" }, STOCK)).toBe(0);
  });
});

describe("workOrderCost", () => {
  it("rolls materials into a cost per unit produced", () => {
    // 10 salt × 5 = 50 over 5 units of cheese = 10 each.
    const c = workOrderCost(order(), STOCK);
    expect(c.materialCost).toBe(50);
    expect(c.totalCost).toBe(50);
    expect(c.outputQuantity).toBe(5);
    expect(c.unitCost).toBe(10);
  });

  it("adds overhead on top of materials", () => {
    // (50 materials + 25 labour) / 5 = 15 each.
    const c = workOrderCost(order({ overheadCost: 25 }), STOCK);
    expect(c.materialCost).toBe(50);
    expect(c.overheadCost).toBe(25);
    expect(c.totalCost).toBe(75);
    expect(c.unitCost).toBe(15);
  });

  it("mixes inputs from both stock lists", () => {
    // 100 bran × 4 = 400, plus 50 maize × 9 = 450 → 850 over 150 kg of ration.
    const c = workOrderCost(
      order({
        inputs: [
          { source: "feed", itemId: "bran", quantity: 100 },
          { source: "feed", itemId: "maize", quantity: 50 },
        ],
        outputs: [{ source: "feed", itemId: "ration", quantity: 150 }],
      }),
      STOCK,
    );
    expect(c.materialCost).toBe(850);
    expect(c.unitCost).toBeCloseTo(5.67, 2);
  });

  it("doesn't divide by zero when nothing is produced", () => {
    const c = workOrderCost(order({ outputs: [] }), STOCK);
    expect(c.outputQuantity).toBe(0);
    expect(c.unitCost).toBe(0);
  });
});

describe("allocateOutputCosts", () => {
  it("gives a single output the whole cost", () => {
    const [out] = allocateOutputCosts(order({ overheadCost: 25 }), STOCK);
    expect(out.cost).toBe(75);
    expect(out.unitCost).toBe(15);
  });

  it("splits joint outputs by quantity share", () => {
    // 50 of cost over 5 cheese + 15 whey = 20 units → 2.50 per unit.
    const allocated = allocateOutputCosts(
      order({
        outputs: [
          { source: "inventory", itemId: "cheese", quantity: 5 },
          { source: "inventory", itemId: "rennet", quantity: 15 },
        ],
      }),
      STOCK,
    );
    expect(allocated[0].cost).toBe(12.5);
    expect(allocated[1].cost).toBe(37.5);
    expect(allocated.every((a) => a.unitCost === 2.5)).toBe(true);
  });

  it("allocates the whole cost and nothing more", () => {
    const o = order({
      overheadCost: 31,
      outputs: [
        { source: "inventory", itemId: "cheese", quantity: 7 },
        { source: "inventory", itemId: "rennet", quantity: 3 },
      ],
    });
    const total = workOrderCost(o, STOCK).totalCost;
    const allocated = allocateOutputCosts(o, STOCK).reduce((s, a) => s + a.cost, 0);
    expect(allocated).toBeCloseTo(total, 2);
  });
});

describe("checkWorkOrder", () => {
  it("accepts a runnable order", () => {
    expect(checkWorkOrder(order(), STOCK).ok).toBe(true);
  });

  it("refuses an order with no inputs or no outputs", () => {
    expect(checkWorkOrder(order({ inputs: [] }), STOCK).errors).toContain("no-inputs");
    expect(checkWorkOrder(order({ outputs: [] }), STOCK).errors).toContain("no-outputs");
  });

  it("refuses to run one that's already done or cancelled", () => {
    expect(checkWorkOrder(order({ status: "done" }), STOCK).errors).toContain("already-completed");
    expect(checkWorkOrder(order({ status: "cancelled" }), STOCK).errors).toContain("cancelled");
  });

  it("refuses zero or negative quantities", () => {
    expect(
      checkWorkOrder(order({ inputs: [{ source: "inventory", itemId: "salt", quantity: 0 }] }), STOCK)
        .errors,
    ).toContain("non-positive-quantity");
  });

  it("refuses an item that is both consumed and produced — the cost would be circular", () => {
    const r = checkWorkOrder(
      order({
        inputs: [{ source: "inventory", itemId: "salt", quantity: 5 }],
        outputs: [{ source: "inventory", itemId: "salt", quantity: 5 }],
      }),
      STOCK,
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("input-is-also-output");
  });

  it("reports exactly what's short rather than a bare failure", () => {
    const r = checkWorkOrder(
      order({ inputs: [{ source: "inventory", itemId: "rennet", quantity: 25 }] }),
      STOCK,
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("insufficient-stock");
    expect(r.shortages).toHaveLength(1);
    expect(r.shortages[0]).toMatchObject({ available: 10, short: 15 });
  });
});

describe("workOrderNumber", () => {
  it("numbers by year", () => {
    expect(workOrderNumber("2026-08-01", 3)).toBe("WO-2026-0003");
  });
});
