#!/usr/bin/env node
/**
 * RBAC walk against the real firestore.rules, via the emulator.
 *
 *   npx firebase emulators:exec --only firestore "node scripts/rules.test.mjs"
 *
 * Verifies every role (owner / manager / veterinarian / accountant / worker)
 * plus the signed-in-but-not-a-member case against the exact ruleset that is
 * deployed to production. No live data is touched.
 */

import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";

const FARM = "farm_nile_delta";
const P = `farms/${FARM}`;

const testEnv = await initializeTestEnvironment({
  projectId: "herdos-rules-test",
  firestore: { rules: readFileSync("firestore.rules", "utf8") },
});

// Identities.
const owner = testEnv.authenticatedContext("owner").firestore();
const manager = testEnv.authenticatedContext("manager").firestore();
const vet = testEnv.authenticatedContext("vet").firestore();
const acct = testEnv.authenticatedContext("acct").firestore();
const worker = testEnv.authenticatedContext("worker").firestore();
const stranger = testEnv.authenticatedContext("stranger").firestore();

// ---- Seed baseline data with rules disabled -----------------------------
const now = Timestamp.now();
const threeDaysAgo = Timestamp.fromMillis(now.toMillis() - 3 * 86400 * 1000);

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, P), { name: "Test Farm", counts: { total: 1 } });
  await setDoc(doc(db, `${P}/members/owner`), { role: "owner", email: "o@x.com", permissions: ["*"] });
  await setDoc(doc(db, `${P}/members/manager`), { role: "manager", employeeId: "emp_m" });
  await setDoc(doc(db, `${P}/members/vet`), { role: "veterinarian" });
  await setDoc(doc(db, `${P}/members/acct`), { role: "accountant" });
  await setDoc(doc(db, `${P}/members/worker`), { role: "worker", employeeId: "emp_w" });

  await setDoc(doc(db, `${P}/animals/an1`), { tag: "T-1", status: "active" });
  await setDoc(doc(db, `${P}/milkRecords/fresh`), { volumeL: 10, recordedAt: now });
  await setDoc(doc(db, `${P}/milkRecords/old`), { volumeL: 10, recordedAt: threeDaysAgo });
  await setDoc(doc(db, `${P}/employees/emp1`), { name: "Ali", salary: 5000 });
  await setDoc(doc(db, `${P}/transactions/tx1`), { amount: 100, kind: "income" });
  await setDoc(doc(db, `${P}/invoices/inv1`), { total: 500 });
  await setDoc(doc(db, `${P}/tasks/task_w`), { assigneeId: "emp_w", status: "todo" });
  await setDoc(doc(db, `${P}/tasks/task_other`), { assigneeId: "emp_x", status: "todo" });
  await setDoc(doc(db, `${P}/alerts/al1`), { read: false, title: "x" });
  await setDoc(doc(db, `${P}/pendingMembers/new@x.com`), { role: "worker" });
});

// ---- Assertion harness ---------------------------------------------------
let pass = 0;
let fail = 0;
const results = [];
async function check(label, shouldAllow, op) {
  try {
    await (shouldAllow ? assertSucceeds(op()) : assertFails(op()));
    results.push(`  ok    ${label}`);
    pass++;
  } catch (e) {
    results.push(`  FAIL  ${label}  (${e.message.split("\n")[0]})`);
    fail++;
  }
}

const ALLOW = true;
const DENY = false;

// ---- Non-member (stranger) ----------------------------------------------
await check("stranger reads own (absent) member doc — login resolves", ALLOW, () =>
  getDoc(doc(stranger, `${P}/members/stranger`)));
await check("stranger cannot read another's member doc", DENY, () =>
  getDoc(doc(stranger, `${P}/members/owner`)));
await check("stranger cannot read the farm", DENY, () => getDoc(doc(stranger, P)));
await check("stranger cannot read animals", DENY, () => getDoc(doc(stranger, `${P}/animals/an1`)));

// ---- Worker --------------------------------------------------------------
await check("worker reads animals", ALLOW, () => getDoc(doc(worker, `${P}/animals/an1`)));
await check("worker reads milk", ALLOW, () => getDoc(doc(worker, `${P}/milkRecords/fresh`)));
await check("worker CANNOT read employees (salaries sealed)", DENY, () =>
  getDoc(doc(worker, `${P}/employees/emp1`)));
await check("worker CANNOT read transactions", DENY, () =>
  getDoc(doc(worker, `${P}/transactions/tx1`)));
await check("worker CANNOT read invoices", DENY, () => getDoc(doc(worker, `${P}/invoices/inv1`)));
await check("worker creates a valid milk record", ALLOW, () =>
  setDoc(doc(worker, `${P}/milkRecords/w1`), { volumeL: 12, recordedAt: now }));
await check("worker CANNOT record an impossible 90 L", DENY, () =>
  setDoc(doc(worker, `${P}/milkRecords/w2`), { volumeL: 90, recordedAt: now }));
await check("worker CANNOT edit animals", DENY, () =>
  updateDoc(doc(worker, `${P}/animals/an1`), { tag: "hacked" }));
await check("worker CANNOT promote themselves", DENY, () =>
  updateDoc(doc(worker, `${P}/members/worker`), { role: "owner" }));
await check("worker updates status on THEIR task", ALLOW, () =>
  updateDoc(doc(worker, `${P}/tasks/task_w`), { status: "done" }));
await check("worker CANNOT touch someone else's task", DENY, () =>
  updateDoc(doc(worker, `${P}/tasks/task_other`), { status: "done" }));
await check("worker CANNOT change non-status task fields", DENY, () =>
  updateDoc(doc(worker, `${P}/tasks/task_w`), { assigneeId: "emp_w2" }));
await check("worker marks an alert read", ALLOW, () =>
  updateDoc(doc(worker, `${P}/alerts/al1`), { read: true }));
await check("worker CANNOT edit other alert fields", DENY, () =>
  updateDoc(doc(worker, `${P}/alerts/al1`), { title: "spoof" }));
await check("member CANNOT rewrite a frozen (>2d) milk record", DENY, () =>
  updateDoc(doc(worker, `${P}/milkRecords/old`), { volumeL: 5 }));

// ---- Veterinarian --------------------------------------------------------
await check("vet edits animal health fields", ALLOW, () =>
  updateDoc(doc(vet, `${P}/animals/an1`), { healthScore: 80 }));
await check("vet creates a health event", ALLOW, () =>
  setDoc(doc(vet, `${P}/health/h1`), { animalId: "an1", type: "diagnosis" }));
await check("vet creates a breeding event", ALLOW, () =>
  setDoc(doc(vet, `${P}/breeding/b1`), { animalId: "an1", type: "ai" }));
await check("vet CANNOT read transactions", DENY, () => getDoc(doc(vet, `${P}/transactions/tx1`)));
await check("vet CANNOT write feed items", DENY, () =>
  setDoc(doc(vet, `${P}/feedItems/f1`), { name: "hay" }));

// ---- Accountant ----------------------------------------------------------
await check("accountant reads transactions", ALLOW, () => getDoc(doc(acct, `${P}/transactions/tx1`)));
await check("accountant writes a transaction", ALLOW, () =>
  setDoc(doc(acct, `${P}/transactions/tx2`), { amount: 50, kind: "expense" }));
await check("accountant reads employees", ALLOW, () => getDoc(doc(acct, `${P}/employees/emp1`)));
await check("accountant CANNOT edit animals", DENY, () =>
  updateDoc(doc(acct, `${P}/animals/an1`), { tag: "no" }));
await check("accountant CANNOT create health events", DENY, () =>
  setDoc(doc(acct, `${P}/health/h2`), { animalId: "an1", type: "diagnosis" }));

// ---- Manager -------------------------------------------------------------
await check("manager edits animals", ALLOW, () =>
  updateDoc(doc(manager, `${P}/animals/an1`), { weightKg: 500 }));
await check("manager writes feed items", ALLOW, () =>
  setDoc(doc(manager, `${P}/feedItems/f2`), { name: "silage" }));
await check("manager reads employees", ALLOW, () => getDoc(doc(manager, `${P}/employees/emp1`)));
await check("manager CANNOT write transactions (owner/acct only)", DENY, () =>
  setDoc(doc(manager, `${P}/transactions/tx3`), { amount: 1 }));
await check("manager CANNOT delete an animal (owner only)", DENY, () =>
  deleteDoc(doc(manager, `${P}/animals/an1`)));
await check("manager CANNOT change roster/roles", DENY, () =>
  updateDoc(doc(manager, `${P}/members/worker`), { role: "manager" }));

// ---- Owner ---------------------------------------------------------------
await check("owner reads the roster", ALLOW, () => getDoc(doc(owner, `${P}/members/worker`)));
await check("owner grants a role", ALLOW, () =>
  updateDoc(doc(owner, `${P}/members/worker`), { role: "manager" }));
await check("owner writes transactions", ALLOW, () =>
  setDoc(doc(owner, `${P}/transactions/tx4`), { amount: 9, kind: "income" }));
await check("owner deletes an animal", ALLOW, () => deleteDoc(doc(owner, `${P}/animals/an1`)));
await check("owner manages pending invites", ALLOW, () =>
  getDoc(doc(owner, `${P}/pendingMembers/new@x.com`)));

// ---- Report --------------------------------------------------------------
console.log("\n  RBAC walk — deployed firestore.rules\n");
console.log(results.join("\n"));
console.log(`\n  ${pass} passed, ${fail} failed\n`);
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
