/**
 * Every collection lives under `farms/{farmId}/…`.
 *
 * Path-scoped tenancy means a security rule is a single membership check
 * rather than a per-document predicate, and it makes "export one farm" or
 * "delete one farm" a subtree operation instead of a fleet of filtered queries.
 */

import { DEFAULT_FARM, getActiveFarm } from "./tenant";

/** The seed / fallback farm. Kept for admin tooling that targets a fixed farm;
 *  the app's paths resolve against the signed-in user's active farm instead. */
export const FARM_ID = DEFAULT_FARM;

export const paths = {
  farm: (farmId = getActiveFarm()) => `farms/${farmId}`,
  members: (farmId = getActiveFarm()) => `farms/${farmId}/members`,
  pendingMembers: (farmId = getActiveFarm()) => `farms/${farmId}/pendingMembers`,
  animals: (farmId = getActiveFarm()) => `farms/${farmId}/animals`,
  tagIndex: (farmId = getActiveFarm()) => `farms/${farmId}/tagIndex`,
  zones: (farmId = getActiveFarm()) => `farms/${farmId}/zones`,
  milkRecords: (farmId = getActiveFarm()) => `farms/${farmId}/milkRecords`,
  milkDaily: (farmId = getActiveFarm()) => `farms/${farmId}/milkDaily`,
  breeding: (farmId = getActiveFarm()) => `farms/${farmId}/breeding`,
  semen: (farmId = getActiveFarm()) => `farms/${farmId}/semen`,
  health: (farmId = getActiveFarm()) => `farms/${farmId}/health`,
  feedItems: (farmId = getActiveFarm()) => `farms/${farmId}/feedItems`,
  rations: (farmId = getActiveFarm()) => `farms/${farmId}/rations`,
  feedConsumption: (farmId = getActiveFarm()) => `farms/${farmId}/feedConsumption`,
  inventory: (farmId = getActiveFarm()) => `farms/${farmId}/inventory`,
  stockMovements: (farmId = getActiveFarm()) => `farms/${farmId}/stockMovements`,
  employees: (farmId = getActiveFarm()) => `farms/${farmId}/employees`,
  attendance: (farmId = getActiveFarm()) => `farms/${farmId}/attendance`,
  tasks: (farmId = getActiveFarm()) => `farms/${farmId}/tasks`,
  transactions: (farmId = getActiveFarm()) => `farms/${farmId}/transactions`,
  invoices: (farmId = getActiveFarm()) => `farms/${farmId}/invoices`,
  partners: (farmId = getActiveFarm()) => `farms/${farmId}/partners`,
  assets: (farmId = getActiveFarm()) => `farms/${farmId}/assets`,
  docCounters: (farmId = getActiveFarm()) => `farms/${farmId}/docCounters`,
  branches: (farmId = getActiveFarm()) => `farms/${farmId}/branches`,
  currencies: (farmId = getActiveFarm()) => `farms/${farmId}/currencies`,
  workOrders: (farmId = getActiveFarm()) => `farms/${farmId}/workOrders`,
  livestockTransfers: (farmId = getActiveFarm()) => `farms/${farmId}/livestockTransfers`,
  warehouses: (farmId = getActiveFarm()) => `farms/${farmId}/warehouses`,
  cheques: (farmId = getActiveFarm()) => `farms/${farmId}/cheques`,
  accounts: (farmId = getActiveFarm()) => `farms/${farmId}/accounts`,
  journalEntries: (farmId = getActiveFarm()) => `farms/${farmId}/journalEntries`,
  ledgerRollups: (farmId = getActiveFarm()) => `farms/${farmId}/ledgerRollups`,
  fiscalYears: (farmId = getActiveFarm()) => `farms/${farmId}/fiscalYears`,
  alerts: (farmId = getActiveFarm()) => `farms/${farmId}/alerts`,
  utilities: (farmId = getActiveFarm()) => `farms/${farmId}/utilities`,
  auditLog: (farmId = getActiveFarm()) => `farms/${farmId}/auditLog`,
  transferRequests: (farmId = getActiveFarm()) => `farms/${farmId}/transferRequests`,
  purchases: (farmId = getActiveFarm()) => `farms/${farmId}/purchases`,
  telemetry: (farmId = getActiveFarm()) => `farms/${farmId}/telemetry`,
} as const;

/**
 * Search keys denormalised onto each animal document.
 *
 * Firestore has no substring search. Prefix ranges on a lowercased field cover
 * the two lookups that actually happen in a parlor — "type the tag" and "type
 * the name" — and they cost one index each. Full fuzzy search across 50k head
 * belongs in Algolia or Typesense fed by a Firestore trigger; don't fake it
 * with client-side filtering that silently only searches the page you loaded.
 */
export function animalSearchFields(animal: {
  tag: string;
  name: string;
  nameAr: string;
  rfid: string;
}) {
  return {
    tagLower: animal.tag.toLowerCase(),
    nameLower: animal.name.toLowerCase(),
    nameArLower: animal.nameAr.toLowerCase(),
    rfidLower: animal.rfid.replace(/\s/g, "").toLowerCase(),
  };
}

/** Upper bound for a Firestore prefix range — last code point before the surrogates. */
export const PREFIX_END = String.fromCharCode(0xf8ff);
