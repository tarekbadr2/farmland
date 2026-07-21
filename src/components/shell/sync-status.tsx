"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff, RefreshCw, Check } from "lucide-react";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { useI18n } from "@/lib/i18n/provider";
import { isFirebaseBackend } from "@/core/repositories";
import { setReloadSyncing } from "@/lib/sync/offline-store";
import { cn } from "@/lib/utils";

/**
 * A quiet status pill that only speaks up when it has something to say.
 *
 * Three states, in order of who cares: offline (the milker needs to know their
 * work is being kept safe locally), syncing (writes draining after reconnect),
 * and — briefly — all-caught-up. When online with an empty queue it renders
 * nothing, because a permanent green "synced" badge is just noise.
 */
export function SyncStatus({ className }: { className?: string }) {
  const { online, pending, everQueued, reloadSyncing } = useSyncStatus();
  const { locale } = useI18n();
  const ar = locale === "ar";

  // After a reload, ask Firestore's own queue whether writes from a previous
  // session are still draining. Only show "syncing" if it hasn't settled within
  // a moment — otherwise a clean load would flash the indicator for nothing.
  React.useEffect(() => {
    if (!isFirebaseBackend()) return;
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) setReloadSyncing(true);
    }, 300);

    Promise.all([
      import("@/infrastructure/firebase/client"),
      import("firebase/firestore"),
    ]).then(([{ getFirebase }, { waitForPendingWrites }]) => {
      waitForPendingWrites(getFirebase().db).then(() => {
        settled = true;
        clearTimeout(timer);
        setReloadSyncing(false);
      });
    });

    return () => clearTimeout(timer);
  }, []);

  // Flash "synced" for a moment when the queue drains after having been used.
  const [justSynced, setJustSynced] = React.useState(false);
  const prev = React.useRef({ pending, online });
  React.useEffect(() => {
    const wasPending = prev.current.pending > 0;
    if (wasPending && pending === 0 && online) {
      setJustSynced(true);
      const timer = setTimeout(() => setJustSynced(false), 2600);
      prev.current = { pending, online };
      return () => clearTimeout(timer);
    }
    prev.current = { pending, online };
  }, [pending, online]);

  let mode: "offline" | "syncing" | "synced" | null = null;
  if (!online) mode = "offline";
  else if (pending > 0 || reloadSyncing) mode = "syncing";
  else if (justSynced && everQueued) mode = "synced";

  const label =
    mode === "offline"
      ? pending > 0
        ? ar
          ? `غير متصل · ${pending} في الانتظار`
          : `Offline · ${pending} queued`
        : ar
          ? "غير متصل · العمل محفوظ"
          : "Offline · work is saved"
      : mode === "syncing"
        ? pending > 0
          ? ar
            ? `جارٍ المزامنة · ${pending}`
            : `Syncing · ${pending}`
          : ar
            ? "جارٍ المزامنة"
            : "Syncing…"
        : ar
          ? "تمت المزامنة"
          : "All synced";

  return (
    <AnimatePresence>
      {mode && (
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: -4, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.96 }}
          transition={{ duration: 0.18 }}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium",
            mode === "offline" &&
              "border-[color-mix(in_oklab,var(--warning)_40%,transparent)] bg-[color-mix(in_oklab,var(--warning)_12%,transparent)] text-[var(--warning)]",
            mode === "syncing" && "border-primary/40 bg-primary/10 text-primary",
            mode === "synced" &&
              "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            className,
          )}
        >
          {mode === "offline" && <CloudOff className="size-3.5" />}
          {mode === "syncing" && <RefreshCw className="size-3.5 animate-spin" />}
          {mode === "synced" && <Check className="size-3.5" />}
          <span className="whitespace-nowrap">{label}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
