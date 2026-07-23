import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";

import { db, REGION, writeAlerts } from "./shared";
import { checkEntry, type JournalEntryDoc } from "./ledger-check";

/**
 * Server-side guard on the books.
 *
 * Firestore rules can restrict *who* writes a journal entry but cannot check
 * *what* they wrote — there's no way to sum an array in a rule. So the balance
 * guarantee, which is the whole basis of double-entry, has until now rested on
 * client-side code. Anyone with an accountant role driving the SDK directly
 * could post an entry whose debits don't equal its credits, and every report
 * downstream would quietly inherit the error.
 *
 * A trigger can't reject a write, but it can refuse to let a bad one count:
 * an unbalanced posted entry is immediately voided (so it stops affecting every
 * balance) and an alert is raised for someone to look at. The document itself is
 * kept — deleting evidence of a bad write is the wrong instinct.
 */

export const onJournalEntryWritten = onDocumentWritten(
  { document: "farms/{farmId}/journalEntries/{entryId}", region: REGION },
  async (event) => {
    const { farmId, entryId } = event.params;
    const after = event.data?.after.data() as JournalEntryDoc | undefined;

    // Deleted, or never existed — nothing to police.
    if (!after) return;
    // Only a posted entry moves balances; drafts are still being worked on.
    if (after.status !== "posted") return;
    // Don't loop on the correction this function itself made.
    if (after.integrityVoidedAt) return;

    const check = checkEntry(after);
    if (check.balanced) return;

    logger.error("Unbalanced journal entry quarantined", {
      farmId,
      entryId,
      number: after.number,
      ...check,
    });

    // Void it so it stops counting, but keep the document as evidence.
    await db.doc(`farms/${farmId}/journalEntries/${entryId}`).set(
      {
        status: "void",
        integrityVoidedAt: new Date().toISOString(),
        integrityReason: check.reason,
      },
      { merge: true },
    );

    await writeAlerts(farmId, [
      {
        // Deterministic id: re-processing the same entry updates one alert
        // rather than piling up duplicates.
        id: `ledger_unbalanced_${entryId}`,
        kind: "ledger_unbalanced",
        severity: "critical",
        title: "Unbalanced entry was rejected",
        titleAr: "تم رفض قيد غير متوازن",
        body:
          `Entry ${after.number ?? entryId} was posted with debits ${check.debit} and ` +
          `credits ${check.credit}. It has been voided so the books stay correct.`,
        bodyAr:
          `القيد ${after.number ?? entryId} مُرحَّل بمدين ${check.debit} ودائن ${check.credit}. ` +
          `تم إلغاؤه للحفاظ على صحة الدفاتر.`,
        href: "/accounting",
      },
    ]);
  },
);
