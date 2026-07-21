"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

/**
 * "Get the app" — a direct download of the Windows installer.
 *
 * Clicking it downloads the .exe straight away (the browser's save-file dialog);
 * no intermediate page. The link targets the *latest* GitHub Release asset under
 * a fixed filename, so it keeps working across version bumps. Hidden only when
 * the app is already running as an installed app.
 */
const DOWNLOAD_URL =
  "https://github.com/tarekbadr2/farmland/releases/latest/download/Herd-OS-Setup.exe";

export function InstallButton() {
  const { locale } = useI18n();
  const [standalone, setStandalone] = React.useState(false);

  React.useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches);
  }, []);

  // Never in the bundled desktop app — you're already running it.
  if (process.env.NEXT_PUBLIC_DESKTOP === "1") return null;
  if (standalone) return null;

  return (
    <Button asChild variant="outline" size="sm" className="hidden h-8 gap-1.5 sm:flex">
      <a href={DOWNLOAD_URL} download>
        <Download className="size-3.5" />
        {locale === "ar" ? "تنزيل التطبيق" : "Get the app"}
      </a>
    </Button>
  );
}
