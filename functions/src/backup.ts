import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { v1 } from "@google-cloud/firestore";

import { REGION } from "./shared";

/**
 * Nightly Firestore backup.
 *
 * Kicks off a managed export of the whole database to a Cloud Storage bucket
 * every night. A managed export is a consistent, point-in-time snapshot that can
 * be re-imported wholesale — the thing that turns "our database got corrupted"
 * from a company-ending event into a bad afternoon.
 *
 * One-time setup (done outside this code):
 *   1. Create a bucket, ideally single-region matching Firestore, e.g.
 *      `gsutil mb -l us-central1 gs://<project>-backups`
 *      (or set FIRESTORE_BACKUP_BUCKET to an existing bucket URI).
 *   2. Grant the functions service account the export role:
 *      `roles/datastore.importExportAdmin`.
 *   3. A lifecycle rule on the bucket handles retention (e.g. delete after 30d).
 *
 * Idempotent: each run writes to a fresh timestamped prefix, so a retry or a
 * manual re-run never clobbers an existing snapshot.
 */

const adminClient = new v1.FirestoreAdminClient();

function backupBucket(projectId: string): string {
  return process.env.FIRESTORE_BACKUP_BUCKET || `gs://${projectId}-backups`;
}

export const nightlyFirestoreBackup = onSchedule(
  {
    schedule: "0 3 * * *", // 03:00 Cairo, daily
    timeZone: "Africa/Cairo",
    region: REGION,
    timeoutSeconds: 540,
    retryCount: 2,
  },
  async () => {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) {
      logger.error("Backup skipped: no project id in the environment.");
      return;
    }

    const databaseName = adminClient.databasePath(projectId, "(default)");
    // yyyy-MM-ddTHH-mm-ss — unique per run, sorts chronologically.
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const outputUriPrefix = `${backupBucket(projectId)}/firestore/${stamp}`;

    try {
      const [operation] = await adminClient.exportDocuments({
        name: databaseName,
        outputUriPrefix,
        collectionIds: [], // empty = every collection
      });
      logger.info("Firestore export started", {
        operation: operation.name,
        outputUriPrefix,
      });
    } catch (err) {
      logger.error("Firestore export failed", err);
      throw err; // surface to the scheduler so it retries
    }
  },
);
