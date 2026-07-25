"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { BellOff, HardHat, Languages, Monitor, Moon, Settings2, Sun, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import {
  setNotificationsMuted,
  setNotificationSound,
  useNotificationPrefs,
} from "@/lib/notification-prefs";
import {
  isBackgroundSupported,
  setBackgroundMode,
  useBackgroundMode,
} from "@/lib/background-mode";
import { ensureNotificationPermission } from "@/lib/desktop-notify";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "light", icon: Sun, en: "Light", ar: "فاتح" },
  { value: "dark", icon: Moon, en: "Dark", ar: "داكن" },
  { value: "system", icon: Monitor, en: "Auto", ar: "تلقائي" },
] as const;

/**
 * Quick preferences from the top-right: appearance (theme moved here from the
 * account menu), language, a one-tap notification mute, and the desktop
 * close-to-tray switch. The full per-category controls live in Settings, linked
 * at the bottom.
 */
export function PreferencesMenu() {
  const { locale, toggleLocale } = useI18n();
  const ar = locale === "ar";
  const { theme, setTheme } = useTheme();
  const prefs = useNotificationPrefs();
  const background = useBackgroundMode();

  // next-themes is client-only; avoid highlighting the wrong option before hydration.
  const [mounted, setMounted] = React.useState(false);
  const [bgSupported, setBgSupported] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
    setBgSupported(isBackgroundSupported());
  }, []);

  const toggleBackground = async (on: boolean) => {
    setBackgroundMode(on);
    if (on) await ensureNotificationPermission();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={ar ? "التفضيلات" : "Preferences"}>
          <Settings2 />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{ar ? "المظهر" : "Appearance"}</DropdownMenuLabel>
        <div className="px-1.5 pb-1.5">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1">
            {THEMES.map((t) => {
              const active = mounted && (theme ?? "system") === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition",
                    active ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <t.icon className="size-4" />
                  {ar ? t.ar : t.en}
                </button>
              );
            })}
          </div>
        </div>

        <DropdownMenuItem onSelect={() => toggleLocale()}>
          <Languages />
          {locale === "en" ? "العربية" : "English"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{ar ? "الإشعارات" : "Notifications"}</DropdownMenuLabel>

        {/* Toggle rows — not menu items, so clicking the switch keeps the menu open. */}
        <label className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-[13px] hover:bg-accent">
          <span className="flex items-center gap-2">
            <BellOff className={cn("size-4", prefs.muted ? "text-destructive" : "text-muted-foreground")} />
            {ar ? "كتم كل الإشعارات" : "Mute all"}
          </span>
          <Switch checked={prefs.muted} onCheckedChange={setNotificationsMuted} />
        </label>

        <label
          className={cn(
            "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-[13px] hover:bg-accent",
            prefs.muted && "pointer-events-none opacity-45",
          )}
        >
          <span className="flex items-center gap-2">
            <Volume2 className="size-4 text-muted-foreground" />
            {ar ? "الصوت" : "Sound"}
          </span>
          <Switch checked={prefs.sound} disabled={prefs.muted} onCheckedChange={setNotificationSound} />
        </label>

        {bgSupported && (
          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-[13px] hover:bg-accent">
            <span className="flex items-center gap-2">
              <HardHat className="size-4 text-muted-foreground" />
              {ar ? "البقاء في شريط المهام" : "Keep in tray on close"}
            </span>
            <Switch checked={background} onCheckedChange={toggleBackground} />
          </label>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings#notifications">{ar ? "كل الإعدادات" : "All settings"}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
