import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

import { db, REGION } from "./shared";

const DAY = 86_400_000;
const PAST_DUE_GRACE_DAYS = 3;

interface Subscription {
  status?: string;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  access?: "active" | "blocked";
}

/**
 * The server's verdict on whether a farm may keep writing. Mirrors the client's
 * `resolveEntitlement` (src/lib/billing/status.ts) — keep the two in sync. A
 * missing/legacy subscription is never blocked, so pre-billing tenants and any
 * unforeseen shape fail open rather than locking a paying customer out.
 */
export function computeAccess(sub: Subscription | undefined, now = Date.now()): "active" | "blocked" {
  if (!sub || !sub.status) return "active";
  const trialEnd = sub.trialEndsAt ? Date.parse(sub.trialEndsAt) : 0;
  const periodEnd = sub.currentPeriodEnd ? Date.parse(sub.currentPeriodEnd) : 0;
  const withinPeriod = !periodEnd || periodEnd > now;

  const trialing = sub.status === "trialing" && trialEnd > now;
  const paidActive = sub.status === "active" && withinPeriod;
  const canceledGrace = sub.status === "canceled" && !!periodEnd && periodEnd > now;
  const pastDueGrace = sub.status === "past_due" && !!periodEnd && periodEnd + PAST_DUE_GRACE_DAYS * DAY > now;

  return trialing || paidActive || canceledGrace || pastDueGrace ? "active" : "blocked";
}

/**
 * Daily backstop for billing. The React paywall can be bypassed by driving the
 * SDK directly, so the real gate is `firestore.rules` checking a server-only
 * `subscription.access` flag — and this keeps that flag honest: it re-derives
 * each farm's access from its dates and writes it only when it changed. Payment
 * (webhook) and signup (createFarm) set the flag immediately; this catches the
 * silent lapses nobody triggers — a trial that quietly ran out.
 */
export const billingSweep = onSchedule(
  { schedule: "30 3 * * *", timeZone: "Africa/Cairo", region: REGION, timeoutSeconds: 300 },
  async () => {
    const now = Date.now();
    const farms = await db.collection("farms").get();
    let changed = 0;

    for (const doc of farms.docs) {
      const sub = (doc.data() as { subscription?: Subscription }).subscription;
      const access = computeAccess(sub, now);
      if (sub?.access === access) continue; // no write when nothing moved
      await doc.ref.set({ subscription: { ...(sub ?? {}), access } }, { merge: true });
      changed++;
    }
    logger.info("Billing sweep complete", { farms: farms.size, changed });
  },
);
