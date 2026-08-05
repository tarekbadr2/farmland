"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Wires the Electron desktop shell's navigation + menu/keyboard actions into the
 * running app. Renders nothing, and is a complete no-op on the web (where the
 * `desktopNav` bridge doesn't exist), so it's always safe to mount.
 *
 * - onNavigate: the tray ("Show Dashboard" / "Settings") and deep links
 *   (herdos://invite/<token>, notifications) push a route here.
 * - onAction: menu accelerators — Refresh (Ctrl+R) re-fetches data, Find (Ctrl+F)
 *   and New (Ctrl+N / Ctrl+Shift+N) open the command palette (the app's universal
 *   action surface), Save (Ctrl+S) is broadcast for any open form to honour.
 */
interface DesktopNavBridge {
  onNavigate: (cb: (routePath: string) => void) => () => void;
  onAction: (cb: (name: string) => void) => () => void;
}

function bridge(): DesktopNavBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { desktopNav?: DesktopNavBridge }).desktopNav ?? null;
}

export function DesktopIntegration() {
  const router = useRouter();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    const b = bridge();
    if (!b) return;

    const offNavigate = b.onNavigate((routePath) => {
      if (typeof routePath === "string" && routePath.startsWith("/")) router.push(routePath);
    });

    const offAction = b.onAction((name) => {
      switch (name) {
        case "refresh":
          // Ctrl+R re-fetches live data rather than reloading the whole window.
          queryClient.invalidateQueries();
          break;
        case "find":
        case "new":
        case "new-alt":
          window.dispatchEvent(new CustomEvent("herdos:command-palette"));
          break;
        case "save":
          window.dispatchEvent(new CustomEvent("herdos:save"));
          break;
        default:
          break;
      }
    });

    return () => {
      offNavigate();
      offAction();
    };
  }, [router, queryClient]);

  return null;
}
