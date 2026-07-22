"use client";

import * as React from "react";
import { captureError } from "@/lib/monitoring";

/**
 * Root error boundary — catches failures in the root layout itself, where the
 * app providers and stylesheet aren't available. It renders its own document,
 * so everything here is inline and dependency-free.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    captureError(error, { digest: error.digest, boundary: "global" });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#0f1319",
          color: "#e5e7eb",
        }}
      >
        <div style={{ textAlign: "center", padding: "0 24px", maxWidth: 460 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, opacity: 0.7 }}>
            An unexpected error occurred. It&apos;s been logged.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "9px 20px",
              borderRadius: 8,
              border: "none",
              background: "#16654a",
              color: "white",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
