import { describe, expect, it } from "vitest";

import {
  lastSupplierPrice,
  priceHistory,
  spendByItem,
  spendByMonth,
  spendBySupplier,
  totalSpend,
} from "./purchasing";
import type { Purchase } from "@/core/domain/types";

const p = (over: Partial<Purchase>): Purchase =>
  ({
    id: "x",
    farmId: "f",
    date: "2026-05-10",
    kind: "feed",
    itemId: "i1",
    itemName: "Alfalfa",
    supplierId: "s1",
    quantity: 10,
    unit: "kg",
    unitCost: 5,
    total: 50,
    paymentMethod: "cash",
    ...over,
  }) as Purchase;

const data: Purchase[] = [
  p({ date: "2026-05-10", itemId: "i1", supplierId: "s1", total: 50, unitCost: 5, quantity: 10 }),
  p({ date: "2026-05-20", itemId: "i1", supplierId: "s1", total: 66, unitCost: 6, quantity: 11 }),
  p({ date: "2026-06-01", itemId: "i2", supplierId: "s2", total: 200, unitCost: 20, quantity: 10 }),
  p({ date: "2026-06-15", itemId: "i1", supplierId: "s2", total: 40, unitCost: 4, quantity: 10 }),
];

describe("purchase analytics", () => {
  it("totals spend", () => {
    expect(totalSpend(data)).toBe(356);
  });

  it("groups spend by month, oldest first", () => {
    expect(spendByMonth(data)).toEqual([
      { month: "2026-05", total: 116 },
      { month: "2026-06", total: 240 },
    ]);
  });

  it("groups spend by supplier, biggest first", () => {
    expect(spendBySupplier(data)).toEqual([
      { supplierId: "s2", total: 240, count: 2 },
      { supplierId: "s1", total: 116, count: 2 },
    ]);
  });

  it("groups spend + quantity by item", () => {
    const byItem = spendByItem(data);
    expect(byItem[0]).toEqual({ itemId: "i2", itemName: "Alfalfa", total: 200, quantity: 10 });
    expect(byItem.find((x) => x.itemId === "i1")).toEqual({
      itemId: "i1",
      itemName: "Alfalfa",
      total: 156,
      quantity: 31,
    });
  });

  it("returns the most recent price for a supplier+item pair", () => {
    expect(lastSupplierPrice(data, "s1", "i1")).toBe(6); // 05-20 beats 05-10
    expect(lastSupplierPrice(data, "s2", "i1")).toBe(4);
    expect(lastSupplierPrice(data, "s1", "iX")).toBeUndefined();
  });

  it("returns an item's price history oldest first", () => {
    expect(priceHistory(data, "i1").map((h) => h.unitCost)).toEqual([5, 6, 4]);
  });

  it("groups purchases with no supplier under an empty key", () => {
    expect(spendBySupplier([p({ supplierId: undefined, total: 30 })])).toEqual([
      { supplierId: "", total: 30, count: 1 },
    ]);
  });
});
