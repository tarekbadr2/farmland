"use client";

/**
 * Native desktop notifications via the web Notification API — which Electron
 * renders as real OS toasts, even while the window is hidden in the tray. Used
 * by the desktop background mode; a no-op where notifications aren't available
 * or permitted.
 */

export function notificationsAvailable(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!notificationsAvailable()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function canNotify(): boolean {
  return notificationsAvailable() && Notification.permission === "granted";
}

export function showDesktopNotification(
  title: string,
  body: string,
  opts?: { href?: string; silent?: boolean },
): void {
  if (!canNotify()) return;
  try {
    const n = new Notification(title, { body, silent: opts?.silent });
    n.onclick = () => {
      // On the desktop shell, restore the window from the tray (a plain
      // window.focus() can't un-hide it); then navigate within the SPA rather
      // than a full reload. Falls back to focus + location on the web.
      const desktopWindow = (window as unknown as { desktopWindow?: { show: () => void } })
        .desktopWindow;
      if (desktopWindow?.show) desktopWindow.show();
      else window.focus();
      if (opts?.href) {
        window.dispatchEvent(new CustomEvent("herdos:navigate", { detail: opts.href }));
      }
    };
  } catch {
    // Best-effort — never let a notification failure break the app.
  }
}
