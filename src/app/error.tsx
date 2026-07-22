"use client";

import * as React from "react";
import { captureError } from "@/lib/monitoring";

/** Route-level error boundary — a friendly fallback for any render/runtime error
 *  in the app, and the point where the error gets logged. */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    captureError(error, { digest: error.digest, boundary: "route" });
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
        حدث خطأ غير متوقّع — تم تسجيله وسنعمل على إصلاحه.
        <br />
        An unexpected error occurred. It's been logged — try again, or head back.
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
          Home
        </a>
      </div>
    </div>
  );
}
