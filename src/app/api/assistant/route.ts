import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import type { DocumentReference } from "firebase-admin/firestore";

import { verifyBearer, adminDb } from "@/lib/server/firebase-admin";
import { resolveEntitlement, isBillingEnforced, isoMonth } from "@/lib/billing/status";
import type { Farm } from "@/core/domain/types";

/**
 * The AI advisor endpoint.
 *
 * Wraps Claude around the farm's own numbers. The client sends the question and
 * a compact, pre-computed farm brief (the same arithmetic the dashboard shows);
 * the model answers from that snapshot and nothing else. The API key lives only
 * here, server-side — it is never NEXT_PUBLIC_ and never reaches the browser.
 *
 * Degrades honestly: when there is no key, or the caller can't be authenticated,
 * it returns `{ fallback: true }` so the client falls back to the deterministic
 * rule-based advisor rather than failing. That keeps the assistant working
 * offline and in the demo backend, where no key is configured.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sonnet, not Opus: the advisor is grounded Q&A over a pre-computed brief — a
// bounded task Sonnet handles well at ~40% lower cost, which matters when AI
// usage drives pricing.
const MODEL = "claude-sonnet-5";
const MAX_QUESTION = 600;
const MAX_BRIEF = 12_000;

// The bundled desktop app calls this endpoint cross-origin from a localhost
// port, so allow CORS. The Firebase ID token in the Authorization header is the
// real gate; the origin isn't trusted, so a wildcard is fine (no cookies).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SYSTEM_PROMPT = `You are "Herd", the advisor built into a buffalo-farm management system used by Egyptian dairy and beef farmers.

You are given a FARM SNAPSHOT: a set of already-computed aggregate figures for one farm on one date. Answer the manager's question using ONLY the numbers and facts in that snapshot plus sound animal-husbandry reasoning. Rules:

- Ground every claim in the snapshot. Quote the relevant figure. If the snapshot does not contain what is needed, say so plainly and name what would be needed — never invent numbers, individual animal tags, or names.
- Be concise and practical: 2–5 sentences, or a short list for multi-part answers. Lead with the answer, then the one or two figures that support it, then a concrete next step when there is a useful one.
- Weights, carcass, and daily-gain figures are ESTIMATED (animals are not weighed at sale) — flag that whenever you rely on them.
- Currency is Egyptian pounds (EGP). Milk is in litres.
- If the question is not about this farm, briefly steer back to what you can help with.
- Respond in the SAME language as the question: Modern Standard Arabic if the question is in Arabic, otherwise English. Plain prose — no markdown headings.`;

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

const json = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, { ...init, headers: { ...CORS, ...(init?.headers ?? {}) } });

// CORS preflight for the desktop app's cross-origin call.
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  // No key configured (demo backend, or not set up yet) → let the client use
  // the deterministic advisor. Not an error.
  if (!apiKey) {
    return json({ fallback: true, reason: "no-key" });
  }

  let body: { question?: unknown; brief?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid-json" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const brief = typeof body.brief === "string" ? body.brief : "";
  if (!question) {
    return json({ error: "missing-question" }, { status: 400 });
  }

  // Gate the paid model behind a valid farm sign-in so the endpoint can't be
  // driven by anonymous traffic. If the admin credential itself is missing we
  // can't verify anyone — fail closed to the local advisor rather than open.
  let caller;
  try {
    caller = await verifyBearer(req.headers.get("authorization"));
  } catch {
    return json({ fallback: true, reason: "auth-unavailable" });
  }
  if (!caller) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  // Resolve the caller's farm so AI usage can be metered against the plan quota.
  // A metering hiccup must never block a paying user, so failures here are
  // swallowed and the answer proceeds.
  let farmRef: DocumentReference | null = null;
  let farm: Farm | undefined;
  try {
    const db = await adminDb();
    const userSnap = await db.doc(`users/${caller.uid}`).get();
    const farmId = userSnap.exists ? (userSnap.data()!.farmId as string) : null;
    if (farmId) {
      farmRef = db.doc(`farms/${farmId}`);
      const farmSnap = await farmRef.get();
      if (farmSnap.exists) farm = { id: farmSnap.id, ...farmSnap.data() } as Farm;
    }
  } catch {
    /* metering unavailable — proceed without it */
  }

  // Enforce the monthly quota only when billing enforcement is on (off until
  // Paymob is live). Usage is still counted below either way.
  if (farm && isBillingEnforced()) {
    const ent = resolveEntitlement(farm);
    if (ent.aiExhausted) {
      return json({ error: "quota-exceeded", quota: ent.aiQuota, used: ent.aiUsed }, { status: 402 });
    }
  }

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `FARM SNAPSHOT:\n${brief.slice(0, MAX_BRIEF)}\n\nQUESTION: ${question.slice(0, MAX_QUESTION)}`,
        },
      ],
    });

    const answer = textOf(message);
    if (!answer) return json({ fallback: true, reason: "empty" });

    // Count this question against the month's quota (best-effort, transactional
    // so concurrent questions don't clobber the counter).
    if (farmRef) {
      const ref = farmRef;
      const month = isoMonth();
      try {
        const db = await adminDb();
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const cur = snap.data()?.aiUsage as { month?: string; count?: number } | undefined;
          const count = cur?.month === month ? (cur.count ?? 0) + 1 : 1;
          tx.set(ref, { aiUsage: { month, count } }, { merge: true });
        });
      } catch {
        /* best-effort metering */
      }
    }

    return json({ answer });
  } catch (err) {
    console.error("[assistant] Claude call failed:", err);
    // Any upstream failure (rate limit, network, bad key) → local advisor.
    return json({ fallback: true, reason: "upstream-error" });
  }
}
