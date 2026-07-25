"use client";

import * as React from "react";
import { IS_DESKTOP } from "@/lib/platform";

/**
 * Desktop launch behaviour: start with Windows, and (optionally) start hidden
 * in the tray. Unlike the other preference stores this isn't localStorage —
 * the source of truth is the OS login-item registration, owned by the Electron
 * main process. We read it once on mount and write through the bridge.
 */

export interface LaunchSettings {
  /** Register the app to start when the user logs in. */
  openAtLogin: boolean;
  /** Start tucked in the tray instead of opening a window (needs background mode). */
  openAsHidden: boolean;
}

interface LaunchBridge {
  get: () => Promise<LaunchSettings>;
  set: (s: LaunchSettings) => Promise<{ ok: boolean }>;
}

function bridge(): LaunchBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { desktopLaunch?: LaunchBridge }).desktopLaunch ?? null;
}

/** Only offered in the desktop app that exposes the launch bridge. */
export function isLaunchSupported(): boolean {
  return IS_DESKTOP && bridge() !== null;
}

/**
 * Reactive launch settings backed by the OS. `ready` is false until the first
 * read resolves, so the UI can avoid flashing default-off switches.
 */
export function useLaunchSettings() {
  const [ready, setReady] = React.useState(false);
  const [settings, setSettings] = React.useState<LaunchSettings>({
    openAtLogin: false,
    openAsHidden: false,
  });

  React.useEffect(() => {
    let alive = true;
    const b = bridge();
    if (!b) return;
    b.get()
      .then((s) => {
        if (alive) {
          setSettings(s);
          setReady(true);
        }
      })
      .catch(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const update = React.useCallback(
    (patch: Partial<LaunchSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        // Starting hidden only makes sense if we start at all.
        if (!next.openAtLogin) next.openAsHidden = false;
        bridge()?.set(next);
        return next;
      });
    },
    [],
  );

  return { supported: isLaunchSupported(), ready, ...settings, update };
}
