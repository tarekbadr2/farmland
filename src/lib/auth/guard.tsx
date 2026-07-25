"use client";

import * as React from "react";
import { Lock } from "lucide-react";

import { useAuth } from "@/lib/auth/provider";
import { useI18n } from "@/lib/i18n/provider";
import { hasPermission, type PermissionKey } from "@/core/auth/permissions";

/**
 * Client-side permission checks. The UI is NOT the security boundary — the
 * Firestore rules are — but gating nav, pages and actions here keeps people from
 * walking into screens they can't use. Both read the same permission set, so
 * they agree by construction.
 */
export function usePermission() {
  const { user, bypassed } = useAuth();
  const perms = user?.permissions;
  const has = React.useCallback(
    (key: PermissionKey) => bypassed || user?.role === "owner" || hasPermission(perms, key),
    [perms, bypassed, user?.role],
  );
  const hasAny = React.useCallback(
    (keys: PermissionKey[]) => keys.some((k) => has(k)),
    [has],
  );
  return {
    has,
    hasAny,
    farmIds: user?.farmIds ?? [],
    activeFarmId: user?.activeFarmId,
    orgId: user?.orgId,
  };
}

/**
 * Renders its children only if the user holds the permission (or ANY of `anyOf`).
 * Use around buttons, menu items and modals. Falls back to `fallback` (default
 * nothing), so an unauthorized action simply isn't shown.
 */
export function Can({
  permission,
  anyOf,
  fallback = null,
  children,
}: {
  permission?: PermissionKey;
  anyOf?: PermissionKey[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { has, hasAny } = usePermission();
  const allowed = permission ? has(permission) : anyOf ? hasAny(anyOf) : true;
  return <>{allowed ? children : fallback}</>;
}

/**
 * Page-level guard. Wrap a route's content; if the user lacks the permission
 * they get a friendly "no access" panel instead of a broken or empty screen.
 */
export function RequirePermission({
  permission,
  anyOf,
  children,
}: {
  permission?: PermissionKey;
  anyOf?: PermissionKey[];
  children: React.ReactNode;
}) {
  const { has, hasAny } = usePermission();
  const allowed = permission ? has(permission) : anyOf ? hasAny(anyOf) : true;
  if (allowed) return <>{children}</>;
  return <NoAccess />;
}

function NoAccess() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Lock className="size-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-[15px] font-semibold">
          {ar ? "لا تملك صلاحية الوصول" : "You don't have access"}
        </p>
        <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
          {ar
            ? "هذه الصفحة تتطلب صلاحية لا تتضمنها مهمتك. تواصل مع مالك المزرعة إذا كنت تظن أن هذا خطأ."
            : "This page needs a permission your role doesn't include. Ask the farm owner if you think this is a mistake."}
        </p>
      </div>
    </div>
  );
}
