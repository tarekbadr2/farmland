/**
 * Purchase analytics — pure aggregations over the recorded purchase log.
 *
 * Purchases are what the farm actually bought (item, quantity, real price paid);
 * these functions turn that log into the spend and price views the Purchases
 * screen shows. No I/O, so the same numbers serve the UI, reports and tests.
 */

import type { Purchase } from "@/core/domain/types";
import { round } from "@/lib/utils";

export function totalSpend(purchases: Purchase[]): number {
  return round(
    purchases.reduce((s, p) => s + p.total, 0),
    2,
  );
}

/** Spend per calendar month (YYYY-MM), oldest first — for the trend chart. */
export function spendByMonth(purchases: Purchase[]): { month: string; total: number }[] {
  const map = new Map<string, number>();
  for (const p of purchases) {
    const m = p.date.slice(0, 7);
    map.set(m, (map.get(m) ?? 0) + p.total);
  }
  return [...map.entries()]
    .map(([month, total]) => ({ month, total: round(total, 2) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Spend per supplier, biggest first. Purchases with no supplier group under "". */
export function spendBySupplier(
  purchases: Purchase[],
): { supplierId: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const p of purchases) {
    const k = p.supplierId ?? "";
    const cur = map.get(k) ?? { total: 0, count: 0 };
    cur.total += p.total;
    cur.count += 1;
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([supplierId, v]) => ({ supplierId, total: round(v.total, 2), count: v.count }))
    .sort((a, b) => b.total - a.total);
}

/** Spend + quantity per item, biggest spend first. */
export function spendByItem(
  purchases: Purchase[],
): { itemId: string; itemName: string; total: number; quantity: number }[] {
  const map = new Map<string, { name: string; total: number; qty: number }>();
  for (const p of purchases) {
    const cur = map.get(p.itemId) ?? { name: p.itemName, total: 0, qty: 0 };
    cur.total += p.total;
    cur.qty += p.quantity;
    map.set(p.itemId, cur);
  }
  return [...map.entries()]
    .map(([itemId, v]) => ({
      itemId,
      itemName: v.name,
      total: round(v.total, 2),
      quantity: round(v.qty, 2),
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * The most recent unit price paid to a supplier for an item — used to pre-fill
 * a repeat purchase. Undefined when that pair was never bought.
 */
export function lastSupplierPrice(
  purchases: Purchase[],
  supplierId: string,
  itemId: string,
): number | undefined {
  let best: Purchase | undefined;
  for (const p of purchases) {
    if (p.itemId !== itemId || p.supplierId !== supplierId) continue;
    if (!best || p.date > best.date) best = p;
  }
  return best?.unitCost;
}

/** Price paid for an item over time (oldest first) — for a price-trend view. */
export function priceHistory(
  purchases: Purchase[],
  itemId: string,
): { date: string; unitCost: number; supplierId?: string }[] {
  return purchases
    .filter((p) => p.itemId === itemId)
    .map((p) => ({ date: p.date, unitCost: p.unitCost, supplierId: p.supplierId }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
