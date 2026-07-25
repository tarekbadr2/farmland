"use client";

import * as React from "react";
import type { Alert } from "@/core/domain/types";

/**
 * Per-device notification preferences.
 *
 * Which desktop pop-ups a person wants is a personal, per-machine choice — the
 * vet on the clinic PC wants health alerts, the accountant wants finance ones —
 * so this lives in localStorage next to Work mode and Background mode, not in
 * the shared farm record. It gates the OS notifications the desktop app raises;
 * the in-app notification list is a permanent record and stays complete.
 */

export type NotificationCategory = Alert["category"];

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "health",
  "breeding",
  "milk",
  "inventory",
  "weather",
  "task",
  "finance",
  "system",
];

export interface NotificationPrefs {
  /** Master switch — off silences every pop-up regardless of the per-category flags. */
  muted: boolean;
  /** Per-category opt-out. Absent = on, so a new category defaults to showing. */
  categories: Record<NotificationCategory, boolean>;
}

const KEY = "herdos.notif-prefs";
const listeners = new Set<() => void>();

const allOn = (): Record<NotificationCategory, boolean> =>
  Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, true])) as Record<
    NotificationCategory,
    boolean
  >;

// useSyncExternalStore compares snapshots by reference, so the hook must return
// a STABLE object until the value actually changes. readPrefs() builds a fresh
// object each call (correct for the non-reactive read path), so the hook reads
// through this cache instead, which is only rebuilt when a write or a
// cross-tab storage event invalidates it.
let cached: NotificationPrefs | null = null;
const SERVER_SNAPSHOT: NotificationPrefs = { muted: false, categories: allOn() };

function getSnapshot(): NotificationPrefs {
  if (cached === null) cached = readPrefs();
  return cached;
}

function emit(): void {
  cached = null; // force a rebuild on the next getSnapshot
  listeners.forEach((l) => l());
}

export function readPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return { muted: false, categories: allOn() };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { muted: false, categories: allOn() };
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      muted: Boolean(parsed.muted),
      // Merge over the defaults so a category added later is on until turned off.
      categories: { ...allOn(), ...(parsed.categories ?? {}) },
    };
  } catch {
    return { muted: false, categories: allOn() };
  }
}

function write(next: NotificationPrefs): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(next));
  emit();
}

export function setNotificationsMuted(muted: boolean): void {
  write({ ...readPrefs(), muted });
}

export function setCategoryEnabled(category: NotificationCategory, enabled: boolean): void {
  const prefs = readPrefs();
  write({ ...prefs, categories: { ...prefs.categories, [category]: enabled } });
}

/**
 * Should a pop-up fire for this category right now? Non-reactive on purpose —
 * called at notification time, it must read the current value, not the value
 * captured when an effect last ran.
 */
export function notificationsAllowed(category: NotificationCategory): boolean {
  const prefs = readPrefs();
  return !prefs.muted && prefs.categories[category] !== false;
}

/** Reactive snapshot for the settings UI and the menu. */
export function useNotificationPrefs(): NotificationPrefs {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) emit(); // another tab changed it — drop the cache and notify
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot,
    () => SERVER_SNAPSHOT,
  );
}
