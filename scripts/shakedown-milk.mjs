#!/usr/bin/env node
/**
 * Live write-path shakedown helper (admin side).
 *
 *   node scripts/shakedown-milk.mjs           # read back the sentinel test docs
 *   node scripts/shakedown-milk.mjs --clean   # delete them
 *
 * The client (signed-in owner, in the browser) writes a milk session for a
 * sentinel date; this reads it back with the admin SDK (bypassing rules) to
 * prove it landed, then removes it so the real books stay untouched.
 */

import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(root, ".env.local"));
} catch {
  /* ambient env */
}

const FARM_ID = process.env.NEXT_PUBLIC_FARM_ID || "farm_nile_delta";
const DATE = process.env.SHAKEDOWN_DATE || "2027-01-01";
const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!key) {
  console.error("\n  GOOGLE_APPLICATION_CREDENTIALS is not set in .env.local\n");
  process.exit(1);
}

const { initializeApp, cert } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");
const raw = JSON.parse(readFileSync(key, "utf8"));
initializeApp({ credential: cert(raw), projectId: raw.project_id });
const db = getFirestore();
const base = `farms/${FARM_ID}`;

const clean = process.argv.includes("--clean");

// The client wrote one morning record for the first active animal.
const daily = db.doc(`${base}/milkDaily/${DATE}`);
const recs = await db
  .collection(`${base}/milkRecords`)
  .where("date", "==", DATE)
  .get();

const dailySnap = await daily.get();

console.log(`\n  Sentinel date ${DATE} on ${raw.project_id}/${FARM_ID}\n`);
console.log(`  milkDaily doc exists: ${dailySnap.exists}`);
if (dailySnap.exists) {
  const d = dailySnap.data();
  console.log(`    morningL=${d.morningL} totalL=${d.totalL} milkingCows=${d.milkingCows} avgFat=${d.avgFat}`);
}
console.log(`  milkRecords rows:    ${recs.size}`);
recs.forEach((r) => {
  const d = r.data();
  console.log(`    ${r.id}  animal=${d.animalId} volumeL=${d.volumeL} recordedAt=${d.recordedAt ? "set" : "null"}`);
});

if (clean) {
  const batch = db.batch();
  recs.forEach((r) => batch.delete(r.ref));
  if (dailySnap.exists) batch.delete(daily);
  await batch.commit();
  console.log(`\n  cleaned: deleted ${recs.size} milkRecords + ${dailySnap.exists ? 1 : 0} milkDaily doc\n`);
} else {
  console.log("");
}
process.exit(0);
