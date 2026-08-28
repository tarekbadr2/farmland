import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

import { db, REGION, farmPath } from "./shared";
import {
  applyToRollup,
  contribution,
  round2,
  type Contribution,
  type JournalEntryDoc,
  type RollupTotals,
} from "./ledger-rollup-math";

/**
 * Server-maintained period rollups of the journal.
 *
 * Balances used to be summed on the client from a `limit(10000)` read of the
 * whole ledger. Past that many entries the read silently drops the oldest ones
 * and every statement is quietly wrong — a truncated ledger still *balances*,
 * because each entry is internally balanced, so nothing looks amiss.
 *
 * This keeps one document per (month, branch, fiscal year) holding per-account
 * debit/credit totals for the posted entries in it. The client then reads a
 * number of documents that grows with the farm's *age*, not its transaction
 * volume, and tops it up with the raw entries of whichever month the reporting
 * window cuts through.
 *
 * The arithmetic lives in `ledger-rollup-math.ts`, deliberately duplicated from
 * `src/core/services/ledger-rollup.ts` rather than shared across the
 * app/functions boundary — and `ledger-rollup-parity.test.ts` in the app's
 * suite imports both and fails if they ever disagree, the same arrangement
 * `ledger-check` already uses.
 */

const rollupPath = (farmId: string, id: string) => `${farmPath(farmId)}/ledgerRollups/${id}`;

/** Apply a set of signed contributions, one transaction per rollup document. */
async function applyContributions(
  farmId: string,
  changes: Array<{ contrib: Contribution; sign: 1 | -1 }>,
): Promise<void> {
  // An edit that moves an entry between months (or branches) touches two
  // rollups; group by document so each is read-modify-written exactly once.
  const byDoc = new Map<string, Array<{ contrib: Contribution; sign: 1 | -1 }>>();
  for (const c of changes) {
    const list = byDoc.get(c.contrib.id) ?? [];
    list.push(c);
    byDoc.set(c.contrib.id, list);
  }

  for (const [id, list] of byDoc) {
    const ref = db.doc(rollupPath(farmId, id));
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      let data = snap.exists
        ? (snap.data() as { accounts?: Record<string, RollupTotals>; entryCount?: number })
        : undefined;
      for (const { contrib, sign } of list) {
        data = applyToRollup(data, contrib, sign);
      }
      const { period, branchId, fiscalYearId } = list[0].contrib;
      tx.set(
        ref,
        {
          period,
          branchId,
          fiscalYearId,
          accounts: data?.accounts ?? {},
          entryCount: data?.entryCount ?? 0,
          updatedAt: new Date().toISOString(),
        },
        { merge: false },
      );
    });
  }
}

/**
 * Keep the rollups in step with every journal write.
 *
 * Works on the difference between the before and after images, so it handles
 * the whole lifecycle uniformly: a draft being posted adds, a posted entry
 * being voided (including by the integrity guard in `ledger.ts`) subtracts, an
 * edited date or branch moves the totals between documents, and a delete backs
 * them out.
 */
export const onJournalEntryRollup = onDocumentWritten(
  { document: "farms/{farmId}/journalEntries/{entryId}", region: REGION },
  async (event) => {
    const { farmId, entryId } = event.params;
    const before = contribution(event.data?.before.data() as JournalEntryDoc | undefined);
    const after = contribution(event.data?.after.data() as JournalEntryDoc | undefined);
    if (!before && !after) return;

    const changes: Array<{ contrib: Contribution; sign: 1 | -1 }> = [];
    if (before) changes.push({ contrib: before, sign: -1 });
    if (after) changes.push({ contrib: after, sign: 1 });

    try {
      await applyContributions(farmId, changes);
    } catch (err) {
      // A rollup that fails to update leaves the books understated, which is
      // exactly the failure mode this whole mechanism exists to prevent. Log
      // loudly and rethrow so the platform retries.
      logger.error("Ledger rollup update failed", { farmId, entryId, err });
      throw err;
    }
  },
);

/* --------------------------------- rebuild -------------------------------- */

/** Throws unless the caller owns or manages this farm. */
async function assertManager(farmId: string, uid: string | undefined) {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const member = await db.doc(`${farmPath(farmId)}/members/${uid}`).get();
  const role = member.data()?.role;
  if (!member.exists || !["owner", "manager"].includes(role)) {
    throw new HttpsError("permission-denied", "Not permitted.");
  }
}

/**
 * Rebuild every rollup for a farm from the journal itself.
 *
 * Needed twice over: to backfill farms whose ledger predates this mechanism,
 * and as the repair path if a trigger ever failed its retries. It pages the
 * journal by document id with a cursor rather than `limit()`-ing it, so unlike
 * the read it replaces it has no ceiling.
 *
 * Idempotent — it derives the full set and overwrites, so running it twice
 * leaves the same state as running it once.
 */
export const rebuildLedgerRollups = onCall(
  { region: REGION, timeoutSeconds: 540, memory: "512MiB" },
  async (req) => {
    const farmId = String(req.data?.farmId ?? "");
    if (!farmId) throw new HttpsError("invalid-argument", "farmId is required.");
    await assertManager(farmId, req.auth?.uid);

    const PAGE = 2000;
    const rollups = new Map<string, Contribution & { entryCount: number }>();
    let cursor: string | undefined;
    let scanned = 0;

    for (;;) {
      let q = db
        .collection(`${farmPath(farmId)}/journalEntries`)
        .orderBy("__name__")
        .limit(PAGE);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;

      for (const d of snap.docs) {
        scanned++;
        const c = contribution(d.data() as JournalEntryDoc);
        if (!c) continue;
        let roll = rollups.get(c.id);
        if (!roll) {
          roll = { ...c, accounts: {}, entryCount: 0 };
          rollups.set(c.id, roll);
        }
        roll.entryCount += 1;
        for (const [accountId, t] of Object.entries(c.accounts)) {
          const row = (roll.accounts[accountId] ??= { debit: 0, credit: 0 });
          row.debit = round2(row.debit + t.debit);
          row.credit = round2(row.credit + t.credit);
        }
      }

      cursor = snap.docs[snap.docs.length - 1].id;
      if (snap.size < PAGE) break;
    }

    // Clear rollups that no longer have any entries behind them before writing
    // the new set, or a deleted month would keep reporting its old totals.
    const existing = await db.collection(`${farmPath(farmId)}/ledgerRollups`).get();
    const now = new Date().toISOString();
    let batch = db.batch();
    let ops = 0;
    const flush = async () => {
      if (ops === 0) return;
      await batch.commit();
      batch = db.batch();
      ops = 0;
    };

    for (const d of existing.docs) {
      if (rollups.has(d.id)) continue;
      batch.delete(d.ref);
      if (++ops >= 400) await flush();
    }
    for (const [id, roll] of rollups) {
      batch.set(db.doc(rollupPath(farmId, id)), {
        period: roll.period,
        branchId: roll.branchId,
        fiscalYearId: roll.fiscalYearId,
        accounts: roll.accounts,
        entryCount: roll.entryCount,
        updatedAt: now,
      });
      if (++ops >= 400) await flush();
    }
    await flush();

    logger.info("Ledger rollups rebuilt", {
      farmId,
      uid: req.auth?.uid,
      scanned,
      rollups: rollups.size,
      removed: existing.docs.filter((d) => !rollups.has(d.id)).length,
    });
    return { scanned, rollups: rollups.size };
  },
);
