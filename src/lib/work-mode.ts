"use client";

import * as React from "react";
import { useAuth } from "@/lib/auth/provider";
import { IS_DESKTOP } from "@/lib/platform";

/**
 * "Work mode" — a per-device switch that unlocks the full app on the web.
 *
 * The website is view-only by default (overview + subscription); the real
 * product is the desktop app. But a worker in the field wants the whole app on
 * their phone, so Work mode lets any web device opt into the full experience —
 * same as the desktop. Stored in localStorage, so it sticks on that phone.
 */

const KEY = "herdos.workmode";
const listeners = new Set<() => void>();

function read(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
}

export function setWorkMode(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, on ? "1" : "0");
  listeners.forEach((l) => l());
}

/** Reactive work-mode flag. */
export function useWorkMode(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) cb();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    read,
    () => false, // server render: view-only until the client hydrates
  );
}

/** Whether the full operational app should be shown: always on the desktop build
 *  and in the demo, and on the web when Work mode is enabled. */
export function useFullApp(): boolean {
  const workMode = useWorkMode();
  const { bypassed } = useAuth();
  return IS_DESKTOP || bypassed || workMode;
}
