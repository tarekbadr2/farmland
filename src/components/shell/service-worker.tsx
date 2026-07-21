"use client";

import * as React from "react";
import { toast } from "sonner";

/**
 * Registers the offline shell and surfaces updates. The parlor has patchy signal
 * at 5am, so the app must open and show the last known herd state with no
 * network. Because the shell is precached, an open tab keeps running the old
 * build until it reloads — so when a new service worker takes over we prompt the
 * user to reload rather than silently stranding them on a stale version.
 */
export function ServiceWorkerRegistrar() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    // In the bundled desktop app the whole thing is already served from disk, so
    // the offline service worker is redundant (and would cache the local build).
    if (process.env.NEXT_PUBLIC_DESKTOP === "1") return;
    if (!("serviceWorker" in navigator)) return;

    let reloading = false;
    // A new worker activated (skipWaiting) — the next reload runs fresh code.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      reloading = true; // consumed on the user-driven reload below
    });

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            // Installed with an existing controller ⇒ this is an update, not the
            // first install. Offer a reload instead of forcing one mid-task.
            if (next.state === "installed" && navigator.serviceWorker.controller && !reloading) {
              toast("A new version of Herd OS is ready.", {
                action: { label: "Reload", onClick: () => window.location.reload() },
                duration: Infinity,
              });
            }
          });
        });
      })
      .catch(() => {
        /* offline support is progressive — never block the app on it */
      });
  }, []);

  return null;
}
