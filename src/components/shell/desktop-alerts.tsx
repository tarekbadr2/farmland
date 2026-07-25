"use client";

import * as React from "react";

import { useAlerts } from "@/hooks/use-farm-data";
import { useI18n } from "@/lib/i18n/provider";
import { IS_DESKTOP } from "@/lib/platform";
import { useBackgroundMode } from "@/lib/background-mode";
import { canNotify, showDesktopNotification } from "@/lib/desktop-notify";
import { notificationsAllowed, notificationSoundEnabled } from "@/lib/notification-prefs";

/**
 * Bridges farm alerts to native desktop notifications while background mode is
 * on. Renders nothing. On first run it records the alerts already present, so
 * only genuinely new, unread alerts raise a toast (no flood on launch).
 *
 * IS_DESKTOP is a build constant, so this guard is stable across renders — it
 * lets the web build skip the alerts subscription entirely.
 */
export function DesktopAlerts() {
  if (!IS_DESKTOP) return null;
  return <DesktopAlertsInner />;
}

function DesktopAlertsInner() {
  const enabled = useBackgroundMode();
  const { locale } = useI18n();
  const ar = locale === "ar";
  const { data: alerts = [] } = useAlerts();

  // Alert ids we've already seen — seeded on the first render so pre-existing
  // alerts don't all fire at once.
  const seen = React.useRef<Set<string> | null>(null);

  React.useEffect(() => {
    if (!IS_DESKTOP || !enabled || !canNotify()) return;

    if (seen.current === null) {
      seen.current = new Set(alerts.map((a) => a.id));
      return; // first pass: just remember, don't notify
    }

    const fresh = alerts.filter((a) => !a.read && !seen.current!.has(a.id));
    // Honour the per-device notification prefs (mute / per-category), read at
    // fire time so a change takes effect immediately. Cap the burst so a big
    // sync can't spam the OS. A suppressed alert is still marked seen, so
    // un-muting later doesn't replay everything that arrived while muted.
    const silent = !notificationSoundEnabled();
    for (const a of fresh.slice(0, 3)) {
      if (notificationsAllowed(a.category)) {
        showDesktopNotification(ar ? a.titleAr : a.title, ar ? a.bodyAr : a.body, {
          href: a.href,
          silent,
        });
      }
    }
    fresh.forEach((a) => seen.current!.add(a.id));
  }, [alerts, enabled, ar]);

  return null;
}
