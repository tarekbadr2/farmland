"use client";

import * as React from "react";
import { IS_DESKTOP } from "@/lib/platform";

/**
 * "Background mode" — a desktop-only switch (distinct from phone Work mode).
 *
 * When on, the desktop app keeps running after you close its window: it tucks
 * into the system tray and can still raise desktop notifications for farm
 * alerts. Off, closing the window quits as usual. Stored per-device in
 * localStorage and mirrored to the Electron main process, which owns the tray
 * and the hide-on-close behaviour.
 */

const KEY = "herdos.background";
const listeners = new Set<() => void>();

interface BackgroundBridge {
  setEnabled: (on: boolean) => Promise<{ ok: boolean }>;
}

function bridge(): BackgroundBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { desktopBackground?: BackgroundBridge }).desktopBackground ?? null;
}

/** Only offered in the desktop app that exposes the tray bridge. */
export function isBackgroundSupported(): boolean {
  return IS_DESKTOP && bridge() !== null;
}

function read(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
}

export function setBackgroundMode(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, on ? "1" : "0");
  bridge()?.setEnabled(on);
  listeners.forEach((l) => l());
}

/** Push the stored preference to the main process (call once on launch so the
 *  tray/hide-on-close matches what the user last chose). */
export function syncBackgroundMode(): void {
  bridge()?.setEnabled(read());
}

/** Reactive background-mode flag. */
export function useBackgroundMode(): boolean {
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
    () => false,
  );
}
