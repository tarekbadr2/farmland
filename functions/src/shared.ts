import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

initializeApp();

export const db = getFirestore();

/**
 * Functions run in the same region as Firestore. Cross-region triggers add a
 * round trip to every invocation and egress cost to every read.
 */
export const REGION = "us-central1";

export const farmPath = (farmId: string) => `farms/${farmId}`;

/* ------------------------------ date helpers ------------------------------ */
// Functions deal in farm-local calendar days, not UTC instants. A milking
// session belongs to the day the milker was standing in, so every date here is
// a yyyy-MM-dd string in the farm's timezone.

export const FARM_TIMEZONE = "Africa/Cairo";

export function localDate(at: Date = new Date(), timeZone = FARM_TIMEZONE): string {
  // en-CA formats as yyyy-MM-dd, which sorts lexicographically.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`); // midday avoids DST edge cases
  // Number() guards against a string slipping in from Firestore or a payload:
  // getUTCDate() + "5" concatenates rather than adds.
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export const round = (n: number, dp = 1) => Number(n.toFixed(dp));

/* --------------------------------- alerts --------------------------------- */

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertInput {
  id: string;
  kind: string;
  severity: AlertSeverity;
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  subjectId?: string;
  href?: string;
}

/**
 * Writes alerts with deterministic ids.
 *
 * The daily job re-derives the whole alert set from scratch. Deterministic ids
 * mean a condition that is still true tomorrow overwrites yesterday's alert
 * instead of stacking a duplicate — the difference between a useful inbox and
 * one nobody opens after a week.
 *
 * `read` is never written here. A missing `read` field reads as falsy, so a new
 * alert shows as unread; once someone dismisses it the field exists and merge
 * leaves it alone. Dismissing therefore sticks even while the condition that
 * raised the alert is still true — otherwise every dismissed alert would come
 * back tomorrow morning and people would stop reading the list entirely.
 */
export async function writeAlerts(farmId: string, alerts: AlertInput[]): Promise<number> {
  if (!alerts.length) return 0;

  const col = db.collection(`${farmPath(farmId)}/alerts`);
  let written = 0;

  for (let i = 0; i < alerts.length; i += 400) {
    const batch = db.batch();
    for (const { id, ...rest } of alerts.slice(i, i + 400)) {
      batch.set(col.doc(id), { ...rest, farmId, createdAt: Timestamp.now() }, { merge: true });
      written++;
    }
    await batch.commit();
  }

  return written;
}

/** Every farm in the project. Scheduled jobs fan out over these. */
export async function allFarmIds(): Promise<string[]> {
  const snap = await db.collection("farms").select().get();
  return snap.docs.map((d) => d.id);
}
