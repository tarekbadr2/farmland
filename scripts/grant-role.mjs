#!/usr/bin/env node
/**
 * Grants a farm role to someone who has already signed in at least once.
 *
 *   node scripts/grant-role.mjs you@example.com owner
 *   node scripts/grant-role.mjs vet@example.com veterinarian --farm farm_two
 *   node scripts/grant-role.mjs --list
 *
 * Firebase Auth only issues a uid after first sign-in, so membership can't be
 * created ahead of time. This looks the user up by email and writes
 * farms/{farmId}/members/{uid} — the document both the security rules and the
 * app read to decide what someone can do.
 *
 * Needs GOOGLE_APPLICATION_CREDENTIALS, same as the seed script.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Same .env.local as the app and the seed script.
try {
  process.loadEnvFile(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local"),
  );
} catch {
  // No .env.local — fall back to the ambient environment.
}

const ROLES =["owner", "manager", "veterinarian", "accountant", "worker"];

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(["--farm"]);

const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

// Positionals are everything that isn't a flag or a flag's value.
const positional = argv.filter(
  (arg, i) => !arg.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1]),
);

const FARM_ID = option("farm", process.env.NEXT_PUBLIC_FARM_ID || "farm_nile_delta");
const LIST = argv.includes("--list");
const [email, role = "owner"] = positional;

export function requireCredentials(projectId) {
  const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (key) return key;
  console.error(`
  No service-account credentials.

  This script talks to Firebase as an administrator, which needs a key the
  browser config can't provide. Download one:

    https://console.firebase.google.com/project/${projectId ?? "_"}/settings/serviceaccounts/adminsdk
    → Generate new private key

  Save it OUTSIDE this repo — it bypasses every security rule — then set the
  path in .env.local:

    GOOGLE_APPLICATION_CREDENTIALS=C:/Users/you/keys/herdos-admin.json
`);
  process.exit(1);
}

async function admin() {
  requireCredentials(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getAuth } = await import("firebase-admin/auth");

  const raw = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  initializeApp({ credential: cert(raw), projectId: raw.project_id });
  return { db: getFirestore(), auth: getAuth() };
}

async function main() {
  // Validate before touching credentials — a typo shouldn't need a service key.
  if (!LIST && !email) {
    console.error(`\n  Usage: node scripts/grant-role.mjs <email> [${ROLES.join("|")}]\n`);
    process.exit(1);
  }
  if (!LIST && !ROLES.includes(role)) {
    console.error(`\n  Unknown role "${role}". One of: ${ROLES.join(", ")}\n`);
    process.exit(1);
  }

  const { db, auth } = await admin();

  if (LIST) {
    const snap = await db.collection(`farms/${FARM_ID}/members`).get();
    console.log(`\n  Members of ${FARM_ID}:\n`);
    if (snap.empty) console.log("    (none yet)");
    snap.forEach((d) => {
      const m = d.data();
      console.log(`    ${String(m.role).padEnd(14)} ${m.email ?? "—"}   ${d.id}`);
    });
    console.log("");
    return;
  }

  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (err) {
    // Distinguish "hasn't signed in yet" from "these credentials don't work" —
    // they look identical from the call site and lead to opposite fixes.
    if (err.code === "auth/user-not-found") {
      console.error(
        `\n  No Firebase Auth user for ${email}.` +
          `\n  They need to sign in to the app once first — the uid doesn't exist until then.\n`,
      );
    } else {
      console.error(`\n  Couldn't reach Firebase Auth: ${err.message}`);
      console.error(
        `  Check GOOGLE_APPLICATION_CREDENTIALS points at a service-account JSON` +
          ` for this project.\n`,
      );
    }
    process.exit(1);
  }

  await db.doc(`farms/${FARM_ID}/members/${user.uid}`).set(
    {
      email: email.toLowerCase(),
      name: user.displayName ?? email.split("@")[0],
      role,
      // Owners get the wildcard; everyone else is governed by their role in
      // firestore.rules. This array is for optional per-feature grants on top.
      permissions: role === "owner" ? ["*"] : [],
      grantedAt: new Date(),
    },
    { merge: true },
  );

  console.log(`\n  ${email} is now ${role} of ${FARM_ID}.`);
  console.log(`  uid ${user.uid}\n`);
}

// Only run when invoked directly — seed-firestore.mjs imports requireCredentials.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("\n  Failed:", err.message, "\n");
    process.exit(1);
  });
}
