"use client";

import * as Sentry from "@sentry/browser";

/**
 * Error tracking.
 *
 * Client-side only: it captures browser crashes and unhandled promise
 * rejections — the failures Vercel's server logs never see. It's a no-op until
 * NEXT_PUBLIC_SENTRY_DSN is set, so it ships safely with no account configured.
 * Works identically on the web and the bundled desktop app (pure browser SDK,
 * no build-time integration).
 */

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const IS_DESKTOP = process.env.NEXT_PUBLIC_DESKTOP === "1";

let started = false;

export function initMonitoring(): void {
  if (started || !DSN || typeof window === "undefined") return;
  started = true;
  Sentry.init({
    dsn: DSN,
    environment: IS_DESKTOP ? "desktop" : "web",
    // Errors only for now — no performance tracing (keeps quota + noise down).
    tracesSampleRate: 0,
    // Sentry's default integrations already hook window.onerror and
    // unhandledrejection, so uncaught errors report automatically.
  });
}

/** Report a handled error (e.g. from an error boundary or a catch block). Falls
 *  back to console when tracking isn't configured. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!DSN) {
    console.error("[captureError]", error, context ?? "");
    return;
  }
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
