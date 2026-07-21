/**
 * Every collection lives under `farms/{farmId}/…`.
 *
 * Path-scoped tenancy means a security rule is a single membership check
 * rather than a per-document predicate, and it makes "export one farm" or
 * "delete one farm" a subtree operation instead of a fleet of filtered queries.
 */

export const FARM_ID = process.env.NEXT_PUBLIC_FARM_ID || "farm_nile_delta";

export const paths = {
  farm: (farmId = FARM_ID) => `farms/${farmId}`,
  members: (farmId = FARM_ID) => `farms/${farmId}/members`,
  pendingMembers: (farmId = FARM_ID) => `farms/${farmId}/pendingMembers`,
  animals: (farmId = FARM_ID) => `farms/${farmId}/animals`,
  zones: (farmId = FARM_ID) => `farms/${farmId}/zones`,
  milkRecords: (farmId = FARM_ID) => `farms/${farmId}/milkRecords`,
  milkDaily: (farmId = FARM_ID) => `farms/${farmId}/milkDaily`,
  breeding: (farmId = FARM_ID) => `farms/${farmId}/breeding`,
  semen: (farmId = FARM_ID) => `farms/${farmId}/semen`,
  health: (farmId = FARM_ID) => `farms/${farmId}/health`,
  feedItems: (farmId = FARM_ID) => `farms/${farmId}/feedItems`,
  rations: (farmId = FARM_ID) => `farms/${farmId}/rations`,
  feedConsumption: (farmId = FARM_ID) => `farms/${farmId}/feedConsumption`,
  inventory: (farmId = FARM_ID) => `farms/${farmId}/inventory`,
  stockMovements: (farmId = FARM_ID) => `farms/${farmId}/stockMovements`,
  employees: (farmId = FARM_ID) => `farms/${farmId}/employees`,
  attendance: (farmId = FARM_ID) => `farms/${farmId}/attendance`,
  tasks: (farmId = FARM_ID) => `farms/${farmId}/tasks`,
  transactions: (farmId = FARM_ID) => `farms/${farmId}/transactions`,
  invoices: (farmId = FARM_ID) => `farms/${farmId}/invoices`,
  partners: (farmId = FARM_ID) => `farms/${farmId}/partners`,
  alerts: (farmId = FARM_ID) => `farms/${farmId}/alerts`,
  utilities: (farmId = FARM_ID) => `farms/${farmId}/utilities`,
  telemetry: (farmId = FARM_ID) => `farms/${farmId}/telemetry`,
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
