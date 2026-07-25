"use client";

import * as React from "react";
import { Activity, Baby, BellOff, Coins, HeartPulse, Milk, Monitor, Package, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Switch, Separator } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import {
  NOTIFICATION_CATEGORIES,
  setCategoryEnabled,
  setNotificationsMuted,
  useNotificationPrefs,
  type NotificationCategory,
} from "@/lib/notification-prefs";
import {
  useBackgroundMode,
  setBackgroundMode,
  isBackgroundSupported,
} from "@/lib/background-mode";
import { ensureNotificationPermission } from "@/lib/desktop-notify";
import { cn } from "@/lib/utils";

const META: Record<NotificationCategory, { icon: LucideIcon; en: string; ar: string }> = {
  health: { icon: HeartPulse, en: "Health & vaccinations", ar: "الصحة والتحصينات" },
  breeding: { icon: Baby, en: "Breeding & calving", ar: "التلقيح والولادة" },
  milk: { icon: Milk, en: "Milk", ar: "الحليب" },
  inventory: { icon: Package, en: "Stock & feed", ar: "المخزون والأعلاف" },
  weather: { icon: Sun, en: "Weather & heat stress", ar: "الطقس والإجهاد الحراري" },
  task: { icon: Activity, en: "Tasks", ar: "المهام" },
  finance: { icon: Coins, en: "Finance", ar: "المالية" },
  system: { icon: Monitor, en: "System", ar: "النظام" },
};

/**
 * Notification preferences — mute everything, or keep just the categories that
 * matter to this person, plus the desktop close-to-tray behaviour. All per
 * device, since who wants which pop-up on which machine is a personal choice.
 */
export function NotificationPreferences() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const prefs = useNotificationPrefs();
  const background = useBackgroundMode();
  const [bgSupported, setBgSupported] = React.useState(false);

  React.useEffect(() => setBgSupported(isBackgroundSupported()), []);

  const toggleBackground = async (on: boolean) => {
    setBackgroundMode(on);
    if (on) await ensureNotificationPermission();
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <div className="px-5 pb-2 pt-4">
          <CardTitle>{ar ? "التنبيهات" : "Notifications"}</CardTitle>
          <CardDescription>
            {ar
              ? "اختر أنواع التنبيهات التي تظهر كإشعارات على هذا الجهاز."
              : "Choose which alerts pop up on this device."}
          </CardDescription>
        </div>
        <CardContent>
          {/* Master mute. */}
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <BellOff className={cn("size-4", prefs.muted ? "text-destructive" : "text-muted-foreground")} />
              <div>
                <p className="text-[13.5px] font-medium">{ar ? "كتم كل الإشعارات" : "Mute all notifications"}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {ar ? "لا تظهر أي إشعارات منبثقة" : "No pop-ups at all"}
                </p>
              </div>
            </div>
            <Switch checked={prefs.muted} onCheckedChange={setNotificationsMuted} />
          </div>

          <Separator className="my-2" />

          {/* Per-category, dimmed while muted. */}
          <div className={cn("space-y-0.5", prefs.muted && "pointer-events-none opacity-45")}>
            {NOTIFICATION_CATEGORIES.map((cat) => {
              const m = META[cat];
              const on = prefs.categories[cat] !== false;
              return (
                <div key={cat} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2.5">
                    <m.icon className="size-4 text-muted-foreground" />
                    <span className="text-[13px]">{ar ? m.ar : m.en}</span>
                  </div>
                  <Switch
                    checked={on}
                    disabled={prefs.muted}
                    onCheckedChange={(v) => setCategoryEnabled(cat, v)}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Desktop-only preferences. */}
      {bgSupported && (
        <Card>
          <div className="px-5 pb-2 pt-4">
            <CardTitle>{ar ? "تطبيق سطح المكتب" : "Desktop app"}</CardTitle>
            <CardDescription>
              {ar ? "سلوك الإغلاق والتشغيل في الخلفية." : "Close behaviour and background running."}
            </CardDescription>
          </div>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <p className="text-[13.5px] font-medium">
                  {ar ? "الإبقاء في شريط المهام عند الإغلاق" : "Keep running in the tray on close"}
                </p>
                <p className="text-[11.5px] text-muted-foreground">
                  {background
                    ? ar
                      ? "زر الإغلاق يخفي التطبيق ويبقيه ينبّهك."
                      : "The close button hides the app and keeps alerting you."
                    : ar
                      ? "زر الإغلاق ينهي التطبيق تمامًا."
                      : "The close button quits the app entirely."}
                </p>
              </div>
              <Switch checked={background} onCheckedChange={toggleBackground} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
