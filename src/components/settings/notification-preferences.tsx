"use client";

import * as React from "react";
import {
  Activity,
  Baby,
  BellOff,
  Coins,
  HeartPulse,
  Milk,
  Monitor,
  Moon,
  Package,
  Power,
  Sun,
  Volume2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Switch, Separator } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import {
  NOTIFICATION_CATEGORIES,
  setCategoryEnabled,
  setNotificationsMuted,
  setNotificationSound,
  setQuietHours,
  useNotificationPrefs,
  type NotificationCategory,
} from "@/lib/notification-prefs";
import {
  useBackgroundMode,
  setBackgroundMode,
  isBackgroundSupported,
} from "@/lib/background-mode";
import { useLaunchSettings } from "@/lib/desktop-launch";
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
 * Notification preferences — mute everything, keep just the categories that
 * matter, silence the sound, set quiet hours, and control the desktop close /
 * launch behaviour. All per device, since who wants which pop-up on which
 * machine is a personal choice.
 */
export function NotificationPreferences() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const prefs = useNotificationPrefs();
  const background = useBackgroundMode();
  const launch = useLaunchSettings();
  const [bgSupported, setBgSupported] = React.useState(false);

  React.useEffect(() => setBgSupported(isBackgroundSupported()), []);

  const toggleBackground = async (on: boolean) => {
    setBackgroundMode(on);
    if (on) await ensureNotificationPermission();
  };

  const q = prefs.quietHours;
  const showDesktop = bgSupported || launch.supported;

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

          <Separator className="my-2" />

          {/* Sound. */}
          <div className={cn("flex items-center justify-between py-2", prefs.muted && "opacity-45")}>
            <div className="flex items-center gap-2.5">
              <Volume2 className="size-4 text-muted-foreground" />
              <span className="text-[13px]">{ar ? "صوت الإشعار" : "Notification sound"}</span>
            </div>
            <Switch
              checked={prefs.sound}
              disabled={prefs.muted}
              onCheckedChange={setNotificationSound}
            />
          </div>

          {/* Quiet hours. */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2.5">
              <Moon className="size-4 text-muted-foreground" />
              <div>
                <span className="text-[13px]">{ar ? "ساعات الهدوء" : "Quiet hours"}</span>
                <p className="text-[11.5px] text-muted-foreground">
                  {ar ? "إيقاف الإشعارات ضمن فترة محددة" : "Hold pop-ups during a set window"}
                </p>
              </div>
            </div>
            <Switch checked={q.enabled} onCheckedChange={(v) => setQuietHours({ enabled: v })} />
          </div>

          {q.enabled && (
            <div className="flex items-center gap-2 ps-6 pb-1 text-[13px]">
              <span className="text-muted-foreground">{ar ? "من" : "From"}</span>
              <input
                type="time"
                value={q.start}
                onChange={(e) => setQuietHours({ start: e.target.value })}
                className="rounded-md border border-input bg-card px-2 py-1 text-[13px] shadow-xs outline-none focus:border-ring/50"
              />
              <span className="text-muted-foreground">{ar ? "إلى" : "to"}</span>
              <input
                type="time"
                value={q.end}
                onChange={(e) => setQuietHours({ end: e.target.value })}
                className="rounded-md border border-input bg-card px-2 py-1 text-[13px] shadow-xs outline-none focus:border-ring/50"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Desktop-only preferences. */}
      {showDesktop && (
        <Card>
          <div className="px-5 pb-2 pt-4">
            <CardTitle>{ar ? "تطبيق سطح المكتب" : "Desktop app"}</CardTitle>
            <CardDescription>
              {ar ? "سلوك الإغلاق والتشغيل عند بدء النظام." : "Close and startup behaviour."}
            </CardDescription>
          </div>
          <CardContent className="space-y-2">
            {bgSupported && (
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
            )}

            {launch.supported && (
              <>
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Power className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-[13.5px] font-medium">
                        {ar ? "التشغيل عند بدء النظام" : "Start when I sign in"}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {ar ? "يفتح Herd OS تلقائيًا مع الويندوز." : "Launch Herd OS automatically with Windows."}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={launch.openAtLogin}
                    onCheckedChange={(v) => launch.update({ openAtLogin: v })}
                  />
                </div>

                <div
                  className={cn(
                    "flex items-center justify-between rounded-lg border border-border px-3 py-2.5",
                    (!launch.openAtLogin || !background) && "opacity-45",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Monitor className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-[13.5px] font-medium">
                        {ar ? "البدء مخفيًا في شريط المهام" : "Start hidden in the tray"}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {ar
                          ? "يبدأ في الخلفية دون فتح نافذة. يتطلب البقاء في شريط المهام."
                          : "Boots to the tray without a window. Needs tray-on-close on."}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={launch.openAsHidden}
                    disabled={!launch.openAtLogin || !background}
                    onCheckedChange={(v) => launch.update({ openAsHidden: v })}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
