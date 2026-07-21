"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

/**
 * "Install app" affordance. Chrome/Edge/Android fire `beforeinstallprompt` once
 * the PWA is installable; we capture it and show a button. iOS Safari doesn't
 * expose an install API (it's Share → Add to Home Screen), so the button simply
 * never appears there — and it hides itself once the app is already installed.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallButton() {
  const { locale } = useI18n();
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return; // already installed

    const onPrompt = (e: Event) => {
      e.preventDefault(); // stop the mini-infobar; we drive it from our button
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

  if (!deferred) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="hidden h-8 gap-1.5 sm:flex"
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice.catch(() => undefined);
        setDeferred(null);
      }}
    >
      <Download className="size-3.5" />
      {locale === "ar" ? "تثبيت التطبيق" : "Install app"}
    </Button>
  );
}
