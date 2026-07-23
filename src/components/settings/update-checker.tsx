"use client";

import * as React from "react";
import { CloudDownload, Loader2, CheckCircle2, RotateCw } from "lucide-react";

import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import { IS_DESKTOP } from "@/lib/platform";

type UpdateStatus =
  | { status: "checking" }
  | { status: "available"; version?: string }
  | { status: "none"; version?: string }
  | { status: "downloading"; percent?: number }
  | { status: "ready"; version?: string }
  | { status: "error" };

interface DesktopUpdater {
  check: () => Promise<{ ok: boolean; reason?: string }>;
  version: () => Promise<string>;
  onStatus: (cb: (s: UpdateStatus) => void) => () => void;
}

function getUpdater(): DesktopUpdater | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { desktopUpdater?: DesktopUpdater }).desktopUpdater ?? null;
}

/**
 * Desktop-only self-update panel. The app already checks for updates on launch;
 * this lets the user check on demand and see live progress. Renders nothing on
 * the web (and in an older desktop build with no updater bridge).
 */
export function UpdateChecker() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [version, setVersion] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<UpdateStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [devMode, setDevMode] = React.useState(false);

  React.useEffect(() => {
    const updater = getUpdater();
    if (!updater) return;
    updater.version().then(setVersion).catch(() => {});
    const off = updater.onStatus((s) => {
      setStatus(s);
      // A terminal state ends the "checking" spinner.
      if (s.status === "none" || s.status === "ready" || s.status === "error") setBusy(false);
      if (s.status === "ready" && "version" in s && s.version) setVersion((v) => v); // keep current
    });
    return off;
  }, []);

  // Only render inside the desktop app that exposes the bridge.
  if (!IS_DESKTOP || !getUpdater()) return null;

  const check = async () => {
    setBusy(true);
    setStatus({ status: "checking" });
    const res = await getUpdater()!.check();
    if (!res.ok && res.reason === "dev") {
      setDevMode(true);
      setBusy(false);
      setStatus(null);
    } else if (!res.ok) {
      setBusy(false);
      setStatus({ status: "error" });
    }
  };

  const line = (() => {
    if (devMode)
      return ar ? "التحديثات متاحة في التطبيق المثبَّت فقط." : "Updates run in the installed app.";
    if (!status) return null;
    switch (status.status) {
      case "checking":
        return ar ? "جارٍ البحث عن تحديثات…" : "Checking for updates…";
      case "none":
        return ar ? "أنت على أحدث إصدار." : "You're on the latest version.";
      case "available":
        return ar
          ? `يتم تنزيل الإصدار ${status.version ?? ""}…`
          : `Downloading version ${status.version ?? ""}…`;
      case "downloading":
        return ar
          ? `جارٍ التنزيل… ${status.percent ?? 0}%`
          : `Downloading… ${status.percent ?? 0}%`;
      case "ready":
        return ar
          ? "التحديث جاهز — أعد تشغيل التطبيق لتطبيقه."
          : "Update ready — restart the app to apply it.";
      case "error":
        return ar ? "تعذّر التحقق الآن. حاول لاحقًا." : "Couldn't check right now. Try again later.";
    }
  })();

  const ready = status?.status === "ready";
  const upToDate = status?.status === "none";

  return (
    <Card className="lg:col-span-2">
      <div className="px-5 pb-2 pt-4">
        <CardTitle>{ar ? "التحديثات" : "Updates"}</CardTitle>
        <CardDescription>
          {ar ? "يُحدَّث Herd OS تلقائيًا — لا حاجة لإعادة التثبيت." : "Herd OS updates itself — no reinstalling."}
        </CardDescription>
      </div>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px]">
          <p className="font-medium">
            {ar ? "الإصدار الحالي" : "Current version"}
            {version ? <span className="ms-1.5 text-muted-foreground">v{version}</span> : null}
          </p>
          {line && (
            <p
              className={
                ready || upToDate ? "mt-0.5 text-[12.5px] text-primary" : "mt-0.5 text-[12.5px] text-muted-foreground"
              }
            >
              {line}
            </p>
          )}
        </div>

        <Button variant="outline" onClick={check} disabled={busy}>
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : ready ? (
            <RotateCw />
          ) : upToDate ? (
            <CheckCircle2 />
          ) : (
            <CloudDownload />
          )}
          {ar ? "التحقق من التحديثات" : "Check for updates"}
        </Button>
      </CardContent>
    </Card>
  );
}
