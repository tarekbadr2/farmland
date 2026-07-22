"use client";

import { Download, Monitor } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/provider";
import { useI18n } from "@/lib/i18n/provider";
import { DOWNLOAD_URL } from "@/lib/download";
import { IS_DESKTOP } from "@/lib/platform";

/** Shown only on the website (view-only) — a persistent nudge to install the
 *  desktop app, where the farm is actually managed. Hidden on the desktop build
 *  and in the demo. */
export function WebDownloadBanner() {
  const { bypassed } = useAuth();
  const { locale } = useI18n();
  const ar = locale === "ar";

  if (IS_DESKTOP || bypassed) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/20 bg-primary/[0.06] px-4 py-2.5 sm:px-6"
      dir={ar ? "rtl" : "ltr"}
    >
      <Monitor className="size-4 shrink-0 text-primary" />
      <p className="text-[13px] font-medium">
        {ar ? "أنت على نسخة الويب" : "You're on the web version"}
        <span className="ms-2 font-normal text-muted-foreground">
          {ar
            ? "— لإدارة القطيع والحليب والحسابات، ثبّت تطبيق سطح المكتب."
            : "— to manage your herd, milk and finances, install the desktop app."}
        </span>
      </p>
      <Button asChild size="sm" className="ms-auto">
        <a href={DOWNLOAD_URL} download>
          <Download className="size-3.5" />
          {ar ? "حمّل التطبيق" : "Download the app"}
        </a>
      </Button>
    </div>
  );
}
