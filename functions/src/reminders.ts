import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

import { db, REGION } from "./shared";
import { emailConfigured, sendEmail, trialEndingEmail } from "./email";

const DAY = 86_400_000;

/**
 * Emails owners whose free trial ends within two days — the nudge that turns a
 * trial into a subscription. Sends once per farm (tracked by
 * `trialReminderSentAt`). No-op until email is configured.
 */
export const trialEndingReminders = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Africa/Cairo", region: REGION, timeoutSeconds: 300 },
  async () => {
    if (!emailConfigured()) {
      logger.info("Trial reminders skipped (email not configured).");
      return;
    }
    const now = Date.now();
    const windowEnd = now + 2 * DAY;
    const farms = await db.collection("farms").get();
    let sent = 0;

    for (const doc of farms.docs) {
      const f = doc.data() as {
        name?: string;
        trialReminderSentAt?: string;
        subscription?: { status?: string; trialEndsAt?: string };
      };
      const sub = f.subscription;
      if (!sub || sub.status !== "trialing" || !sub.trialEndsAt) continue;
      const end = Date.parse(sub.trialEndsAt);
      if (Number.isNaN(end) || end < now || end > windowEnd) continue; // not in the window
      if (f.trialReminderSentAt) continue; // already reminded

      const ownerSnap = await db
        .collection(`farms/${doc.id}/members`)
        .where("role", "==", "owner")
        .limit(1)
        .get();
      const email = ownerSnap.docs[0]?.data()?.email as string | undefined;
      if (!email) continue;

      const daysLeft = Math.max(1, Math.ceil((end - now) / DAY));
      const { subject, html } = trialEndingEmail(f.name ?? "your farm", daysLeft);
      if (await sendEmail(email, subject, html)) {
        await doc.ref.set({ trialReminderSentAt: new Date().toISOString() }, { merge: true });
        sent++;
      }
    }
    logger.info("Trial reminders processed", { sent });
  },
);
