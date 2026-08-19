"use client";

import * as React from "react";
import { captureError } from "@/lib/monitoring";

/** Error boundary for the app content region. Nested inside the (app) layout, so
 *  a crash in a single screen is contained to the content area — the sidebar,
 *  topbar and navigation stay usable — instead of the root boundary replacing the
 *  whole shell. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    captureError(error, { digest: error.digest, boundary: "app" });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight">This screen hit a problem</h1>
      <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
        حدث خطأ في هذه الصفحة — تم تسجيله. بقية التطبيق ما زالت تعمل.
        <br />
        Something went wrong on this page — it&apos;s been logged. The rest of the app still works.
      </p>
      <div className="mt-6 flex gap-2">
        <button
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition hover:opacity-90"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium transition hover:bg-accent"
        >
          Dashboard
        </a>
      </div>
    </div>
  );
}
