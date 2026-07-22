"use client";

import { HardHat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { IS_DESKTOP } from "@/lib/platform";
import { useWorkMode, setWorkMode } from "@/lib/work-mode";

/**
 * Work-mode switch (web only). Turns the view-only website into the full app on
 * this device — for a worker who wants everything on their phone. Hidden on the
 * desktop build and in the demo, where the full app is already on.
 */
export function WorkModeToggle() {
  const { locale } = useI18n();
  const { bypassed } = useAuth();
  const on = useWorkMode();
  const ar = locale === "ar";

  if (IS_DESKTOP || bypassed) return null;

  return (
    <Button
      variant={on ? "default" : "outline"}
      size="sm"
      onClick={() => setWorkMode(!on)}
      className="gap-1.5"
      aria-pressed={on}
      title={ar ? "وضع العمل — التطبيق الكامل" : "Work mode — full app"}
    >
      <HardHat className="size-4" />
      <span className="hidden sm:inline">{ar ? "وضع العمل" : "Work mode"}</span>
    </Button>
  );
}
