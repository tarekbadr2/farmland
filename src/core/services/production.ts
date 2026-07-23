/**
 * Production costing (أمر شغل).
 *
 * A work order consumes stock and produces stock. What makes it worth having is
 * the cost roll-up: everything spent on materials, plus overhead, becomes the
 * output's unit cost — the only honest basis for pricing cheese, or for knowing
 * what a tonne of mixed ration really costs.
 *
 * Joint outputs are allocated **by quantity share**, deliberately. Proper joint
 * -product costing splits by relative sales value, which needs a price list the
 * farm doesn't keep; quantity is a rule anyone can check by hand, so it's the
 * one used here rather than a value split that looks precise and isn't.
 */

import type { FeedItem, InventoryItem, WorkOrder, WorkOrderLine } from "@/core/domain/types";
import { round } from "@/lib/utils";

/** Sequential document number, e.g. WO-2026-0003. */
export function workOrderNumber(date: string, seq: number): string {
  return `WO-${date.slice(0, 4)}-${String(seq).padStart(4, "0")}`;
}

export interface StockLookup {
  inventory: InventoryItem[];
  feed: FeedItem[];
}

/** The two stock lists keep unit cost under different names. */
export function unitCostOf(line: Pick<WorkOrderLine, "source" | "itemId">, stock: StockLookup): number {
  if (line.source === "feed") {
    return stock.feed.find((f) => f.id === line.itemId)?.costPerUnit ?? 0;
  }
  return stock.inventory.find((i) => i.id === line.itemId)?.unitCost ?? 0;
}

/** On-hand quantity, whichever list the item lives in. */
export function stockOf(line: Pick<WorkOrderLine, "source" | "itemId">, stock: StockLookup): number {
  if (line.source === "feed") return stock.feed.find((f) => f.id === line.itemId)?.stock ?? 0;
  return stock.inventory.find((i) => i.id === line.itemId)?.stock ?? 0;
}

export function itemName(
  line: Pick<WorkOrderLine, "source" | "itemId">,
  stock: StockLookup,
  ar = false,
): string {
  const item =
    line.source === "feed"
      ? stock.feed.find((f) => f.id === line.itemId)
      : stock.inventory.find((i) => i.id === line.itemId);
  if (!item) return line.itemId;
  return ar ? item.nameAr : item.name;
}

export interface WorkOrderCost {
  /** What the consumed materials were worth. */
  materialCost: number;
  overheadCost: number;
  totalCost: number;
  /** Total units produced across all outputs. */
  outputQuantity: number;
  /** Cost per unit produced (0 when nothing is produced). */
  unitCost: number;
}

/** Rolls materials + overhead into a cost per unit produced. */
export function workOrderCost(
  order: Pick<WorkOrder, "inputs" | "outputs" | "overheadCost">,
  stock: StockLookup,
): WorkOrderCost {
  const materialCost = round(
    order.inputs.reduce((sum, l) => sum + Math.abs(l.quantity) * unitCostOf(l, stock), 0),
    2,
  );
  const overheadCost = round(order.overheadCost ?? 0, 2);
  const totalCost = round(materialCost + overheadCost, 2);
  const outputQuantity = round(
    order.outputs.reduce((sum, l) => sum + Math.abs(l.quantity), 0),
    2,
  );
  return {
    materialCost,
    overheadCost,
    totalCost,
    outputQuantity,
    unitCost: outputQuantity > 0 ? round(totalCost / outputQuantity, 2) : 0,
  };
}

export interface OutputCost extends WorkOrderLine {
  /** This output's share of the total cost. */
  cost: number;
  unitCost: number;
}

/**
 * Splits the total cost across the outputs by quantity share (see the note at
 * the top). With a single output — the common case — it simply all lands there.
 */
export function allocateOutputCosts(
  order: Pick<WorkOrder, "inputs" | "outputs" | "overheadCost">,
  stock: StockLookup,
): OutputCost[] {
  const { totalCost, outputQuantity } = workOrderCost(order, stock);
  if (outputQuantity <= 0) return [];

  return order.outputs.map((line) => {
    const qty = Math.abs(line.quantity);
    const cost = round((qty / outputQuantity) * totalCost, 2);
    return { ...line, cost, unitCost: qty > 0 ? round(cost / qty, 2) : 0 };
  });
}

export interface WorkOrderCheck {
  ok: boolean;
  errors: string[];
  /** Inputs the farm doesn't have enough of, with what's short. */
  shortages: { line: WorkOrderLine; available: number; short: number }[];
}

/**
 * Can this order actually run? Checks it's well-formed and that every input is
 * on hand — running it otherwise would drive stock negative and make the
 * resulting unit cost meaningless.
 */
export function checkWorkOrder(
  order: Pick<WorkOrder, "inputs" | "outputs" | "status">,
  stock: StockLookup,
): WorkOrderCheck {
  const errors: string[] = [];
  if (order.status === "done") errors.push("already-completed");
  if (order.status === "cancelled") errors.push("cancelled");
  if (order.inputs.length === 0) errors.push("no-inputs");
  if (order.outputs.length === 0) errors.push("no-outputs");
  if (order.inputs.some((l) => l.quantity <= 0) || order.outputs.some((l) => l.quantity <= 0)) {
    errors.push("non-positive-quantity");
  }
  // An item that is both consumed and produced makes the cost circular.
  const inputKeys = new Set(order.inputs.map((l) => `${l.source}:${l.itemId}`));
  if (order.outputs.some((l) => inputKeys.has(`${l.source}:${l.itemId}`))) {
    errors.push("input-is-also-output");
  }

  const shortages = order.inputs
    .map((line) => {
      const available = stockOf(line, stock);
      return { line, available, short: round(Math.abs(line.quantity) - available, 2) };
    })
    .filter((s) => s.short > 0);
  if (shortages.length > 0) errors.push("insufficient-stock");

  return { ok: errors.length === 0, errors, shortages };
}
