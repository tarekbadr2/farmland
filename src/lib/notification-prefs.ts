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

export interface QuietHours {
  /** When on, pop-ups are held during the window below (they stay in the list). */
  enabled: boolean;
  /** "HH:MM" 24-hour local start. */
  start: string;
  /** "HH:MM" 24-hour local end. A window that ends before it starts wraps midnight. */
  end: string;
}

export interface NotificationPrefs {
  /** Master switch — off silences every pop-up regardless of the per-category flags. */
  muted: boolean;
  /** Play the OS notification sound. Off = silent pop-ups. */
  sound: boolean;
  /** Per-category opt-out. Absent = on, so a new category defaults to showing. */
  categories: Record<NotificationCategory, boolean>;
  /** Nightly (or any) window during which pop-ups are suppressed. */
  quietHours: QuietHours;
}

const KEY = "herdos.notif-prefs";
const listeners = new Set<() => void>();

const allOn = (): Record<NotificationCategory, boolean> =>
  Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, true])) as Record<
    NotificationCategory,
    boolean
  >;

const defaults = (): NotificationPrefs => ({
  muted: false,
  sound: true,
  categories: allOn(),
  quietHours: { enabled: false, start: "22:00", end: "06:00" },
});

// useSyncExternalStore compares snapshots by reference, so the hook must return
// a STABLE object until the value actually changes. readPrefs() builds a fresh
// object each call (correct for the non-reactive read path), so the hook reads
// through this cache instead, which is only rebuilt when a write or a
// cross-tab storage event invalidates it.
let cached: NotificationPrefs | null = null;
const SERVER_SNAPSHOT: NotificationPrefs = defaults();

function getSnapshot(): NotificationPrefs {
  if (cached === null) cached = readPrefs();
  return cached;
}

function emit(): void {
  cached = null; // force a rebuild on the next getSnapshot
  listeners.forEach((l) => l());
}

export function readPrefs(): NotificationPrefs {
  const base = defaults();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      muted: Boolean(parsed.muted),
      // Absent in older saved prefs → keep the sensible default (sound on).
      sound: parsed.sound === undefined ? base.sound : Boolean(parsed.sound),
      // Merge over the defaults so a category added later is on until turned off.
      categories: { ...base.categories, ...(parsed.categories ?? {}) },
      quietHours: { ...base.quietHours, ...(parsed.quietHours ?? {}) },
    };
  } catch {
    return base;
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

export function setNotificationSound(sound: boolean): void {
  write({ ...readPrefs(), sound });
}

export function setCategoryEnabled(category: NotificationCategory, enabled: boolean): void {
  const prefs = readPrefs();
  write({ ...prefs, categories: { ...prefs.categories, [category]: enabled } });
}

export function setQuietHours(patch: Partial<QuietHours>): void {
  const prefs = readPrefs();
  write({ ...prefs, quietHours: { ...prefs.quietHours, ...patch } });
}

/** Minutes-since-midnight for an "HH:MM" string, or null if it can't be parsed. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Are we inside the quiet-hours window right now? Handles windows that wrap
 * past midnight (e.g. 22:00 → 06:00). A zero-length window is treated as off.
 * `nowMinutes` is injectable so the logic is unit-testable without a clock.
 */
export function inQuietHours(q: QuietHours, nowMinutes: number): boolean {
  if (!q.enabled) return false;
  const start = toMinutes(q.start);
  const end = toMinutes(q.end);
  if (start === null || end === null || start === end) return false;
  return start < end
    ? nowMinutes >= start && nowMinutes < end // same-day window
    : nowMinutes >= start || nowMinutes < end; // wraps midnight
}

/**
 * Should a pop-up fire for this category right now? Non-reactive on purpose —
 * called at notification time, it must read the current value, not the value
 * captured when an effect last ran.
 */
export function notificationsAllowed(category: NotificationCategory): boolean {
  const prefs = readPrefs();
  if (prefs.muted || prefs.categories[category] === false) return false;
  const now = new Date();
  return !inQuietHours(prefs.quietHours, now.getHours() * 60 + now.getMinutes());
}

/** Whether pop-ups should make a sound. Non-reactive; read at fire time. */
export function notificationSoundEnabled(): boolean {
  return readPrefs().sound;
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
