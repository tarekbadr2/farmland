"use client";

import * as React from "react";
import { BellRing } from "lucide-react";

import { Switch } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import {
  useBackgroundMode,
  setBackgroundMode,
  syncBackgroundMode,
  isBackgroundSupported,
} from "@/lib/background-mode";
import { ensureNotificationPermission, showDesktopNotification } from "@/lib/desktop-notify";

/**
 * Sidebar switch (desktop only) that keeps Herd OS running in the tray after
 * you close the window, so it can still push desktop notifications for alerts.
 * Distinct from phone Work mode. Renders nothing on the web.
 */
export function BackgroundModeToggle({ collapsed }: { collapsed?: boolean }) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const on = useBackgroundMode();
  const [supported, setSupported] = React.useState(false);

  React.useEffect(() => {
    setSupported(isBackgroundSupported());
    // Push the stored preference to the main process on launch.
    syncBackgroundMode();
  }, []);

  if (!supported) return null;

  const toggle = async (next: boolean) => {
    setBackgroundMode(next);
    if (next) {
      const granted = await ensureNotificationPermission();
      if (granted) {
        showDesktopNotification(
          ar ? "التشغيل في الخلفية مُفعّل" : "Background mode is on",
          ar
            ? "سيبقى Herd OS يعمل في شريط المهام وينبّهك بالتنبيهات المهمة."
            : "Herd OS will keep running in the tray and alert you to important events.",
        );
      }
    }
  };

  if (collapsed) {
    return (
      <button
        onClick={() => toggle(!on)}
        aria-label={ar ? "التشغيل في الخلفية" : "Background mode"}
        aria-pressed={on}
        className={cn(
          "mx-auto mb-3 flex size-9 items-center justify-center rounded-lg border transition",
          on
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:border-ring/40",
        )}
      >
        <BellRing className="size-4" />
      </button>
    );
  }

  return (
    <div className="mx-3 mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-card/40 px-3 py-2.5">
      <BellRing className={cn("size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium leading-tight">
          {ar ? "التشغيل في الخلفية" : "Background mode"}
        </p>
        <p className="mt-0.5 text-[10.5px] leading-tight text-muted-foreground">
          {ar ? "يبقى نشطًا مع التنبيهات" : "Stay running with alerts"}
        </p>
      </div>
      <Switch checked={on} onCheckedChange={toggle} aria-label={ar ? "التشغيل في الخلفية" : "Background mode"} />
    </div>
  );
}
