/**
 * Active-tenant (farm) resolution.
 *
 * The app is multi-tenant: which farm a user sees is resolved at login from
 * their membership, not baked into the build. This holds the currently active
 * farm id; the data-path layer and repository read it on every call, so a single
 * long-lived repository instance serves whichever farm the signed-in user
 * belongs to.
 *
 * Until a farm is resolved (before login, or in scripts) it falls back to
 * DEFAULT_FARM so the seed farm and tooling keep working. Once auth sets the
 * active farm, everything follows it.
 */

/** The seed / fallback farm — used before login and by admin tooling. */
export const DEFAULT_FARM = process.env.NEXT_PUBLIC_FARM_ID || "farm_nile_delta";

let active: string | null = null;

/** Set the signed-in user's farm (call after resolving membership). Pass null
 *  to clear on sign-out. */
export function setActiveFarm(farmId: string | null): void {
  active = farmId;
}

/** The farm all data paths resolve against right now. */
export function getActiveFarm(): string {
  return active || DEFAULT_FARM;
}

/** Whether a farm has actually been resolved for the current user (vs the
 *  fallback) — false means "not signed into a farm yet". */
export function hasActiveFarm(): boolean {
  return active !== null;
}
