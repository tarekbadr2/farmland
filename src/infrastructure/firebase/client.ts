/**
 * Firebase wiring.
 *
 * Left dormant by default: the app runs on the deterministic demo adapter until
 * NEXT_PUBLIC_DATA_SOURCE=firebase and the config below is filled in from
 * `.env.local`. Nothing else in the codebase imports the Firebase SDK, so the
 * demo build never pays for it.
 */

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFunctions, httpsCallable, type Functions } from "firebase/functions";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;
let functions: Functions | null = null;

/** Functions run in the same region as Firestore to avoid a cross-region hop. */
const FUNCTIONS_REGION = "us-central1";

export function getFirebase() {
  if (!isFirebaseConfigured) {
    throw new Error(
      "Firebase is not configured. Copy .env.example to .env.local and fill in the project keys.",
    );
  }
  if (!app) {
    app = getApps()[0] ?? initializeApp(config);
    // Offline-first: the parlor and the pens have no reliable signal, and two
    // tabs open on the office desktop must not fight over the same cache.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    auth = getAuth(app);
    storage = getStorage(app);
    functions = getFunctions(app, FUNCTIONS_REGION);
  }
  return { app: app!, db: db!, auth: auth!, storage: storage!, functions: functions! };
}

/**
 * Promotes any pending invite for the signed-in user into a real membership.
 *
 * Called right after sign-in when no membership is found. Returns the number of
 * farms the caller was let into — zero means they were never invited.
 */
export async function claimMembership(): Promise<number> {
  const call = httpsCallable<unknown, { claimed: unknown[] }>(
    getFirebase().functions,
    "claimMembership",
  );
  const res = await call();
  return res.data.claimed?.length ?? 0;
}

/** Create the signed-in user's farm (self-serve onboarding). Returns its id. */
export async function createFarm(name: string, nameAr?: string): Promise<string> {
  const call = httpsCallable<{ name: string; nameAr?: string }, { farmId: string }>(
    getFirebase().functions,
    "createFarm",
  );
  const res = await call({ name, nameAr });
  return res.data.farmId;
}

// ------------------------------ Invitations --------------------------------

export interface CreateInvitePayload {
  email: string;
  role: string;
  farmIds: string[];
  expiry: "24h" | "7d" | "30d";
  welcomeMessage?: string;
}

/** Create an org invite (owner/admin). Returns the token for the accept URL. */
export async function createInvite(payload: CreateInvitePayload): Promise<string> {
  const call = httpsCallable<CreateInvitePayload, { token: string }>(
    getFirebase().functions,
    "createInvite",
  );
  const res = await call(payload);
  return res.data.token;
}

export interface InviteView {
  email: string;
  orgName: string;
  orgNameAr: string;
  role: string;
  permissions: string[];
  farms: { id: string; name: string; nameAr: string }[];
  welcomeMessage: string | null;
  invitedByName: string | null;
  expiresAt: string | null;
}

/** Public: read an invite's display data by token (for the accept page). */
export async function getInvite(token: string): Promise<InviteView> {
  const call = httpsCallable<{ token: string }, InviteView>(getFirebase().functions, "getInvite");
  const res = await call({ token });
  return res.data;
}

/** Accept an invite once signed in; joins every assigned farm. */
export async function acceptInvite(token: string): Promise<{ orgId: string; farmIds: string[] }> {
  const call = httpsCallable<{ token: string }, { orgId: string; farmIds: string[] }>(
    getFirebase().functions,
    "acceptInvite",
  );
  const res = await call({ token });
  return res.data;
}

export interface OrgInvite {
  token: string;
  email: string;
  role: string;
  farmIds: string[];
  invitedAt: string | null;
  expiresAt: string | null;
}

/** List the org's still-pending invites (Team screen). */
export async function listOrgInvites(): Promise<OrgInvite[]> {
  const call = httpsCallable<unknown, { invites: OrgInvite[] }>(
    getFirebase().functions,
    "listOrgInvites",
  );
  const res = await call();
  return res.data.invites ?? [];
}

/** Revoke a pending invite by token. */
export async function revokeOrgInvite(token: string): Promise<void> {
  const call = httpsCallable<{ token: string }, { ok: boolean }>(
    getFirebase().functions,
    "revokeOrgInvite",
  );
  await call({ token });
}

/**
 * Firestore layout (multi-tenant, one document tree per farm):
 *
 *   farms/{farmId}
 *     ├── members/{userId}                role, permissions
 *     ├── animals/{animalId}              indexed on milkStatus, reproStatus, penId
 *     │     └── events/{eventId}          per-animal timeline, write-once
 *     ├── milkRecords/{yyyy-MM-dd_animalId_session}
 *     ├── milkDaily/{yyyy-MM-dd}          aggregated by a Cloud Function trigger
 *     ├── breeding/{eventId}
 *     ├── health/{eventId}
 *     ├── feed/{itemId}  ·  rations/{rationId}  ·  feedConsumption/{yyyy-MM-dd_zoneId}
 *     ├── inventory/{itemId}  ·  stockMovements/{movementId}
 *     ├── employees/{employeeId}  ·  attendance/{yyyy-MM-dd_employeeId}
 *     ├── tasks/{taskId}  ·  transactions/{txnId}  ·  invoices/{invoiceId}
 *     ├── partners/{partnerId}  ·  zones/{zoneId}  ·  alerts/{alertId}
 *
 * Scale notes for 50,000+ animals:
 *  - Per-animal daily milk rows are the hot collection (~100k writes/day at
 *    50k head × 2 sessions). Write them batched from the parlor integration and
 *    roll them up nightly into `milkDaily` + per-animal summaries so the herd
 *    list never fans out reads.
 *  - Denormalise the fields the herd table sorts on (avgDailyMilkL, healthScore,
 *    milkStatus) onto the animal document; Firestore cannot sort across
 *    collections.
 *  - Every query is farm-scoped by path, so security rules are a single
 *    membership check rather than a per-document predicate.
 */
export const FIRESTORE_LAYOUT = "see comment above";
