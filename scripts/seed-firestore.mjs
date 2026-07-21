#!/usr/bin/env node
/**
 * Seeds a Firestore project with the demo herd.
 *
 *   node scripts/seed-firestore.mjs --dry-run          # count writes, touch nothing
 *   node scripts/seed-firestore.mjs                    # seed, 14 days of milk records
 *   node scripts/seed-firestore.mjs --milk-days 30     # deeper lactation charts
 *   node scripts/seed-firestore.mjs --wipe             # delete the farm first
 *
 * Auth: uses firebase-admin, so it bypasses security rules. Point
 * GOOGLE_APPLICATION_CREDENTIALS at a service-account JSON downloaded from
 * Firebase console → Project settings → Service accounts. Keep that file out of
 * git; .gitignore already covers *.serviceaccount.json.
 *
 * Write budget matters. Firestore's free tier allows 20,000 writes/day and this
 * script tells you the total before it starts.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createInterface } from "node:readline/promises";
// Run through tsx (see the npm scripts) so the TypeScript dataset and its
// "@/" path aliases resolve exactly as they do in the app.
// firebase-admin is imported lazily so --dry-run works with no credentials.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Load .env.local the same way Next does, so GOOGLE_APPLICATION_CREDENTIALS and
// SEED_OWNER_EMAIL live in one place instead of being exported by hand.
try {
  process.loadEnvFile(path.join(root, ".env.local"));
} catch {
  // No .env.local — fall back to whatever is already in the environment.
}

/* ----------------------------------- args --------------------------------- */

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const DRY_RUN = flag("dry-run");
const WIPE = flag("wipe");
const MILK_DAYS = Number(option("milk-days", 14));
const FARM_ID = option("farm", process.env.NEXT_PUBLIC_FARM_ID || "farm_nile_delta");
const OWNER_EMAIL = option("owner", process.env.SEED_OWNER_EMAIL || "");

/* --------------------------- load the TS dataset --------------------------- */
// The generator lives in TypeScript next to the app so there is exactly one
// definition of the demo herd. tsx compiles it on the fly.

// Windows needs file:// URLs for dynamic import of absolute paths.
const src = (rel) => pathToFileURL(path.join(root, rel)).href;

const { getDataset, TODAY } = await import(src("src/core/data/seed.ts"));
const { animalSearchFields } = await import(src("src/infrastructure/firebase/paths.ts"));
const { animalMilkSeries } = await import(src("src/core/repositories/demo-repository.ts"));

const db_ = getDataset();

/* --------------------------------- firebase -------------------------------- */

async function initAdmin() {
  const { requireCredentials } = await import(src("scripts/grant-role.mjs"));
  requireCredentials(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");

  const raw = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  initializeApp({ credential: cert(raw), projectId: raw.project_id });
  return getFirestore();
}

/* --------------------------------- planning -------------------------------- */

const farmPath = `farms/${FARM_ID}`;

/** Everything to write, as [collectionPath, docId, data] triples. */
function plan() {
  const out = [];
  const push = (col, id, data) => out.push([`${farmPath}/${col}`, String(id), data]);

  const lactating = db_.animals.filter((a) => a.milkStatus === "lactating");
  const counts = {
    total: db_.animals.filter((a) => a.status !== "dead").length,
    lactating: lactating.length,
    dry: db_.animals.filter((a) => a.milkStatus === "dry").length,
    calves: db_.animals.filter((a) => a.isCalf).length,
    pregnant: db_.animals.filter((a) => a.reproStatus === "pregnant").length,
  };

  db_.zones.forEach((z) => push("zones", z.id, z));
  db_.animals.forEach((a) => push("animals", a.id, { ...a, ...animalSearchFields(a) }));
  db_.employees.forEach((e) => push("employees", e.id, e));
  db_.attendance.forEach((a) => push("attendance", a.id, a));
  db_.partners.forEach((p) => push("partners", p.id, p));
  db_.feedItems.forEach((f) => push("feedItems", f.id, f));
  db_.rations.forEach((r) => push("rations", r.id, r));
  db_.feedConsumption.forEach((c) => push("feedConsumption", c.id, c));
  db_.inventory.forEach((i) => push("inventory", i.id, i));
  db_.movements.forEach((m) => push("stockMovements", m.id, m));
  db_.health.forEach((h) => push("health", h.id, h));
  db_.breeding.forEach((b) => push("breeding", b.id, b));
  db_.semen.forEach((s) => push("semen", s.id, s));
  db_.tasks.forEach((t) => push("tasks", t.id, t));
  db_.transactions.forEach((t) => push("transactions", t.id, t));
  db_.invoices.forEach((i) => push("invoices", i.id, i));
  db_.alerts.forEach((a) => push("alerts", a.id, a));
  db_.utilities.forEach((u) => push("utilities", u.date, u));
  db_.milkDaily.forEach((d) => push("milkDaily", d.date, d));
  push("telemetry", "weather", db_.weather);

  // Per-animal milk records are the expensive part: lactating × days × 2.
  // Everything after today's date comes from the parlor integration.
  if (MILK_DAYS > 0) {
    lactating.forEach((a) => {
      animalMilkSeries(a, MILK_DAYS).forEach((r) => {
        push("milkRecords", `${r.date}_${r.animalId}_${r.session}`, {
          ...r,
          recordedAt: new Date(`${r.date}T${r.session === "morning" ? "06:00" : "17:30"}:00Z`),
        });
      });
    });
  }

  return { docs: out, counts };
}

/* --------------------------------- execution ------------------------------- */

async function wipeFarm(db) {
  const collections = await db.doc(farmPath).listCollections();
  for (const col of collections) {
    process.stdout.write(`  wiping ${col.id}… `);
    let deleted = 0;
    for (;;) {
      const snap = await col.limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
    }
    console.log(`${deleted} docs`);
  }
}

async function main() {
  const { docs, counts } = plan();
  const total = docs.length + 1; // + the farm document itself

  console.log("");
  console.log(`  Farm        ${FARM_ID}`);
  console.log(`  Anchor date ${TODAY}`);
  console.log(`  Milk detail ${MILK_DAYS} days × ${counts.lactating} lactating animals`);
  console.log(`  Documents   ${total.toLocaleString()}`);
  if (total > 20000) {
    console.log("");
    console.log(`  ⚠  Over the 20,000/day Spark-plan write quota.`);
    console.log(`     Re-run with --milk-days ${Math.max(0, MILK_DAYS - 7)} or enable billing.`);
  }
  console.log("");

  if (DRY_RUN) {
    const byCollection = {};
    docs.forEach(([col]) => {
      const name = col.split("/").pop();
      byCollection[name] = (byCollection[name] ?? 0) + 1;
    });
    Object.entries(byCollection)
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, n]) => console.log(`  ${String(n).padStart(6)}  ${name}`));
    console.log("\n  Dry run — nothing written.\n");
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    WIPE
      ? `  This DELETES everything under ${farmPath}, then reseeds. Type "wipe" to continue: `
      : `  Write ${total.toLocaleString()} documents to ${farmPath}? [y/N] `,
  );
  rl.close();
  if (WIPE ? answer.trim() !== "wipe" : !/^y(es)?$/i.test(answer.trim())) {
    console.log("  Cancelled.\n");
    return;
  }

  const db = await initAdmin();

  if (WIPE) {
    console.log("\n  Wiping…");
    await wipeFarm(db);
  }

  await db.doc(farmPath).set({ ...db_.farm, counts, seededAt: new Date() });

  // Members: the owner account. Firebase Auth uid is only known after the
  // person signs in once, so we key by email and let the app claim it.
  if (OWNER_EMAIL) {
    await db.doc(`${farmPath}/pendingMembers/${OWNER_EMAIL.toLowerCase()}`).set({
      role: "owner",
      permissions: ["*"],
      email: OWNER_EMAIL.toLowerCase(),
      invitedAt: new Date(),
    });
    console.log(`\n  Owner invite created for ${OWNER_EMAIL}`);
  }

  console.log("\n  Writing…");
  const CHUNK = 400; // Firestore caps a batch at 500 operations
  let written = 0;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = db.batch();
    docs.slice(i, i + CHUNK).forEach(([col, id, data]) => {
      batch.set(db.collection(col).doc(id), stripUndefined(data));
    });
    await batch.commit();
    written += Math.min(CHUNK, docs.length - i);
    process.stdout.write(`\r  ${written.toLocaleString()} / ${docs.length.toLocaleString()}`);
  }

  console.log("\n\n  Done.");
  console.log("  Next: firebase deploy --only firestore:rules,firestore:indexes\n");
}

/** Firestore rejects `undefined`; the domain model uses it for optional fields. */
function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)]),
    );
  }
  return value;
}

main().catch((err) => {
  console.error("\n  Failed:", err.message);
  process.exit(1);
});
