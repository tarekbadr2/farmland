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
