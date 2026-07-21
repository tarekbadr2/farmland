"use client";

import { useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/sync/offline-store";

/**
 * Live offline/pending state for the UI.
 *
 * Backed by useSyncExternalStore so it stays correct across concurrent renders
 * and never tears — the milker's "3 queued" badge must not flicker a stale
 * number while writes are draining.
 */
export function useSyncStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
