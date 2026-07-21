import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { REGION, addDays, db, farmPath, localDate, round } from "./shared";
import { runDetectors } from "./alerts";

/**
 * Operator tools.
 *
 * Callable rather than HTTP so Firebase checks the caller's identity token
 * before the function body runs, and callable rather than scheduled so you
 * don't have to wait until 04:30 to find out whether a change worked.
 */

/** Throws unless the caller is the owner or a manager of this farm. */
async function assertManager(farmId: string, uid: string | undefined) {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

  const member = await db.doc(`${farmPath(farmId)}/members/${uid}`).get();
  const role = member.data()?.role;

  if (!member.exists || !["owner", "manager"].includes(role)) {
    // Deliberately vague: a caller who isn't a member shouldn't learn whether
    // the farm exists.
    throw new HttpsError("permission-denied", "Not permitted.");
  }
}

/** Regenerate the alert set on demand. */
export const runAlertsNow = onCall({ region: REGION, timeoutSeconds: 300 }, async (req) => {
  const farmId = String(req.data?.farmId ?? "");
  if (!farmId) throw new HttpsError("invalid-argument", "farmId is required.");

  await assertManager(farmId, req.auth?.uid);
  const result = await runDetectors(farmId, req.data?.date ?? localDate());

  logger.info("alerts run manually", { farmId, uid: req.auth?.uid, ...result });
  return result;
});

/**
 * Rebuilds milkDaily from the underlying records.
 *
 * The client rolls the daily aggregate forward as each session is saved, which
 * is fast but assumes every write lands. A parlor API pushing records directly,
 * an offline device syncing late, or a partial batch all leave the aggregate
 * behind the truth. This recomputes it from what's actually stored.
 */
export const rebuildMilkDaily = onCall({ region: REGION, timeoutSeconds: 540 }, async (req) => {
  const farmId = String(req.data?.farmId ?? "");
  const days = Math.min(Number(req.data?.days ?? 7), 90);
  if (!farmId) throw new HttpsError("invalid-argument", "farmId is required.");

  await assertManager(farmId, req.auth?.uid);

  const today = localDate();
  const from = addDays(today, -days);

  const snap = await db
    .collection(`${farmPath(farmId)}/milkRecords`)
    .where("date", ">=", from)
    .get();

  type Bucket = {
    morningL: number;
    eveningL: number;
    rejectedL: number;
    fat: number[];
    protein: number[];
    animals: Set<string>;
  };

  const byDate = new Map<string, Bucket>();

  for (const doc of snap.docs) {
    const r = doc.data();
    if (!byDate.has(r.date)) {
      byDate.set(r.date, {
        morningL: 0,
        eveningL: 0,
        rejectedL: 0,
        fat: [],
        protein: [],
        animals: new Set(),
      });
    }
    const bucket = byDate.get(r.date)!;
    if (r.session === "morning") bucket.morningL += r.volumeL ?? 0;
    else bucket.eveningL += r.volumeL ?? 0;
    bucket.rejectedL += r.rejectedL ?? 0;
    if (r.fatPct) bucket.fat.push(r.fatPct);
    if (r.proteinPct) bucket.protein.push(r.proteinPct);
    bucket.animals.add(r.animalId);
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

  let written = 0;
  const dates = [...byDate.keys()];

  for (let i = 0; i < dates.length; i += 400) {
    const batch = db.batch();
    for (const date of dates.slice(i, i + 400)) {
      const b = byDate.get(date)!;
      batch.set(
        db.doc(`${farmPath(farmId)}/milkDaily/${date}`),
        {
          farmId,
          date,
          morningL: round(b.morningL),
          eveningL: round(b.eveningL),
          totalL: round(b.morningL + b.eveningL),
          rejectedL: round(b.rejectedL),
          avgFat: round(mean(b.fat), 2),
          avgProtein: round(mean(b.protein), 2),
          milkingCows: b.animals.size,
          rebuiltAt: new Date(),
        },
        { merge: true },
      );
      written++;
    }
    await batch.commit();
  }

  logger.info("milkDaily rebuilt", { farmId, days, written, records: snap.size });
  return { days, daysRebuilt: written, recordsRead: snap.size };
});
