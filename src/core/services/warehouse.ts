/**
 * Multi-store stock (المخازن).
 *
 * `InventoryItem.stock` stays the authoritative total on hand — every existing
 * screen, reorder alert and purchase already maintains it. What's derived here
 * is *where* that stock sits, by replaying the movements per store.
 *
 * The two can disagree: movements written before stores existed carry no
 * warehouseId, and a farm's opening stock never had a movement at all. Rather
 * than show a total that contradicts the item card, anything the movements
 * can't account for is reported as sitting in the default store. That keeps the
 * per-store figures summing to the item's real total, always.
 */

import type { ID, InventoryItem, StockMovement, Warehouse } from "@/core/domain/types";
import { round } from "@/lib/utils";

/** The store that unassigned movements belong to. */
export const DEFAULT_WAREHOUSE_ID = "wh_main";

/** Signed effect of a movement on stock — the same rule the repositories apply. */
export function movementDelta(m: Pick<StockMovement, "kind" | "quantity">): number {
  if (m.kind === "in") return Math.abs(m.quantity);
  if (m.kind === "adjustment") return m.quantity; // already signed
  return -Math.abs(m.quantity); // out, waste
}

/** Which store a movement counts against. */
export function warehouseOf(m: Pick<StockMovement, "warehouseId">, fallback = DEFAULT_WAREHOUSE_ID): ID {
  return m.warehouseId ?? fallback;
}

export interface StoreQuantity {
  warehouseId: ID;
  quantity: number;
}

/**
 * Where one item's stock sits. Movements decide the split; whatever they don't
 * explain is attributed to the default store so the parts equal the whole.
 */
export function itemStockByWarehouse(
  item: Pick<InventoryItem, "id" | "stock">,
  movements: StockMovement[],
  defaultWarehouseId = DEFAULT_WAREHOUSE_ID,
): StoreQuantity[] {
  const byStore = new Map<ID, number>();
  for (const m of movements) {
    if (m.itemId !== item.id) continue;
    const id = warehouseOf(m, defaultWarehouseId);
    byStore.set(id, (byStore.get(id) ?? 0) + movementDelta(m));
  }

  const explained = [...byStore.values()].reduce((s, q) => s + q, 0);
  const unexplained = round((item.stock ?? 0) - explained, 2);
  if (unexplained !== 0) {
    byStore.set(defaultWarehouseId, round((byStore.get(defaultWarehouseId) ?? 0) + unexplained, 2));
  }

  return [...byStore.entries()]
    .map(([warehouseId, quantity]) => ({ warehouseId, quantity: round(quantity, 2) }))
    .filter((r) => r.quantity !== 0)
    .sort((a, b) => a.warehouseId.localeCompare(b.warehouseId));
}

/** How much of an item a single store holds. */
export function stockInWarehouse(
  item: Pick<InventoryItem, "id" | "stock">,
  warehouseId: ID,
  movements: StockMovement[],
  defaultWarehouseId = DEFAULT_WAREHOUSE_ID,
): number {
  const row = itemStockByWarehouse(item, movements, defaultWarehouseId).find(
    (r) => r.warehouseId === warehouseId,
  );
  return row?.quantity ?? 0;
}

/** Total value of what each store holds, for the stores overview. */
export function warehouseValue(
  warehouseId: ID,
  items: InventoryItem[],
  movements: StockMovement[],
  defaultWarehouseId = DEFAULT_WAREHOUSE_ID,
): number {
  return round(
    items.reduce(
      (sum, item) =>
        sum + stockInWarehouse(item, warehouseId, movements, defaultWarehouseId) * (item.unitCost ?? 0),
      0,
    ),
    2,
  );
}

/* ------------------------------- Stock ledger ------------------------------ */

export interface LedgerRow {
  movement: StockMovement;
  delta: number;
  /** Quantity on hand after this movement. */
  running: number;
}

/**
 * حركة صنف — one item's movements oldest-first with a running quantity.
 *
 * The running total is walked forward from the earliest movement, so it ends at
 * whatever the movements account for — not necessarily the item's stock figure
 * (see the note at the top of this file).
 */
export function stockLedger(
  itemId: ID,
  movements: StockMovement[],
  opts: { warehouseId?: ID } = {},
): { rows: LedgerRow[]; closing: number } {
  const relevant = movements
    .filter((m) => m.itemId === itemId)
    .filter((m) => !opts.warehouseId || warehouseOf(m) === opts.warehouseId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  let running = 0;
  const rows = relevant.map((movement) => {
    const delta = movementDelta(movement);
    running = round(running + delta, 2);
    return { movement, delta, running };
  });
  return { rows, closing: running };
}

/* --------------------------------- Stocktake ------------------------------- */

export interface StocktakeLine {
  itemId: ID;
  expected: number;
  counted: number;
  /** counted − expected: positive is a surplus, negative a shortage. */
  variance: number;
}

/** جرد — compare what's counted on the shelf against what the system expects. */
export function stocktakeVariance(
  lines: { itemId: ID; expected: number; counted: number }[],
): StocktakeLine[] {
  return lines.map((l) => ({
    ...l,
    variance: round(l.counted - l.expected, 2),
  }));
}

/** Only the lines that actually differ need an adjustment movement. */
export function stocktakeAdjustments(lines: StocktakeLine[]): StocktakeLine[] {
  return lines.filter((l) => l.variance !== 0);
}

/** The default store, creating a sensible stand-in if the farm has none yet. */
export function defaultWarehouse(warehouses: Warehouse[]): Warehouse | undefined {
  return warehouses.find((w) => w.isDefault) ?? warehouses[0];
}
