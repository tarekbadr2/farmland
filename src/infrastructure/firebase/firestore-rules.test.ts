import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

/**
 * Security-rule tests for firestore.rules.
 *
 * These need the Firestore emulator, so they SKIP in the normal `vitest run`
 * (which has no emulator) and run only under:
 *
 *   npm run test:rules      # firebase emulators:exec wraps this file
 *
 * They lock in the guarantees this codebase makes: per-tenant isolation, the
 * permission model, the subscription write-gate, and the no-self-promotion and
 * server-only-billing-field rules.
 */
const RUN = !!process.env.FIRESTORE_EMULATOR_HOST;

const FARM = "farmA";
const OTHER = "farmB";

// Permission sets mirroring src/core/auth/permissions.ts. These are CONCRETE
// keys, exactly as the app stores them (owner is the only '*' holder) — the
// grant-subset rule is token-exact, so fixtures must match reality.
const WORKER = ["animals.read", "milk.read", "feeding.read", "feeding.write", "tasks.read", "tasks.write"];
const MANAGER = [
  "animals.read", "animals.write", "animals.delete",
  "medical.read", "medical.write",
  "breeding.read", "breeding.write",
  "milk.read", "milk.write",
  "feeding.read", "feeding.write",
  "inventory.read", "inventory.write",
  "tasks.read", "tasks.write",
  "expenses.read", "expenses.write",
  "accounting.read", "accounting.write",
  "employees.read", "employees.manage",
  "reports.read", "audit.read",
  "org.members", "org.settings",
];
// A custom member: can manage members (org.members) but has NO accounting —
// the C-2 amplification victim shape.
const MGR_NO_ACCT = ["animals.read", "animals.write", "milk.read", "milk.write", "org.members", "org.settings"];

describe.skipIf(!RUN)("firestore.rules", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "herd-rules-test",
      firestore: { rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8") },
    });
  });
  afterAll(async () => env && env.cleanup());

  beforeEach(async () => {
    await env.clearFirestore();
    // Seed two tenants with admin (rules bypassed) so tests start from real state.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const active = { subscription: { status: "active", access: "active" }, plan: "starter", animalLimit: 1000, orgId: "orgA", ownerId: "owner" };
      await setDoc(doc(db, `farms/${FARM}`), active);
      await setDoc(doc(db, `farms/${OTHER}`), { ...active, orgId: "orgB", ownerId: "stranger" });
      await setDoc(doc(db, `farms/${FARM}/members/owner`), { role: "owner", permissions: ["*"] });
      await setDoc(doc(db, `farms/${FARM}/members/worker`), { role: "farm_worker", permissions: WORKER });
      await setDoc(doc(db, `farms/${FARM}/members/mgr`), { role: "farm_manager", permissions: MANAGER });
      await setDoc(doc(db, `farms/${FARM}/members/mgrNoAcct`), { role: "custom", permissions: MGR_NO_ACCT });
      await setDoc(doc(db, `farms/${OTHER}/members/stranger`), { role: "owner", permissions: ["*"] });
    });
  });

  const as = (uid: string) => env.authenticatedContext(uid).firestore();

  it("blocks cross-tenant access regardless of client-supplied farmId", async () => {
    // A member of farm B cannot read or write farm A's data.
    await assertFails(getDoc(doc(as("stranger"), `farms/${FARM}/animals/x`)));
    await assertFails(setDoc(doc(as("stranger"), `farms/${FARM}/animals/x`), { tag: "hack" }));
    // A signed-in non-member of any farm is denied too.
    await assertFails(getDoc(doc(as("ghost"), `farms/${FARM}/animals/x`)));
  });

  it("enforces the permission model for reads and writes", async () => {
    // Worker may read the herd but not post to the ledger or read the books.
    await assertSucceeds(getDoc(doc(as("worker"), `farms/${FARM}/animals/x`)));
    await assertFails(
      setDoc(doc(as("worker"), `farms/${FARM}/journalEntries/j1`), { lines: [] }),
    );
    await assertFails(getDoc(doc(as("worker"), `farms/${FARM}/journalEntries/j1`)));
    // Manager (accounting.*) may.
    await assertSucceeds(getDoc(doc(as("mgr"), `farms/${FARM}/journalEntries/j1`)));
  });

  it("stops a manager from self-promoting to owner", async () => {
    // A manager holds org.members but cannot mint owner / '*' or edit own role.
    await assertFails(
      setDoc(doc(as("mgr"), `farms/${FARM}/members/mgr`), { role: "owner", permissions: ["*"] }),
    );
    await assertFails(
      setDoc(doc(as("mgr"), `farms/${FARM}/members/newbie`), { role: "owner", permissions: ["*"] }),
    );
    // But may add a normal member.
    await assertSucceeds(
      setDoc(doc(as("mgr"), `farms/${FARM}/members/newbie`), { role: "farm_worker", permissions: WORKER }),
    );
    // The owner may grant owner.
    await assertSucceeds(
      setDoc(doc(as("owner"), `farms/${FARM}/members/newowner`), { role: "owner", permissions: ["*"] }),
    );
  });

  it("C-2: a member cannot grant permissions it does not hold (no lateral amplification)", async () => {
    // mgrNoAcct has org.members but NOT accounting. It must not be able to mint a
    // second account that does, nor hand accounting to an existing colleague.
    await assertFails(
      setDoc(doc(as("mgrNoAcct"), `farms/${FARM}/members/mgr_alt`), {
        role: "custom",
        permissions: ["accounting.read", "accounting.write", "employees.manage", "org.members"],
      }),
    );
    await assertFails(
      setDoc(doc(as("mgrNoAcct"), `farms/${FARM}/members/worker`), {
        role: "farm_worker",
        permissions: [...WORKER, "accounting.write"],
      }),
    );
    // It CAN still grant within its own set (a subset it actually holds).
    await assertSucceeds(
      setDoc(doc(as("mgrNoAcct"), `farms/${FARM}/members/helper`), {
        role: "custom",
        permissions: ["animals.read", "milk.read"],
      }),
    );
    // A full manager (a superset of every role) is unaffected — it can still
    // create any standard role.
    await assertSucceeds(
      setDoc(doc(as("mgr"), `farms/${FARM}/members/vet`), {
        role: "veterinarian",
        permissions: ["animals.read", "medical.read", "medical.write", "breeding.read", "reports.read"],
      }),
    );
  });

  it("H-1: a lapsed (blocked) farm rejects destructive writes, not just creates", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `farms/${FARM}`), { subscription: { status: "past_due", access: "blocked" } }, { merge: true });
      // Records that already exist, to try to destroy.
      await setDoc(doc(db, `farms/${FARM}/milkRecords/m1`), { volumeL: 10, recordedAt: Timestamp.fromDate(new Date()) });
      await setDoc(doc(db, `farms/${FARM}/health/h1`), { animalId: "a1" });
      await setDoc(doc(db, `farms/${FARM}/breeding/b1`), { animalId: "a1" });
    });
    // Reads still work (a lapsed farm can view/export its own data).
    await assertSucceeds(getDoc(doc(as("mgr"), `farms/${FARM}/milkRecords/m1`)));
    // Every destructive path is now closed.
    await assertFails(deleteDoc(doc(as("owner"), `farms/${FARM}/milkRecords/m1`)));
    await assertFails(setDoc(doc(as("owner"), `farms/${FARM}/milkRecords/m1`), { volumeL: 99 }, { merge: true }));
    await assertFails(deleteDoc(doc(as("owner"), `farms/${FARM}/health/h1`)));
    await assertFails(deleteDoc(doc(as("owner"), `farms/${FARM}/breeding/b1`)));
    await assertFails(setDoc(doc(as("owner"), `farms/${FARM}/docCounters/JV-2026`), { next: 500 }));
    await assertFails(
      setDoc(doc(as("owner"), `farms/${FARM}/members/newbie`), { role: "farm_worker", permissions: WORKER }),
    );
  });

  it("H-2: audit entries must be self-attributed and server-timestamped", async () => {
    // A worker cannot forge an entry as the owner.
    await assertFails(
      setDoc(doc(as("worker"), `farms/${FARM}/auditLog/forged`), {
        actorUid: "owner", actorName: "Owner", actorRole: "owner",
        serverAt: serverTimestamp(), category: "animals", action: "delete", summary: "framed",
      }),
    );
    // Even self-attributed, an entry without the server timestamp is refused
    // (no back-/future-dating to bury history).
    await assertFails(
      setDoc(doc(as("worker"), `farms/${FARM}/auditLog/nodate`), {
        actorUid: "worker", at: "2999-01-01T00:00:00.000Z", category: "animals", action: "update", summary: ".",
      }),
    );
    // A correct entry — own uid, server timestamp — is allowed.
    await assertSucceeds(
      setDoc(doc(as("worker"), `farms/${FARM}/auditLog/ok`), {
        actorUid: "worker", serverAt: serverTimestamp(), category: "animals", action: "update", summary: ".",
      }),
    );
    // And it stays immutable.
    await assertFails(
      setDoc(doc(as("worker"), `farms/${FARM}/auditLog/ok`), { summary: "edited" }, { merge: true }),
    );
    await assertFails(deleteDoc(doc(as("owner"), `farms/${FARM}/auditLog/ok`)));
  });

  it("H-4: an animal is never hard-deleted, even by a delete-permission holder", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `farms/${FARM}/animals/a1`), { tag: "A1" });
      await setDoc(doc(ctx.firestore(), `farms/${FARM}/zones/z1`), { name: "Pen 1" });
    });
    // mgr's fixture still carries animals.delete; the rule refuses anyway.
    await assertFails(deleteDoc(doc(as("mgr"), `farms/${FARM}/animals/a1`)));
    await assertFails(deleteDoc(doc(as("owner"), `farms/${FARM}/animals/a1`)));
    // Zones the same — a pen deletion would orphan every animal's zoneId.
    await assertFails(deleteDoc(doc(as("mgr"), `farms/${FARM}/zones/z1`)));
    await assertFails(deleteDoc(doc(as("owner"), `farms/${FARM}/zones/z1`)));
  });

  it("H-3: creating an animal is refused once the herd cap is reached", async () => {
    // Below the cap: allowed.
    await assertSucceeds(setDoc(doc(as("mgr"), `farms/${FARM}/animals/new1`), { tag: "N1" }));
    // At/over the cap: refused. animalLimit is 1000 on the seeded farm.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `farms/${FARM}`), { counts: { total: 1000 } }, { merge: true });
    });
    await assertFails(setDoc(doc(as("mgr"), `farms/${FARM}/animals/new2`), { tag: "N2" }));
    // Editing an existing animal is NOT capped (update, not create).
    await assertSucceeds(
      setDoc(doc(as("mgr"), `farms/${FARM}/animals/new1`), { name: "renamed" }, { merge: true }),
    );
  });

  it("M-3: a tag claim is create-once and immutable (uniqueness backing)", async () => {
    // A writer can claim a free tag...
    await assertSucceeds(setDoc(doc(as("mgr"), `farms/${FARM}/tagIndex/eg-204`), { animalId: "a1", tag: "EG-204" }));
    // ...but the claim can't be overwritten to point at another animal (this
    // immutability is what makes "already claimed" a reliable duplicate signal).
    await assertFails(setDoc(doc(as("mgr"), `farms/${FARM}/tagIndex/eg-204`), { animalId: "a2", tag: "EG-204" }));
    // A read-only worker can neither claim nor read-around it.
    await assertFails(setDoc(doc(as("worker"), `farms/${FARM}/tagIndex/eg-999`), { animalId: "a9", tag: "EG-999" }));
    // Moving a tag is delete + re-create; a writer may delete a claim.
    await assertSucceeds(deleteDoc(doc(as("mgr"), `farms/${FARM}/tagIndex/eg-204`)));
  });

  it("M-4: weights need a herd-write permission and a plausible value", async () => {
    // A read-only worker can no longer write weights.
    await assertFails(setDoc(doc(as("worker"), `farms/${FARM}/animals/a1/weights/w1`), { weightKg: 650, date: "2026-08-01" }));
    // A writer can, with a sane value.
    await assertSucceeds(setDoc(doc(as("mgr"), `farms/${FARM}/animals/a1/weights/w2`), { weightKg: 650, date: "2026-08-01" }));
    // Absurd or negative values are rejected even for a writer.
    await assertFails(setDoc(doc(as("mgr"), `farms/${FARM}/animals/a1/weights/w3`), { weightKg: -5, date: "2026-08-01" }));
    await assertFails(setDoc(doc(as("mgr"), `farms/${FARM}/animals/a1/weights/w4`), { weightKg: 999999, date: "2026-08-01" }));
  });

  it("makes the ledger rollups readable but never client-writable", async () => {
    // The rollups ARE the books now — statements are composed from them rather
    // than from a scan of the journal. A client that could write one could
    // restate the accounts without leaving a journal entry behind, so the
    // trigger's admin credentials are the only way in.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `farms/${FARM}/ledgerRollups/2026-03__b1__fy2026`), {
        period: "2026-03",
        accounts: { "1000": { debit: 100, credit: 0 } },
        entryCount: 1,
      });
    });
    // accounting.read (the manager) may read; the worker, who has no accounting
    // permission at all, may not.
    await assertSucceeds(getDoc(doc(as("mgr"), `farms/${FARM}/ledgerRollups/2026-03__b1__fy2026`)));
    await assertFails(getDoc(doc(as("worker"), `farms/${FARM}/ledgerRollups/2026-03__b1__fy2026`)));
    // Nobody writes them — not even the owner.
    await assertFails(
      setDoc(doc(as("owner"), `farms/${FARM}/ledgerRollups/2026-03__b1__fy2026`), {
        accounts: { "1000": { debit: 999999, credit: 0 } },
      }),
    );
    await assertFails(
      setDoc(doc(as("owner"), `farms/${FARM}/ledgerRollups/2026-04__b1__fy2026`), { accounts: {} }),
    );
  });

  it("keeps billing/structural farm fields server-only", async () => {
    // Even the owner can't raise the herd cap or edit the subscription client-side.
    await assertFails(
      setDoc(doc(as("owner"), `farms/${FARM}`), { animalLimit: 999999 }, { merge: true }),
    );
    // Must be a real *change* to prove anything: re-writing the subscription
    // map byte-for-byte is a no-op the rule has no reason to reject, so a
    // payload identical to the seeded value tested nothing.
    await assertFails(
      setDoc(
        doc(as("owner"), `farms/${FARM}`),
        { subscription: { status: "active", access: "active", tier: "enterprise" } },
        { merge: true },
      ),
    );
    // The threat this actually guards: a lapsed tenant unblocking itself.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `farms/${FARM}`),
        { subscription: { status: "past_due", access: "blocked" } },
        { merge: true },
      );
    });
    await assertFails(
      setDoc(
        doc(as("owner"), `farms/${FARM}`),
        { subscription: { status: "active", access: "active" } },
        { merge: true },
      ),
    );
    // A pure settings change (name) is allowed.
    await assertSucceeds(
      setDoc(doc(as("owner"), `farms/${FARM}`), { name: "New name" }, { merge: true }),
    );
  });

  it("still lets a legacy farm (no billing fields) save settings", async () => {
    // A farm provisioned before `subscription`/`aiUsage` existed has neither
    // field. A bare `data.aiUsage` in the rule is an evaluation error on such a
    // doc, and an erroring rule denies — which locked those tenants out of
    // their own settings screen. Absence must read as "unchanged", not as a
    // failure, while the fields stay server-only.
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `farms/${FARM}`), { plan: "starter", animalLimit: 1000, orgId: "orgA", ownerId: "owner" });
    });
    await assertSucceeds(
      setDoc(doc(as("owner"), `farms/${FARM}`), { name: "Legacy farm" }, { merge: true }),
    );
    // ...and the client still cannot introduce them itself.
    await assertFails(
      setDoc(doc(as("owner"), `farms/${FARM}`), { subscription: { access: "active", status: "active" } }, { merge: true }),
    );
    await assertFails(
      setDoc(doc(as("owner"), `farms/${FARM}`), { aiUsage: { month: "2026-08", count: 0 } }, { merge: true }),
    );
  });

  it("makes a lapsed (blocked) farm read-only", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `farms/${FARM}`),
        { subscription: { status: "past_due", access: "blocked" } },
        { merge: true },
      );
    });
    // Reads still work; writes are denied while access is blocked.
    await assertSucceeds(getDoc(doc(as("mgr"), `farms/${FARM}/animals/x`)));
    await assertFails(setDoc(doc(as("mgr"), `farms/${FARM}/animals/x`), { tag: "A1" }));
  });
});
