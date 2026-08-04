/**
 * A caller's active farm id from their `users/{uid}` mapping — tolerant of every
 * shape we've ever written it in.
 *
 * Invited users get a scalar `farmId` (claimMembership); self-serve owners get
 * `farmIds[]` + `defaultFarmId` (createFarm). The billing and AI routes used to
 * read only the scalar, so owners — the exact people who pay — resolved to
 * `no-farm` and could never check out. This reconciles both.
 */
export function resolveUserFarmId(data: Record<string, unknown> | undefined | null): string | null {
  if (!data) return null;
  const scalar = typeof data.farmId === "string" ? data.farmId : null;
  const preferred = typeof data.defaultFarmId === "string" ? data.defaultFarmId : null;
  const first =
    Array.isArray(data.farmIds) && typeof data.farmIds[0] === "string"
      ? (data.farmIds[0] as string)
      : null;
  return scalar ?? preferred ?? first ?? null;
}
