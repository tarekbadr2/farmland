#!/usr/bin/env node
/**
 * Reads back what the seed wrote and sanity-checks it.
 *
 *   node scripts/verify-firestore.mjs
 *
 * Confirms the collections exist, the counters agree with an actual count, and
 * a representative query from each screen returns rows. Catches the two failure
 * modes that look identical from the UI — "no data" and "missing index".
 */

import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(root, ".env.local"));
} catch {
  /* fall back to ambient env */
}

const FARM_ID = process.env.NEXT_PUBLIC_FARM_ID || "farm_nile_delta";
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

const pass = (m) => console.log(`  [32mok[0m    ${m}`);
const fail = (m) => {
  console.log(`  [31mFAIL[0m  ${m}`);
  failures++;
};
let failures = 0;

console.log(`\n  Verifying ${raw.project_id} / ${FARM_ID}\n`);

/* --------------------------- farm + counters ------------------------------ */

const farm = await db.doc(base).get();
if (!farm.exists) {
  fail("farm document missing — run `npm run seed`");
  process.exit(1);
}
pass(`farm document: ${farm.data().name ?? "(unnamed)"}`);

// counts.total is deliberately lower than the collection size: it counts head
// physically on the farm, while the collection retains sold, dead and culled
// animals for their history. A mismatch here is expected; equality would be the
// bug, since it would mean dead animals are inflating the dashboard.
const counts = farm.data().counts ?? {};
const stored = (await db.collection(`${base}/animals`).count().get()).data().count;
const onFarm = (
  await db
    .collection(`${base}/animals`)
    .where("status", "in", ["active", "quarantine"])
    .count()
    .get()
).data().count;

console.log("");
if (counts.total === onFarm) pass(`counts.total ${counts.total} matches on-farm animals`);
else fail(`counts.total is ${counts.total} but ${onFarm} animals are on-farm`);
console.log(`        (${stored} documents stored, including sold/dead/culled history)`);

/* ------------------------------ collections ------------------------------- */

const EXPECT = {
  animals: 600,
  zones: 10,
  employees: 30,
  milkDaily: 700,
  milkRecords: 5000,
  health: 2000,
  breeding: 1500,
  transactions: 2000,
  inventory: 20,
  feedItems: 10,
  tasks: 50,
  partners: 10,
  invoices: 10,
  alerts: 1,
};

console.log("");
for (const [name, min] of Object.entries(EXPECT)) {
  const n = (await db.collection(`${base}/${name}`).count().get()).data().count;
  if (n >= min) pass(`${name.padEnd(14)} ${String(n).padStart(6)}`);
  else fail(`${name.padEnd(14)} ${String(n).padStart(6)}  (expected >= ${min})`);
}

/* ---------------------- queries the screens actually run ------------------ */

console.log("");
const queries = {
  "herd list (status + tag sort)": db
    .collection(`${base}/animals`)
    .where("milkStatus", "==", "lactating")
    .orderBy("tag")
    .limit(5),
  "tag prefix search": db
    .collection(`${base}/animals`)
    .orderBy("tagLower")
    .where("tagLower", ">=", "eg-10")
    .where("tagLower", "<=", "eg-10")
    .limit(5),
  "calvings due": db
    .collection(`${base}/animals`)
    .where("reproStatus", "==", "pregnant")
    .orderBy("expectedCalvingDate")
    .limit(5),
  // Must be a lactating animal — only those have milk records seeded.
  "milk history for one animal": db
    .collection(`${base}/milkRecords`)
    .where(
      "animalId",
      "==",
      (
        await db
          .collection(`${base}/animals`)
          .where("milkStatus", "==", "lactating")
          .limit(1)
          .get()
      ).docs[0].id,
    )
    .orderBy("date")
    .limit(5),
  "recent transactions": db.collection(`${base}/transactions`).orderBy("date", "desc").limit(5),
};

for (const [label, q] of Object.entries(queries)) {
  try {
    const snap = await q.get();
    if (snap.empty) fail(`${label} — returned nothing`);
    else pass(`${label} — ${snap.size} rows`);
  } catch (err) {
    const missingIndex = String(err.message).includes("requires an index");
    fail(`${label} — ${missingIndex ? "MISSING INDEX (still building?)" : err.message}`);
  }
}

/* -------------------------------- members --------------------------------- */

const members = await db.collection(`${base}/members`).count().get();
console.log("");
if (members.data().count === 0) {
  console.log(
    "  note  no members yet — sign in to the app once, then:\n" +
      `        npm run grant -- ${process.env.SEED_OWNER_EMAIL || "you@example.com"} owner`,
  );
} else {
  pass(`${members.data().count} member(s) with access`);
}

console.log(failures ? `\n  ${failures} check(s) failed.\n` : "\n  All checks passed.\n");
process.exit(failures ? 1 : 0);
