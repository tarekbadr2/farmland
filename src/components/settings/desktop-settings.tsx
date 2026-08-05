"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Power, PanelsTopLeft, Keyboard } from "lucide-react";

import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Label, Switch } from "@/components/ui/primitives";
import { cardIn, gridStagger } from "@/components/common/page-header";
import { useI18n } from "@/lib/i18n/provider";
import { IS_DESKTOP } from "@/lib/platform";
import { useLaunchSettings } from "@/lib/desktop-launch";
import {
  useBackgroundMode,
  setBackgroundMode,
  isBackgroundSupported,
  syncBackgroundMode,
} from "@/lib/background-mode";
import { UpdateChecker } from "@/components/settings/update-checker";

/**
 * The Desktop settings home — consolidates the native-app preferences that only
 * apply to the installed Electron build: startup behaviour, background/tray
 * operation, automatic updates, and a keyboard-shortcut reference. Renders
 * nothing on the web.
 */
export function DesktopSettings() {
  if (!IS_DESKTOP) return null;
  return <DesktopSettingsInner />;
}

function ToggleRow({
  title,
  desc,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <Label className="text-[13.5px]">{title}</Label>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function DesktopSettingsInner() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const launch = useLaunchSettings();
  const bg = useBackgroundMode();
  const [bgSupported, setBgSupported] = React.useState(false);

  React.useEffect(() => {
    setBgSupported(isBackgroundSupported());
    syncBackgroundMode();
  }, []);

  const shortcuts: [string, string][] = [
    ["Ctrl / ⌘ + K", ar ? "لوحة الأوامر" : "Command palette"],
    ["Ctrl / ⌘ + N", ar ? "عنصر جديد" : "New item"],
    ["Ctrl / ⌘ + Shift + N", ar ? "إضافة سريعة" : "Quick add"],
    ["Ctrl / ⌘ + F", ar ? "بحث" : "Find"],
    ["Ctrl / ⌘ + R", ar ? "تحديث البيانات" : "Refresh data"],
    ["Ctrl / ⌘ + P", ar ? "طباعة" : "Print"],
    ["Ctrl / ⌘ + S", ar ? "حفظ" : "Save"],
    ["Ctrl / ⌘ +  + / − / 0", ar ? "تكبير / تصغير" : "Zoom in / out / reset"],
    ["F11", ar ? "ملء الشاشة" : "Fullscreen"],
    ["Esc", ar ? "إغلاق الحوار" : "Close dialog"],
  ];

  return (
    <motion.div
      variants={gridStagger}
      initial="hidden"
      animate="show"
      className="grid gap-3 lg:grid-cols-2"
    >
      {/* Startup */}
      <motion.div variants={cardIn}>
        <Card>
          <div className="flex items-center gap-2 px-5 pb-2 pt-4">
            <Power className="size-4 text-primary" />
            <div>
              <CardTitle>{ar ? "بدء التشغيل" : "Startup"}</CardTitle>
              <CardDescription>
                {ar ? "كيف يبدأ التطبيق مع نظامك." : "How the app starts with your system."}
              </CardDescription>
            </div>
          </div>
          <CardContent>
            <ToggleRow
              title={ar ? "التشغيل عند بدء النظام" : "Launch on system startup"}
              desc={ar ? "يفتح Herd OS تلقائيًا عند تسجيل الدخول." : "Open Herd OS automatically when you log in."}
              checked={launch.openAtLogin}
              disabled={!launch.supported || !launch.ready}
              onChange={(v) => launch.update({ openAtLogin: v })}
            />
            <ToggleRow
              title={ar ? "البدء مصغّرًا" : "Start minimized"}
              desc={
                ar
                  ? "يبدأ في شريط المهام بدل فتح نافذة (يتطلب التشغيل في الخلفية)."
                  : "Start tucked in the tray instead of opening a window (needs background mode)."
              }
              checked={launch.openAsHidden}
              disabled={!launch.supported || !launch.ready || !launch.openAtLogin}
              onChange={(v) => launch.update({ openAsHidden: v })}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Background operation */}
      <motion.div variants={cardIn}>
        <Card>
          <div className="flex items-center gap-2 px-5 pb-2 pt-4">
            <PanelsTopLeft className="size-4 text-primary" />
            <div>
              <CardTitle>{ar ? "التشغيل في الخلفية" : "Background operation"}</CardTitle>
              <CardDescription>
                {ar ? "أبقِ التطبيق يعمل ليصلك التنبيهات." : "Keep the app running so alerts still reach you."}
              </CardDescription>
            </div>
          </div>
          <CardContent>
            <ToggleRow
              title={ar ? "الاستمرار في شريط المهام" : "Keep running in the tray"}
              desc={
                ar
                  ? "عند إغلاق النافذة يبقى Herd OS في شريط المهام وينبّهك بالأحداث المهمة بدل أن يُغلق."
                  : "When you close the window, Herd OS tucks into the system tray and keeps notifying you of important events instead of quitting."
              }
              checked={bg}
              disabled={!bgSupported}
              onChange={setBackgroundMode}
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* Auto-updates */}
      <motion.div variants={cardIn}>
        <UpdateChecker />
      </motion.div>

      {/* Keyboard shortcuts */}
      <motion.div variants={cardIn}>
        <Card>
          <div className="flex items-center gap-2 px-5 pb-2 pt-4">
            <Keyboard className="size-4 text-primary" />
            <div>
              <CardTitle>{ar ? "اختصارات لوحة المفاتيح" : "Keyboard shortcuts"}</CardTitle>
              <CardDescription>
                {ar ? "التنقّل والإجراءات السريعة." : "Navigate and act faster."}
              </CardDescription>
            </div>
          </div>
          <CardContent className="space-y-1.5">
            {shortcuts.map(([keys, label]) => (
              <div key={keys} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-muted-foreground">{label}</span>
                <kbd className="rounded border border-border bg-muted/50 px-2 py-0.5 font-mono text-[11.5px]">
                  {keys}
                </kbd>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
