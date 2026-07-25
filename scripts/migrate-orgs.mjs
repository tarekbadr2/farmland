#!/usr/bin/env node
/**
 * One-time migration: introduce the Organization layer over existing farms.
 *
 *   node scripts/migrate-orgs.mjs            # migrate for real
 *   node scripts/migrate-orgs.mjs --dry-run  # show what would change
 *
 * Before: farms/{farmId} stand alone; users/{uid} = { farmId, role } (one farm
 * per user). After: every farm belongs to an org (its owner's org), and each
 * users/{uid} becomes { orgId, farmIds:[…], defaultFarmId, role }.
 *
 * Lightweight: NO farm data is moved. We only (a) create one org per owner,
 * (b) stamp farm.orgId, (c) convert the users mapping to the multi-farm shape.
 * Idempotent — safe to re-run; already-migrated docs are left untouched.
 *
 * Needs GOOGLE_APPLICATION_CREDENTIALS, same as the other admin scripts.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local"),
  );
} catch {
  /* fall back to ambient env */
}

const DRY = process.argv.includes("--dry-run");

function requireCredentials() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  console.error(
    "\n  No service-account credentials. Set GOOGLE_APPLICATION_CREDENTIALS in .env.local\n" +
      "  (Firebase console → Project settings → Service accounts → Generate new private key).\n",
  );
  process.exit(1);
}

async function admin() {
  requireCredentials();
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const raw = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  initializeApp({ credential: cert(raw), projectId: raw.project_id });
  return getFirestore();
}

const orgIdFor = (ownerUid) => `org_${String(ownerUid).slice(0, 10).toLowerCase()}`;

async function main() {
  const db = await admin();
  const farms = await db.collection("farms").get();
  console.log(`\n  ${farms.size} farm(s) found${DRY ? " (dry run)" : ""}.\n`);

  // farmId -> orgId, so we can rewrite user mappings afterwards.
  const farmOrg = new Map();
  let orgsCreated = 0;
  let farmsStamped = 0;

  for (const farmDoc of farms.docs) {
    const farm = farmDoc.data();
    const farmId = farmDoc.id;

    // Determine the owner: explicit ownerId, else the sole/earliest owner member.
    let ownerUid = farm.ownerId;
    if (!ownerUid) {
      const owners = await db
        .collection(`farms/${farmId}/members`)
        .where("role", "==", "owner")
        .get();
      ownerUid = owners.docs[0]?.id;
    }
    if (!ownerUid) {
      console.log(`    - ${farmId}: no owner found, skipping`);
      continue;
    }

    const orgId = farm.orgId ?? orgIdFor(ownerUid);
    farmOrg.set(farmId, orgId);

    if (!farm.orgId) {
      console.log(`    + org ${orgId}  ←  farm ${farmId} (owner ${ownerUid})`);
      if (!DRY) {
        await db.doc(`orgs/${orgId}`).set(
          {
            id: orgId,
            name: farm.name ?? farmId,
            nameAr: farm.nameAr ?? farm.name ?? farmId,
            ownerId: ownerUid,
            createdAt: farm.createdAt ?? new Date().toISOString(),
          },
          { merge: true },
        );
        await farmDoc.ref.set({ orgId }, { merge: true });
      }
      orgsCreated += 1;
      farmsStamped += 1;
    }
  }

  // Rewrite user mappings: legacy { farmId } -> { orgId, farmIds, defaultFarmId }.
  const users = await db.collection("users").get();
  let usersMigrated = 0;
  for (const userDoc of users.docs) {
    const u = userDoc.data();
    if (Array.isArray(u.farmIds) && u.orgId) continue; // already migrated
    const farmId = u.farmId ?? (Array.isArray(u.farmIds) ? u.farmIds[0] : null);
    if (!farmId) continue;
    const orgId = u.orgId ?? farmOrg.get(farmId) ?? orgIdFor(userDoc.id);
    console.log(`    ~ user ${userDoc.id}: farmId=${farmId} -> farmIds=[${farmId}], org=${orgId}`);
    if (!DRY) {
      await userDoc.ref.set(
        { orgId, farmIds: [farmId], defaultFarmId: farmId, role: u.role ?? "owner" },
        { merge: true },
      );
    }
    usersMigrated += 1;
  }

  console.log(
    `\n  Done${DRY ? " (dry run — nothing written)" : ""}: ` +
      `${orgsCreated} org(s), ${farmsStamped} farm(s) stamped, ${usersMigrated} user mapping(s).\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
