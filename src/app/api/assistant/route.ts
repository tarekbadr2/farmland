import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { verifyBearer } from "@/lib/server/firebase-admin";

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

const MODEL = "claude-opus-4-8";
const MAX_QUESTION = 600;
const MAX_BRIEF = 12_000;

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

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  // No key configured (demo backend, or not set up yet) → let the client use
  // the deterministic advisor. Not an error.
  if (!apiKey) {
    return NextResponse.json({ fallback: true, reason: "no-key" });
  }

  let body: { question?: unknown; brief?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const brief = typeof body.brief === "string" ? body.brief : "";
  if (!question) {
    return NextResponse.json({ error: "missing-question" }, { status: 400 });
  }

  // Gate the paid model behind a valid farm sign-in so the endpoint can't be
  // driven by anonymous traffic. If the admin credential itself is missing we
  // can't verify anyone — fail closed to the local advisor rather than open.
  let caller;
  try {
    caller = await verifyBearer(req.headers.get("authorization"));
  } catch {
    return NextResponse.json({ fallback: true, reason: "auth-unavailable" });
  }
  if (!caller) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
    if (!answer) return NextResponse.json({ fallback: true, reason: "empty" });
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[assistant] Claude call failed:", err);
    // Any upstream failure (rate limit, network, bad key) → local advisor.
    return NextResponse.json({ fallback: true, reason: "upstream-error" });
  }
}
