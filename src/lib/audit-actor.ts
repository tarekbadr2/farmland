/**
 * Who is performing actions right now, for the audit log.
 *
 * The repository stamps every audit entry with the acting user, but it's
 * decoupled from auth — so the auth provider pushes the current actor here on
 * sign-in (mirrors how tenant.ts holds the active farm). A module-level value,
 * read by both repository adapters when they log an action.
 */

import type { Role } from "@/core/domain/types";

export interface AuditActor {
  uid: string;
  name: string;
  role: Role;
}

let actor: AuditActor | null = null;

export function setAuditActor(a: AuditActor | null): void {
  actor = a;
}

export function getAuditActor(): AuditActor {
  return actor ?? { uid: "system", name: "System", role: "owner" };
}

/** Best-effort device hint for an entry (user agent). */
export function currentDevice(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  return navigator.userAgent.slice(0, 180);
}
