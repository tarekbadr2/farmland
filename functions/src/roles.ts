/**
 * Server-side mirror of the role → permission-key catalog.
 *
 * The canonical catalog lives in `src/core/auth/permissions.ts`. Functions are a
 * separately-bundled package, so this is a deliberate, compact mirror (module
 * wildcards keep it short). Keep the two in sync — if you add/rename a role or
 * change a role's grants there, reflect it here. acceptInvite computes the
 * member's permissions from this, so it is authoritative for what a new member
 * actually gets (the client never supplies permissions).
 */

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ["*"],
  farm_manager: [
    "animals.*", "medical.*", "vaccinations.*", "breeding.*", "milk.*", "feeding.*",
    "inventory.*", "maintenance.*", "tasks.*", "expenses.*", "accounting.*",
    "payroll.read", "employees.read", "employees.manage", "reports.read", "audit.read",
    "org.members", "org.settings",
  ],
  assistant_manager: [
    "animals.read", "animals.write", "medical.read", "breeding.read",
    "milk.read", "milk.write", "feeding.*", "inventory.read", "inventory.write",
    "maintenance.read", "tasks.*", "employees.read", "employees.manage", "reports.read",
  ],
  veterinarian: [
    "animals.read", "medical.*", "vaccinations.*", "breeding.*", "tasks.read", "reports.read",
  ],
  livestock_supervisor: [
    "animals.read", "medical.read", "milk.read", "feeding.*", "inventory.read",
    "tasks.*", "employees.read", "reports.read",
  ],
  farm_worker: ["animals.read", "milk.read", "feeding.*", "tasks.*"],
  milking_supervisor: [
    "animals.read", "milk.*", "maintenance.read", "tasks.*", "employees.read", "reports.read",
  ],
  breeding_manager: [
    "animals.read", "medical.read", "breeding.*", "tasks.read", "reports.read",
  ],
  inventory_manager: [
    "animals.read", "inventory.*", "feeding.*", "maintenance.read", "reports.read",
  ],
  accountant: [
    "expenses.*", "accounting.*", "payroll.read", "employees.read", "reports.read", "audit.read",
  ],
  hr_manager: [
    "employees.read", "employees.manage", "payroll.read", "tasks.read", "reports.read",
  ],
  maintenance_manager: [
    "maintenance.*", "inventory.read", "tasks.*", "reports.read",
  ],
};

export function permissionsForRole(role: string): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function isKnownRole(role: string): boolean {
  return role in ROLE_PERMISSIONS;
}
