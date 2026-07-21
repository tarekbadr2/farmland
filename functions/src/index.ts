/**
 * Herd OS Cloud Functions.
 *
 * Three jobs the client can't do:
 *   1. Keep aggregate counters correct — Firestore has no cheap COUNT.
 *   2. Notice things nobody is looking at — due dates, drops, empty bins.
 *   3. Run on a schedule with credentials no browser should ever hold.
 *
 * Everything here is idempotent. Scheduled jobs re-derive state rather than
 * accumulate it, so a retry, a double-fire or a manual re-run is harmless.
 */

export { onAnimalWritten, reconcileCounters } from "./counters";
export { dailyAlerts } from "./alerts";
export { onAlertCreated } from "./notify";
export { runAlertsNow, rebuildMilkDaily } from "./admin";
export { claimMembership } from "./members";
