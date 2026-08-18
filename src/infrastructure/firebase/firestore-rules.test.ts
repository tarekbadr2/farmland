import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

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

// permission sets mirroring src/core/auth/permissions.ts
const WORKER = ["animals.read", "milk.read", "feeding.*", "tasks.*"];
const MANAGER = ["animals.*", "milk.*", "feeding.*", "accounting.*", "org.members", "org.settings"];

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
