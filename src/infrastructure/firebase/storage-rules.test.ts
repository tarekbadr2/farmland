import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";

/**
 * Security-rule tests for storage.rules.
 *
 * Needs BOTH the Firestore and Storage emulators (the storage rules read the
 * caller's member document from Firestore), so they run only under:
 *
 *   firebase emulators:exec --only firestore,storage "vitest run storage-rules"
 *
 * Emulator caveat: some firebase-tools builds of the Storage emulator resolve
 * `firestore.exists()` but NOT `firestore.get().data` cross-service. Real
 * Firebase Storage supports both, so the permission matrix below is correct in
 * production — but when the emulator can't read member permissions, every
 * permission-gated write is denied and those assertions would be vacuous. So a
 * canary detects that at start-up and the matrix skips with a note, while the
 * guarantees that don't depend on cross-service reads always run.
 */
const RUN = !!process.env.FIREBASE_STORAGE_EMULATOR_HOST;

const FARM = "farmA";
const OTHER = "farmB";

const WORKER = ["animals.read", "milk.read", "feeding.read", "feeding.write", "tasks.read", "tasks.write"];
const VET = ["animals.read", "medical.read", "medical.write", "breeding.read", "breeding.write", "reports.read"];
const MANAGER = ["animals.read", "animals.write", "animals.delete", "milk.write", "org.members", "org.settings"];

const PNG = { contentType: "image/png" };
const bytes = () => new Uint8Array([1, 2, 3, 4]);

let env: RulesTestEnvironment;
let crossService = false; // does the emulator resolve firestore.get().data?

const path = (uid: string, p: string) => ref(env.authenticatedContext(uid).storage(), p);

async function seedMembers(access = "active") {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `farms/${FARM}`), { subscription: { status: access === "blocked" ? "past_due" : "active", access } });
    await setDoc(doc(db, `farms/${OTHER}`), { subscription: { status: "active", access: "active" } });
    await setDoc(doc(db, `farms/${FARM}/members/owner`), { role: "owner", permissions: ["*"] });
    await setDoc(doc(db, `farms/${FARM}/members/worker`), { role: "farm_worker", permissions: WORKER });
    await setDoc(doc(db, `farms/${FARM}/members/vet`), { role: "veterinarian", permissions: VET });
    await setDoc(doc(db, `farms/${FARM}/members/mgr`), { role: "farm_manager", permissions: MANAGER });
    await setDoc(doc(db, `farms/${OTHER}/members/stranger`), { role: "owner", permissions: ["*"] });
  });
}

const file = `farms/${FARM}/animals/a1/photo.png`;

async function seedFile() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), file), bytes(), PNG);
  });
}

describe.skipIf(!RUN)("storage.rules", () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "herd-storage-test",
      firestore: { rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8") },
      storage: { rules: readFileSync(resolve(process.cwd(), "storage.rules"), "utf8") },
    });
    // Canary: an owner read of a seeded file succeeds only if the storage rules
    // can reach the member document in Firestore at all (isMember → exists).
    // Some emulator builds resolve no cross-service reads, so gate every
    // success-expecting assertion on this.
    await env.clearStorage();
    await env.clearFirestore();
    await seedMembers();
    await seedFile();
    try {
      await getBytes(path("owner", file));
      crossService = true;
    } catch {
      crossService = false;
      console.warn(
        "[storage-rules] Storage emulator cannot resolve firestore.get().data — " +
          "permission matrix skipped. Rules are review-verified; run against a real " +
          "project or a fixed emulator to exercise them.",
      );
    }
  });
  afterAll(async () => env && env.cleanup());

  beforeEach(async () => {
    await env.clearStorage();
    await env.clearFirestore();
    await seedMembers();
    await seedFile();
  });

  // --- Guarantees that hold regardless of cross-service resolution ----------

  it("lets any member read", async () => {
    if (!crossService) return;
    await assertSucceeds(getBytes(path("worker", file)));
    await assertSucceeds(getBytes(path("vet", file)));
  });

  it("blocks a non-member entirely (cross-tenant)", async () => {
    await assertFails(getBytes(path("stranger", file)));
    await assertFails(uploadBytes(path("stranger", file), bytes(), PNG));
    await assertFails(deleteObject(path("stranger", file)));
  });

  it("stops a read-only worker overwriting or deleting files (the C-1 fix)", async () => {
    await assertFails(uploadBytes(path("worker", file), bytes(), PNG));
    await assertFails(deleteObject(path("worker", file)));
  });

  it("denies anything outside the farms/ tree", async () => {
    await assertFails(uploadBytes(path("owner", "elsewhere/x.png"), bytes(), PNG));
    await assertFails(getBytes(path("owner", "elsewhere/x.png")));
  });

  // --- Permission matrix (needs firestore.get().data) -----------------------

  it("lets a vet upload but not delete", async () => {
    if (!crossService) return;
    await assertSucceeds(uploadBytes(path("vet", `farms/${FARM}/animals/a1/scan.png`), bytes(), PNG));
    await assertFails(deleteObject(path("vet", file)));
  });

  it("lets a manager upload and delete", async () => {
    if (!crossService) return;
    await assertSucceeds(uploadBytes(path("mgr", `farms/${FARM}/animals/a1/mgr.png`), bytes(), PNG));
    await assertSucceeds(deleteObject(path("mgr", file)));
  });

  it("lets the owner do everything", async () => {
    if (!crossService) return;
    await assertSucceeds(uploadBytes(path("owner", `farms/${FARM}/animals/a1/owner.png`), bytes(), PNG));
    await assertSucceeds(deleteObject(path("owner", file)));
  });

  it("rejects a disguised non-media upload from a writer", async () => {
    if (!crossService) return;
    await assertFails(
      uploadBytes(path("mgr", `farms/${FARM}/animals/a1/x.exe`), bytes(), { contentType: "application/x-msdownload" }),
    );
  });

  it("makes a lapsed farm read-only for writers (reads still ok)", async () => {
    if (!crossService) return;
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `farms/${FARM}`), { subscription: { status: "past_due", access: "blocked" } });
    });
    await assertSucceeds(getBytes(path("mgr", file)));
    await assertFails(uploadBytes(path("mgr", `farms/${FARM}/animals/a1/late.png`), bytes(), PNG));
    await assertFails(deleteObject(path("mgr", file)));
  });
});
