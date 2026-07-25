import { describe, expect, it } from "vitest";

import {
  ASSIGNABLE_ROLES,
  ROLE_PERMISSIONS,
  effectivePermissions,
  hasPermission,
  permissionsForRole,
  type PermissionKey,
} from "./permissions";

describe("hasPermission", () => {
  it("grants everything to the wildcard owner", () => {
    expect(hasPermission(["*"], "accounting.write")).toBe(true);
    expect(hasPermission(["*"], "org.settings")).toBe(true);
  });

  it("matches an exact key", () => {
    expect(hasPermission(["animals.read"], "animals.read")).toBe(true);
    expect(hasPermission(["animals.read"], "animals.write")).toBe(false);
  });

  it("honours a module wildcard", () => {
    expect(hasPermission(["animals.*"], "animals.delete")).toBe(true);
    expect(hasPermission(["animals.*"], "medical.read")).toBe(false);
  });

  it("denies an empty or missing set", () => {
    expect(hasPermission([], "animals.read")).toBe(false);
    expect(hasPermission(undefined, "animals.read")).toBe(false);
  });
});

describe("role catalog matches the spec's Can / Cannot", () => {
  const can = (role: string, key: PermissionKey) =>
    hasPermission(permissionsForRole(role), key);

  it("owner can do everything", () => {
    expect(can("owner", "org.settings")).toBe(true);
    expect(can("owner", "accounting.write")).toBe(true);
    expect(can("owner", "animals.delete")).toBe(true);
  });

  it("veterinarian: medical yes, money/employees/org no", () => {
    expect(can("veterinarian", "medical.write")).toBe(true);
    expect(can("veterinarian", "vaccinations.write")).toBe(true);
    expect(can("veterinarian", "breeding.write")).toBe(true);
    expect(can("veterinarian", "payroll.read")).toBe(false);
    expect(can("veterinarian", "accounting.write")).toBe(false);
    expect(can("veterinarian", "employees.manage")).toBe(false);
    expect(can("veterinarian", "org.settings")).toBe(false);
  });

  it("accountant: money yes, medical/breeding/org no", () => {
    expect(can("accountant", "accounting.write")).toBe(true);
    expect(can("accountant", "payroll.read")).toBe(true);
    expect(can("accountant", "medical.read")).toBe(false);
    expect(can("accountant", "breeding.read")).toBe(false);
    expect(can("accountant", "org.settings")).toBe(false);
  });

  it("farm_worker: tasks/feeding yes, money/employees/reports no", () => {
    expect(can("farm_worker", "tasks.write")).toBe(true);
    expect(can("farm_worker", "feeding.write")).toBe(true);
    expect(can("farm_worker", "expenses.read")).toBe(false);
    expect(can("farm_worker", "employees.manage")).toBe(false);
    expect(can("farm_worker", "reports.read")).toBe(false);
    expect(can("farm_worker", "org.settings")).toBe(false);
  });

  it("inventory_manager: stock yes, payroll/financial no", () => {
    expect(can("inventory_manager", "inventory.write")).toBe(true);
    expect(can("inventory_manager", "payroll.read")).toBe(false);
    expect(can("inventory_manager", "accounting.write")).toBe(false);
  });

  it("hr_manager: people yes, financial reports/medical no", () => {
    expect(can("hr_manager", "employees.manage")).toBe(true);
    expect(can("hr_manager", "payroll.read")).toBe(true);
    expect(can("hr_manager", "accounting.write")).toBe(false);
    expect(can("hr_manager", "medical.read")).toBe(false);
  });

  it("maintenance_manager: maintenance yes, payroll/accounting no", () => {
    expect(can("maintenance_manager", "maintenance.write")).toBe(true);
    expect(can("maintenance_manager", "payroll.read")).toBe(false);
    expect(can("maintenance_manager", "accounting.write")).toBe(false);
  });
});

describe("legacy roles keep their access", () => {
  it("maps manager → farm_manager and worker → farm_worker", () => {
    expect(permissionsForRole("manager")).toEqual(ROLE_PERMISSIONS.farm_manager);
    expect(permissionsForRole("worker")).toEqual(ROLE_PERMISSIONS.farm_worker);
  });
});

describe("effectivePermissions", () => {
  it("prefers an explicit set, else derives from role", () => {
    expect(effectivePermissions("veterinarian", ["animals.read"])).toEqual(["animals.read"]);
    expect(effectivePermissions("veterinarian", [])).toEqual(permissionsForRole("veterinarian"));
    expect(effectivePermissions("veterinarian", undefined)).toEqual(permissionsForRole("veterinarian"));
  });
});

describe("assignable roles", () => {
  it("excludes legacy roles from pickers", () => {
    expect(ASSIGNABLE_ROLES).toContain("veterinarian");
    expect(ASSIGNABLE_ROLES).not.toContain("manager");
    expect(ASSIGNABLE_ROLES).not.toContain("worker");
  });
});
