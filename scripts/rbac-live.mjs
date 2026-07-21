#!/usr/bin/env node
/**
 * Multi-role RBAC walk against LIVE production rules.
 *
 *   node scripts/rbac-live.mjs
 *
 * Mints a Firebase ID token for each role (via admin custom tokens), then hits
 * the real Firestore REST API as that identity and records allow (200/404) vs
 * deny (403) against the deployed firestore.rules. Read checks use existing
 * data (no mutation); write checks use sentinel docs on collections with no
 * counter triggers. Everything created is removed at the end.
 */

import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(root, ".env.local"));
} catch {
  /* ambient */
}

const FARM = process.env.NEXT_PUBLIC_FARM_ID || "farm_nile_delta";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const raw = JSON.parse(readFileSync(keyPath, "utf8"));
const PROJECT = raw.project_id;

const { initializeApp, cert } = await import("firebase-admin/app");
const { getFirestore, Timestamp } = await import("firebase-admin/firestore");
const { getAuth } = await import("firebase-admin/auth");
initializeApp({ credential: cert(raw), projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();
const P = `farms/${FARM}`;
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// ---- Temp members + sentinels (admin, bypasses rules) -------------------
const now = Timestamp.now();
const old = Timestamp.fromMillis(now.toMillis() - 3 * 86400 * 1000);
const roles = {
  rbac_manager: { role: "manager", employeeId: "emp_rbac_m" },
  rbac_vet: { role: "veterinarian" },
  rbac_acct: { role: "accountant" },
  rbac_worker: { role: "worker", employeeId: "emp_rbac_w" },
};
for (const [uid, data] of Object.entries(roles)) {
  await db.doc(`${P}/members/${uid}`).set(data);
}
await db.doc(`${P}/tasks/rbac_task`).set({ farmId: FARM, assigneeId: "emp_rbac_w", status: "todo", title: "t" });
await db.doc(`${P}/alerts/rbac_alert`).set({ farmId: FARM, read: false, title: "t" });
await db.doc(`${P}/milkRecords/rbac_old`).set({ farmId: FARM, volumeL: 10, recordedAt: old });

// Grab ids of real docs for read checks.
const firstId = async (col) => (await db.collection(`${P}/${col}`).limit(1).get()).docs[0].id;
const realAnimal = await firstId("animals");
const realEmp = await firstId("employees");
const realTx = await firstId("transactions");
const realMilk = await firstId("milkRecords");

// ---- Mint ID tokens ------------------------------------------------------
async function idTokenFor(uid) {
  const custom = await auth.createCustomToken(uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }) },
  );
  const j = await res.json();
  if (!j.idToken) throw new Error(`token exchange failed for ${uid}: ${JSON.stringify(j)}`);
  return j.idToken;
}
const tok = {};
for (const uid of [...Object.keys(roles), "rbac_stranger"]) tok[uid] = await idTokenFor(uid);

// ---- REST helpers --------------------------------------------------------
async function get(uid, docPath) {
  const r = await fetch(`${DOCS}/${docPath}`, { headers: { Authorization: `Bearer ${tok[uid]}` } });
  return r.status;
}
async function patch(uid, docPath, fields, mask) {
  const q = mask ? `?${mask.map((m) => `updateMask.fieldPaths=${m}`).join("&")}` : "";
  const r = await fetch(`${DOCS}/${docPath}${q}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tok[uid]}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  return r.status;
}
const S = (v) => ({ stringValue: v });
const N = (v) => ({ doubleValue: v });
const B = (v) => ({ booleanValue: v });
const TS = (d) => ({ timestampValue: d });

// allow = 200 or 404 (rules permitted; 404 = allowed read of a missing doc)
// deny  = 403
let pass = 0, fail = 0;
const out = [];
function expect(label, status, kind) {
  const allowed = status === 200 || status === 404;
  const ok = kind === "ALLOW" ? allowed : status === 403;
  out.push(`  ${ok ? "ok  " : "FAIL"}  [${status}] ${label}`);
  ok ? pass++ : fail++;
}

// ---- Stranger ------------------------------------------------------------
expect("stranger reads own absent member doc (login resolves)", await get("rbac_stranger", `${P}/members/rbac_stranger`), "ALLOW");
expect("stranger cannot read another member doc", await get("rbac_stranger", `${P}/members/rbac_worker`), "DENY");
expect("stranger cannot read the farm", await get("rbac_stranger", P), "DENY");
expect("stranger cannot read animals", await get("rbac_stranger", `${P}/animals/${realAnimal}`), "DENY");

// ---- Worker --------------------------------------------------------------
expect("worker reads animals", await get("rbac_worker", `${P}/animals/${realAnimal}`), "ALLOW");
expect("worker reads milk", await get("rbac_worker", `${P}/milkRecords/${realMilk}`), "ALLOW");
expect("worker CANNOT read employees (salaries sealed)", await get("rbac_worker", `${P}/employees/${realEmp}`), "DENY");
expect("worker CANNOT read transactions", await get("rbac_worker", `${P}/transactions/${realTx}`), "DENY");
expect("worker records a valid milk session", await patch("rbac_worker", `${P}/milkRecords/rbac_w`, { farmId: S(FARM), volumeL: N(12), recordedAt: TS(now.toDate().toISOString()) }), "ALLOW");
expect("worker CANNOT record an impossible 90 L", await patch("rbac_worker", `${P}/milkRecords/rbac_w2`, { farmId: S(FARM), volumeL: N(90), recordedAt: TS(now.toDate().toISOString()) }), "DENY");
expect("worker CANNOT edit animals", await patch("rbac_worker", `${P}/animals/${realAnimal}`, { tag: S("hacked") }, ["tag"]), "DENY");
expect("worker CANNOT promote themselves", await patch("rbac_worker", `${P}/members/rbac_worker`, { role: S("owner") }, ["role"]), "DENY");
expect("worker updates status on THEIR task", await patch("rbac_worker", `${P}/tasks/rbac_task`, { status: S("done") }, ["status"]), "ALLOW");
expect("worker CANNOT change non-status task fields", await patch("rbac_worker", `${P}/tasks/rbac_task`, { assigneeId: S("emp_x") }, ["assigneeId"]), "DENY");
expect("worker marks an alert read", await patch("rbac_worker", `${P}/alerts/rbac_alert`, { read: B(true) }, ["read"]), "ALLOW");
expect("worker CANNOT edit other alert fields", await patch("rbac_worker", `${P}/alerts/rbac_alert`, { title: S("spoof") }, ["title"]), "DENY");
expect("member CANNOT rewrite a frozen (>2d) milk record", await patch("rbac_worker", `${P}/milkRecords/rbac_old`, { volumeL: N(5) }, ["volumeL"]), "DENY");

// ---- Veterinarian --------------------------------------------------------
expect("vet creates a health event", await patch("rbac_vet", `${P}/health/rbac_h`, { farmId: S(FARM), animalId: S(realAnimal), type: S("diagnosis") }), "ALLOW");
expect("vet creates a breeding event", await patch("rbac_vet", `${P}/breeding/rbac_b`, { farmId: S(FARM), animalId: S(realAnimal), type: S("ai") }), "ALLOW");
expect("vet CANNOT read transactions", await get("rbac_vet", `${P}/transactions/${realTx}`), "DENY");
expect("vet CANNOT write feed items", await patch("rbac_vet", `${P}/feedItems/rbac_f`, { name: S("hay") }), "DENY");

// ---- Accountant ----------------------------------------------------------
expect("accountant reads transactions", await get("rbac_acct", `${P}/transactions/${realTx}`), "ALLOW");
expect("accountant writes a transaction", await patch("rbac_acct", `${P}/transactions/rbac_tx`, { farmId: S(FARM), amount: N(5), kind: S("expense") }), "ALLOW");
expect("accountant reads employees", await get("rbac_acct", `${P}/employees/${realEmp}`), "ALLOW");
expect("accountant CANNOT create health events", await patch("rbac_acct", `${P}/health/rbac_h2`, { farmId: S(FARM), animalId: S(realAnimal), type: S("diagnosis") }), "DENY");

// ---- Manager -------------------------------------------------------------
expect("manager writes feed items", await patch("rbac_manager", `${P}/feedItems/rbac_f2`, { farmId: S(FARM), name: S("silage") }), "ALLOW");
expect("manager reads employees", await get("rbac_manager", `${P}/employees/${realEmp}`), "ALLOW");
expect("manager CANNOT write transactions (owner/acct only)", await patch("rbac_manager", `${P}/transactions/rbac_tx2`, { amount: N(1) }), "DENY");
expect("manager CANNOT change roster/roles", await patch("rbac_manager", `${P}/members/rbac_worker`, { role: S("manager") }, ["role"]), "DENY");

// ---- Cleanup -------------------------------------------------------------
const created = [
  ...Object.keys(roles).map((u) => `members/${u}`),
  "tasks/rbac_task", "alerts/rbac_alert", "milkRecords/rbac_old",
  "milkRecords/rbac_w", "health/rbac_h", "breeding/rbac_b",
  "transactions/rbac_tx", "feedItems/rbac_f2",
];
for (const p of created) await db.doc(`${P}/${p}`).delete();
for (const uid of Object.keys(roles)) await auth.deleteUser(uid).catch(() => {});
await auth.deleteUser("rbac_stranger").catch(() => {});

console.log(`\n  Live RBAC walk — ${PROJECT}/${FARM} (deployed rules)\n`);
console.log(out.join("\n"));
console.log(`\n  ${pass} passed, ${fail} failed  ·  cleaned up ${created.length} docs + role tokens\n`);
process.exit(fail ? 1 : 0);
