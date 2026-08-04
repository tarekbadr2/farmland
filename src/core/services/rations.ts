import type { FeedItem, FeedRation, FeedRationComponent, ID } from "@/core/domain/types";
import { kgPerUnit } from "@/core/domain/rules";
import { round } from "@/lib/utils";

/**
 * Feed rations moved from "kg per component" to "a total kg/head + a % blend".
 * This module is the one place that math lives, so the log-feeding preview, both
 * repository adapters, and the ration builder can never drift from each other.
 */

type LegacyComponent = FeedRationComponent & { kgPerHead?: number };

/**
 * Coerce a ration into the current shape, whatever it was stored as.
 *
 * Older rations kept absolute kilograms on each component and no ration-level
 * total. We turn those into a total (their sum) and per-component percentages,
 * so code downstream only ever sees `kgPerHead` + `percent`. Already-current
 * rations pass through untouched.
 */
export function normalizeRation(raw: FeedRation): FeedRation {
  const comps = (raw.components ?? []) as LegacyComponent[];
  const hasPercent = comps.some((c) => typeof c.percent === "number");

  if (hasPercent) {
    return {
      ...raw,
      kgPerHead: raw.kgPerHead ?? 0,
      components: comps.map((c) => ({ feedItemId: c.feedItemId, percent: c.percent ?? 0 })),
    };
  }

  const total = comps.reduce((s, c) => s + (c.kgPerHead ?? 0), 0);
  return {
    ...raw,
    kgPerHead: round(total, 2),
    components: comps.map((c) => ({
      feedItemId: c.feedItemId,
      percent: total > 0 ? round(((c.kgPerHead ?? 0) / total) * 100, 1) : 0,
    })),
  };
}

/** The sum of a mix's shares — 100 for a well-formed formula. */
export function percentTotal(components: { percent: number }[]): number {
  return round(
    components.reduce((s, c) => s + (Number(c.percent) || 0), 0),
    1,
  );
}

/** Within a percentage point of 100 counts as balanced (rounding slack). */
export function isBalancedMix(components: { percent: number }[]): boolean {
  return Math.abs(percentTotal(components) - 100) < 0.5;
}

export interface FeedingLine {
  feedItemId: ID;
  kg: number;
  cost: number;
}

export interface ResolvedFeeding {
  lines: FeedingLine[];
  totalKg: number;
  totalCost: number;
}

/**
 * Turn a ration into the actual kilograms and cost drawn for `heads` animals.
 *
 * `opts` lets a single feeding deviate from the stored formula — a heavier
 * ration today, or a temporarily different blend — without editing the formula
 * itself. Cost per component comes from the feed's current price and unit, so a
 * ration re-prices as feed prices move.
 */
export function resolveFeeding(
  ration: FeedRation,
  heads: number,
  feeds: FeedItem[],
  opts?: { kgPerHead?: number; mix?: { feedItemId: ID; percent: number }[] },
): ResolvedFeeding {
  const totalKgPerHead = opts?.kgPerHead ?? ration.kgPerHead ?? 0;
  const mix = opts?.mix ?? ration.components ?? [];
  const n = Number(heads) || 0;

  const lines: FeedingLine[] = [];
  let totalKg = 0;
  let totalCost = 0;

  for (const c of mix) {
    const kg = round(totalKgPerHead * ((Number(c.percent) || 0) / 100) * n, 1);
    const feed = feeds.find((f) => f.id === c.feedItemId);
    // Ration is kilograms; stock and price are per unit (a ton, a bale).
    const cost = feed ? round((kg / kgPerUnit(feed.unit)) * (feed.costPerUnit ?? 0), 2) : 0;
    lines.push({ feedItemId: c.feedItemId, kg, cost });
    totalKg += kg;
    totalCost += cost;
  }

  return { lines, totalKg: round(totalKg, 1), totalCost: round(totalCost, 2) };
}

/** Blended cost of one head's ration at current prices. */
export function rationCostPerHead(
  ration: FeedRation,
  feeds: FeedItem[],
  kgPerHeadOverride?: number,
): number {
  return resolveFeeding(ration, 1, feeds, { kgPerHead: kgPerHeadOverride }).totalCost;
}

/** Blended cost of one kilogram of the mix — the number to compare blends by. */
export function rationCostPerKg(ration: FeedRation, feeds: FeedItem[]): number {
  // Divide cost by the kg actually drawn, not the nominal kgPerHead: if a mix's
  // percentages don't sum to 100 (bad import / legacy / override), only that
  // fraction is drawn, and dividing by the full kgPerHead understated cost/kg.
  const { totalKg, totalCost } = resolveFeeding(ration, 1, feeds);
  return totalKg > 0 ? round(totalCost / totalKg, 2) : 0;
}
