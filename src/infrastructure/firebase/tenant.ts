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

/**
 * The seed / fallback farm — used before login and by admin tooling.
 *
 * Only ever used when no farm has been resolved yet; a signed-in user is scoped
 * to their own farm via the membership mapping. In the SaaS/desktop build this
 * is set to a non-real sentinel (`unassigned`) so a stray pre-resolution query
 * is denied by the rules rather than touching a real tenant; the dev default
 * stays the seed farm so local tooling keeps working.
 */
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

// --------------------------- Preferred farm ---------------------------------
// When a user belongs to several farms, their last-chosen one is remembered per
// device so a reload keeps them where they were. resolveSession validates the
// stored id against the user's actual farms before honouring it.

const PREFERRED_KEY = "herdos.activeFarm";

export function readPreferredFarm(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFERRED_KEY);
  } catch {
    return null;
  }
}

export function rememberPreferredFarm(farmId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERRED_KEY, farmId);
  } catch {
    /* private mode / disabled storage — non-fatal */
  }
}

/** Pick the farm to open from the user's set: their remembered choice if still
 *  valid, else the default, else the first. Null when they belong to none. */
export function pickActiveFarm(farmIds: string[], defaultFarmId?: string | null): string | null {
  if (farmIds.length === 0) return null;
  const preferred = readPreferredFarm();
  if (preferred && farmIds.includes(preferred)) return preferred;
  if (defaultFarmId && farmIds.includes(defaultFarmId)) return defaultFarmId;
  return farmIds[0];
}
