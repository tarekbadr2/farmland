import { NextResponse } from "next/server";

import { verifyBearer, adminDb } from "@/lib/server/firebase-admin";
import type { Farm } from "@/core/domain/types";

/**
 * Cancel (or resume) the caller's subscription.
 *
 * Cancelling only flips the status to "canceled" — the farm keeps full access
 * until the paid period ends (see the grace in resolveEntitlement), then the
 * paywall takes over. "resume" flips an in-grace cancellation back to active.
 * No money moves here; there's nothing to refund on a period already paid.
 * Gated behind a Firebase ID token; CORS-enabled for the desktop app.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, { ...init, headers: { ...CORS, ...(init?.headers ?? {}) } });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  let caller;
  try {
    caller = await verifyBearer(req.headers.get("authorization"));
  } catch {
    return json({ error: "auth-unavailable" }, { status: 503 });
  }
  if (!caller) return json({ error: "unauthorized" }, { status: 401 });

  let body: { action?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const resume = body.action === "resume";

  const db = await adminDb();
  const userSnap = await db.doc(`users/${caller.uid}`).get();
  const farmId = userSnap.exists ? (userSnap.data()!.farmId as string) : null;
  if (!farmId) return json({ error: "no-farm" }, { status: 400 });

  const farmRef = db.doc(`farms/${farmId}`);
  const farmSnap = await farmRef.get();
  const sub = farmSnap.exists ? (farmSnap.data() as Farm).subscription : undefined;
  if (!sub) return json({ error: "no-subscription" }, { status: 400 });

  await farmRef.set(
    { subscription: { ...sub, status: resume ? "active" : "canceled" } },
    { merge: true },
  );
  return json({ ok: true, status: resume ? "active" : "canceled" });
}
