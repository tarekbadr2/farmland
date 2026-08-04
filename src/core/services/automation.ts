/**
 * What each operational event does to the money.
 *
 * The farm should only ever record the *operational* fact — "I bought 3 tons of
 * bran", "the tractor was serviced", "I bought a heifer for 18,000" — and the
 * financial consequence should follow by itself. This module is the single
 * place that decides which of those becomes an expense and which becomes a
 * capital asset, so the rule lives in one readable spot instead of being
 * scattered across dialogs.
 */

import type {
  Animal,
  Asset,
  ID,
  InventoryCategory,
  Transaction,
  TxnCategory,
} from "@/core/domain/types";

/**
 * Buying stock is an operating cost, booked under the category the item
 * belongs to. (Strictly, stock is an asset until consumed — this follows the
 * simpler expense-on-purchase treatment the farm asked for.)
 */
export const INVENTORY_EXPENSE_CATEGORY: Record<InventoryCategory, TxnCategory> = {
  medicine: "medicine",
  equipment: "maintenance",
  cleaning: "other_expense",
  tools: "maintenance",
  fuel: "fuel",
  parts: "maintenance",
  consumables: "other_expense",
};

/** Feed always books to feed, whatever the fodder type. */
export const FEED_EXPENSE_CATEGORY: TxnCategory = "feed";

export interface PurchaseInput {
  kind: "feed" | "inventory";
  itemId: ID;
  quantity: number;
  /** Price per unit paid on this purchase. */
  unitCost: number;
  date: string;
  supplierId?: ID;
  /** Store the purchased stock lands in. Defaults to the main store when unset. */
  warehouseId?: ID;
  paymentMethod: Transaction["paymentMethod"];
  note?: string;
}

/** A cost that isn't a stock purchase — maintenance, transport, wages, rent. */
export interface CostInput {
  category: TxnCategory;
  amount: number;
  date: string;
  description: string;
  paymentMethod: Transaction["paymentMethod"];
  /** Ties a maintenance cost to the machine it was spent on. */
  assetId?: ID;
  employeeId?: ID;
  partnerId?: ID;
  animalId?: ID;
}

export function purchaseTotal(input: Pick<PurchaseInput, "quantity" | "unitCost">): number {
  return Math.round(input.quantity * input.unitCost * 100) / 100;
}

/**
 * Moving-average unit cost. Buying at a new price shifts the item's carrying
 * cost proportionally rather than overwriting it, so feed costing doesn't jump
 * because of one delivery.
 */
export function blendedUnitCost(
  currentStock: number,
  currentUnitCost: number,
  addedQty: number,
  addedUnitCost: number,
): number {
  const totalQty = currentStock + addedQty;
  if (totalQty <= 0) return addedUnitCost;
  const value = currentStock * currentUnitCost + addedQty * addedUnitCost;
  return Math.round((value / totalQty) * 100) / 100;
}

/**
 * A purchased animal is capital, not a cost — it joins the asset register under
 * livestock and is only expensed (via cost of production) when it leaves. This
 * builds the asset row that mirrors an animal bought with a price on it.
 */
export function livestockAssetFor(animal: Animal): Omit<Asset, "farmId"> | null {
  const cost = animal.acquisitionCost ?? 0;
  if (cost <= 0) return null;
  return {
    // Deterministic id so re-saving the animal updates rather than duplicates.
    id: `asset_animal_${animal.id}`,
    name: `${animal.tag}${animal.name ? ` — ${animal.name}` : ""}`,
    nameAr: `${animal.tag}${animal.nameAr ? ` — ${animal.nameAr}` : ""}`,
    category: "livestock",
    acquiredDate: animal.acquiredAt ?? animal.dateOfBirth,
    cost,
    // Livestock isn't straight-line depreciated here; its cost is recovered
    // through the per-animal cost-of-production model instead.
    status:
      animal.status === "sold" || animal.status === "dead" || animal.status === "culled"
        ? "disposed"
        : "active",
    notes: "Auto-created from the animal's purchase price.",
  };
}
