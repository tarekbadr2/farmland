"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

/**
 * "Get the app" affordance.
 *
 * The browser's own PWA install prompt is unreliable as the *only* download
 * path: it only fires on Chrome/Edge/Android, disappears once the app is already
 * installed, and never shows on iOS or Firefox. So this button is always visible
 * on the web and does the best thing available — a native one-click install when
 * the browser offers it, otherwise it opens the desktop installer download. It
 * hides only when the app is already running as an installed app.
 */

// Latest published GitHub Release — its page carries the Windows .exe installer.
const DOWNLOAD_URL = "https://github.com/tarekbadr2/farmland/releases/latest";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallButton() {
  const { locale } = useI18n();
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = React.useState(false);

  React.useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    const onPrompt = (e: Event) => {
      e.preventDefault(); // suppress the mini-infobar; we drive install from the button
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone) return null; // already installed — nothing to offer

  const getApp = async () => {
    if (deferred) {
      await deferred.prompt(); // native one-click install (Chrome/Edge/Android)
      await deferred.userChoice.catch(() => undefined);
      setDeferred(null);
    } else {
      window.open(DOWNLOAD_URL, "_blank", "noopener"); // desktop installer download
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="hidden h-8 gap-1.5 sm:flex"
      onClick={getApp}
    >
      <Download className="size-3.5" />
      {locale === "ar" ? "تنزيل التطبيق" : "Get the app"}
    </Button>
  );
}
