"use client";

import * as React from "react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n/provider";

/**
 * Registers the offline shell and keeps the web app current.
 *
 * The parlor has patchy signal at 5am, so the app must open and show the last
 * known herd state with no network. Because the shell is precached, an open tab
 * keeps running the old build until it reloads — so this does two things:
 *
 *  1. Actively checks for a new deploy (on an interval and whenever the tab
 *     regains focus), rather than waiting for the browser's ~24h default. A
 *     kiosk left open in the barn shouldn't sit a day behind.
 *  2. When a new build is waiting, prompts the user to reload. Accepting tells
 *     the waiting worker to take over (SKIP_WAITING) and reloads onto it — so we
 *     never swap code out from under someone mid data-entry, and the reload
 *     lands cleanly on the new build instead of a half-updated one.
 */
export function ServiceWorkerRegistrar() {
  const { locale } = useI18n();
  const localeRef = React.useRef(locale);
  localeRef.current = locale;

  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    // In the bundled desktop app the whole thing is already served from disk, so
    // the offline service worker is redundant (and would cache the local build).
    // The desktop app self-updates through electron-updater instead.
    if (process.env.NEXT_PUBLIC_DESKTOP === "1") return;
    if (!("serviceWorker" in navigator)) return;

    const ar = () => localeRef.current === "ar";
    let promptShown = false;
    let userAccepted = false;

    const promptUpdate = (worker: ServiceWorker) => {
      if (promptShown) return;
      promptShown = true;
      toast(ar() ? "يتوفر إصدار جديد من Herd OS." : "A new version of Herd OS is ready.", {
        action: {
          label: ar() ? "تحديث" : "Reload",
          onClick: () => {
            userAccepted = true;
            worker.postMessage("SKIP_WAITING");
          },
        },
        duration: Infinity,
      });
    };

    // The new worker took control. Only reload if the user asked for it — the
    // first-ever install also fires this (via clients.claim) and must NOT reload.
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!userAccepted || reloading) return;
      reloading = true;
      window.location.reload();
    });

    let reg: ServiceWorkerRegistration | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;

    navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        reg = r;

        // A build was already downloaded and waiting from a previous visit.
        if (r.waiting && navigator.serviceWorker.controller) promptUpdate(r.waiting);

        r.addEventListener("updatefound", () => {
          const next = r.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            // Installed while a controller already exists ⇒ an update (not the
            // first install). Offer a reload rather than forcing one mid-task.
            if (next.state === "installed" && navigator.serviceWorker.controller) {
              promptUpdate(next);
            }
          });
        });

        // Poll for new deploys, and check again whenever the tab regains focus.
        interval = setInterval(() => r.update().catch(() => {}), 30 * 60 * 1000);
      })
      .catch(() => {
        /* offline support is progressive — never block the app on it */
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") reg?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
