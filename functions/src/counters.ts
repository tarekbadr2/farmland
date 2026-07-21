import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { FieldValue } from "firebase-admin/firestore";
import { REGION, allFarmIds, db, farmPath } from "./shared";

/**
 * Herd counters.
 *
 * Firestore has no cheap COUNT over a filtered set, so the dashboard reads
 * pre-computed totals from farms/{farmId}.counts. Keeping them correct is this
 * file's whole job.
 *
 * The naive implementation — recount the collection on every write — costs
 * 50,000 reads per animal edit. Instead each animal is mapped to the set of
 * buckets it belongs to, and a write increments only the buckets it entered and
 * decrements only the ones it left. That's O(1) per edit regardless of herd size.
 */

type AnimalDoc = {
  status?: string;
  milkStatus?: string;
  reproStatus?: string;
  sex?: string;
  isCalf?: boolean;
  healthScore?: number;
};

const BUCKETS = [
  "total",
  "lactating",
  "dry",
  "calves",
  "pregnant",
  "bulls",
  "healthy",
  "sick",
] as const;

type Bucket = (typeof BUCKETS)[number];

/** Animals physically on the farm. Sold, dead and culled head count for nothing. */
export const ON_FARM = ["active", "quarantine"] as const;

/** Which counters this animal contributes to. */
function bucketsFor(animal: AnimalDoc | undefined): Set<Bucket> {
  const set = new Set<Bucket>();
  if (!animal || !ON_FARM.includes(animal.status as (typeof ON_FARM)[number])) return set;

  set.add("total");
  if (animal.milkStatus === "lactating") set.add("lactating");
  if (animal.milkStatus === "dry") set.add("dry");
  if (animal.isCalf) set.add("calves");
  if (animal.reproStatus === "pregnant") set.add("pregnant");
  if (animal.sex === "male" && !animal.isCalf) set.add("bulls");
  if (typeof animal.healthScore === "number") {
    set.add(animal.healthScore >= 80 ? "healthy" : "sick");
  }
  return set;
}

export const onAnimalWritten = onDocumentWritten(
  { document: "farms/{farmId}/animals/{animalId}", region: REGION },
  async (event) => {
    const { farmId } = event.params;
    const before = bucketsFor(event.data?.before.data() as AnimalDoc | undefined);
    const after = bucketsFor(event.data?.after.data() as AnimalDoc | undefined);

    const deltas: Record<string, FirebaseFirestore.FieldValue> = {};
    for (const bucket of BUCKETS) {
      const was = before.has(bucket);
      const is = after.has(bucket);
      if (was === is) continue;
      deltas[`counts.${bucket}`] = FieldValue.increment(is ? 1 : -1);
    }

    // The overwhelmingly common edit — a weight change, a note — moves nothing.
    // Bailing here keeps the farm document out of the write path, which matters
    // because it's a single document and Firestore caps it at ~1 write/second.
    if (!Object.keys(deltas).length) return;

    await db.doc(farmPath(farmId)).update(deltas);
    logger.debug("counters updated", { farmId, deltas: Object.keys(deltas) });
  },
);

/**
 * Weekly reconciliation.
 *
 * Incremental counters drift: a failed trigger, a bulk import, someone editing
 * in the console. This recounts from scratch using aggregation queries, which
 * Firestore bills at one read per 1,000 documents — a full 50,000-head recount
 * costs 50 reads, so there is no reason not to run it.
 */
export const reconcileCounters = onSchedule(
  { schedule: "every sunday 03:00", timeZone: "Africa/Cairo", region: REGION },
  async () => {
    for (const farmId of await allFarmIds()) {
      const animals = db.collection(`${farmPath(farmId)}/animals`);
      const onFarm = animals.where("status", "in", ON_FARM as unknown as string[]);
      const n = async (q: FirebaseFirestore.Query) => (await q.count().get()).data().count;

      const [total, lactating, dry, calves, pregnant, healthy, bulls] = await Promise.all([
        n(onFarm),
        n(onFarm.where("milkStatus", "==", "lactating")),
        n(onFarm.where("milkStatus", "==", "dry")),
        n(onFarm.where("isCalf", "==", true)),
        n(onFarm.where("reproStatus", "==", "pregnant")),
        n(onFarm.where("healthScore", ">=", 80)),
        n(onFarm.where("sex", "==", "male").where("isCalf", "==", false)),
      ]);

      const counts = { total, lactating, dry, calves, pregnant, healthy, bulls, sick: total - healthy };

      const before = (await db.doc(farmPath(farmId)).get()).data()?.counts ?? {};
      const drifted = Object.entries(counts).filter(([k, v]) => before[k] !== v);

      await db.doc(farmPath(farmId)).set({ counts }, { merge: true });

      if (drifted.length) {
        logger.warn("counter drift corrected", { farmId, drifted, before, after: counts });
      }
    }
  },
);
