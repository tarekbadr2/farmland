/**
 * Server-only Firebase Admin singleton.
 *
 * Used by API routes to verify the *caller's* Firebase ID token before doing
 * anything expensive — so a paid endpoint (the Claude advisor) can't be hit by
 * anonymous traffic. Credentials resolve in two ways so the same code runs
 * locally and on a host with no filesystem:
 *
 *   - FIREBASE_SERVICE_ACCOUNT — the service-account JSON as a single-line env
 *     string. This is the production path (Vercel/etc., where there is no file).
 *   - GOOGLE_APPLICATION_CREDENTIALS — a path to the JSON on disk, via
 *     applicationDefault(). This is the local-dev path (same key the scripts use).
 *
 * firebase-admin is imported lazily so it only loads in the routes that need it,
 * and the app never bundles it for the client.
 */

import type { App } from "firebase-admin/app";

let cached: App | null = null;

async function adminApp(): Promise<App> {
  if (cached) return cached;
  const { getApps, initializeApp, applicationDefault, cert } = await import("firebase-admin/app");
  if (getApps().length) {
    cached = getApps()[0];
    return cached;
  }
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  const credential = json ? cert(JSON.parse(json)) : applicationDefault();
  cached = initializeApp({ credential });
  return cached;
}

export interface VerifiedCaller {
  uid: string;
  email?: string;
}

/**
 * Verify a `Bearer <idToken>` Authorization header.
 * Returns the caller on success, or null if the header is missing/malformed or
 * the token is invalid/expired. Never throws for a bad token — only for a
 * genuine admin misconfiguration (no credentials), which the caller treats as
 * "auth unavailable" and fails closed.
 */
export async function verifyBearer(authHeader: string | null): Promise<VerifiedCaller | null> {
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { getAuth } = await import("firebase-admin/auth");
  try {
    const decoded = await getAuth(await adminApp()).verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}
