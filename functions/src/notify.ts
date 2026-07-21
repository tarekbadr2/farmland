import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { getMessaging } from "firebase-admin/messaging";
import { REGION, db, farmPath } from "./shared";

/**
 * Push delivery for alerts.
 *
 * Only critical alerts wake a phone. Warnings and info live in the app's alert
 * list where someone will see them in the normal course of the morning — a farm
 * where the phone buzzes for every expiring bottle of iodine is a farm where
 * nobody reads the notification that actually mattered.
 *
 * Devices subscribe to per-farm, per-severity topics on sign-in, so this needs
 * no token registry and no fan-out.
 */
export const onAlertCreated = onDocumentCreated(
  { document: "farms/{farmId}/alerts/{alertId}", region: REGION },
  async (event) => {
    const alert = event.data?.data();
    if (!alert || alert.severity !== "critical") return;

    const { farmId } = event.params;

    try {
      await getMessaging().send({
        topic: `farm_${farmId}_critical`,
        notification: { title: alert.title, body: alert.body },
        data: {
          kind: alert.kind ?? "",
          href: alert.href ?? "/dashboard",
          subjectId: alert.subjectId ?? "",
          // Arabic travels as data so the client can pick a language rather
          // than the server guessing which one the reader wants.
          titleAr: alert.titleAr ?? "",
          bodyAr: alert.bodyAr ?? "",
        },
        android: { priority: "high", notification: { channelId: "critical" } },
        apns: { payload: { aps: { sound: "default", badge: 1 } } },
      });

      logger.info("critical alert pushed", { farmId, kind: alert.kind });
    } catch (err) {
      // A failed push must not fail the alert — it's already in Firestore and
      // the app will show it. Retrying would only duplicate.
      logger.warn("push failed", { farmId, alertId: event.params.alertId, err });
    }
  },
);

/**
 * Nightly digest of what the farm owes attention tomorrow.
 *
 * Stored rather than emailed: wiring SMTP or SendGrid is a per-farm decision,
 * and a document the reports screen can render is useful either way. The
 * scheduled-email step reads these.
 */
export async function buildDailyDigest(farmId: string, date: string) {
  const [alerts, farm] = await Promise.all([
    db
      .collection(`${farmPath(farmId)}/alerts`)
      .where("read", "==", false)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get(),
    db.doc(farmPath(farmId)).get(),
  ]);

  const bySeverity = { critical: 0, warning: 0, info: 0 };
  for (const doc of alerts.docs) {
    const s = doc.data().severity as keyof typeof bySeverity;
    if (s in bySeverity) bySeverity[s]++;
  }

  return {
    date,
    farmId,
    counts: farm.data()?.counts ?? {},
    alerts: bySeverity,
    headlines: alerts.docs.slice(0, 10).map((d) => ({
      severity: d.data().severity,
      title: d.data().title,
      titleAr: d.data().titleAr,
      href: d.data().href,
    })),
  };
}
