/**
 * Granular RBAC catalog — the single source of truth for permissions.
 *
 * Access is permission-first: every gate (page, action, Firestore rule) checks a
 * `module.action` key, never a hardcoded role. Roles are just named collections
 * of these keys, so a new role or module is a data change here, not a code change
 * scattered across the app. Pure module — no React, no Firebase — so it's shared
 * by the client, the Cloud Functions, the rules mirror, and the tests.
 */

/** Every permission key, grouped by module. `module.action` form. */
export const PERMISSIONS = [
  // Herd
  "animals.read",
  "animals.write",
  "animals.delete",
  // Clinical
  "medical.read",
  "medical.write",
  "vaccinations.read",
  "vaccinations.write",
  "breeding.read",
  "breeding.write",
  // Production
  "milk.read",
  "milk.write",
  "feeding.read",
  "feeding.write",
  // Inventory & maintenance
  "inventory.read",
  "inventory.write",
  "maintenance.read",
  "maintenance.write",
  // Work
  "tasks.read",
  "tasks.write",
  // Money
  "expenses.read",
  "expenses.write",
  "accounting.read",
  "accounting.write",
  "payroll.read",
  // People
  "employees.read",
  "employees.manage",
  // Insight
  "reports.read",
  "audit.read",
  // Administration
  "org.settings",
  "org.members",
  "farms.manage",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

/** The predefined roles. Legacy values (`manager`, `worker`) are retained so
 *  member documents written before this system keep resolving. */
export type RoleKey =
  | "owner"
  | "farm_manager"
  | "assistant_manager"
  | "veterinarian"
  | "livestock_supervisor"
  | "farm_worker"
  | "milking_supervisor"
  | "breeding_manager"
  | "inventory_manager"
  | "accountant"
  | "hr_manager"
  | "maintenance_manager"
  // --- legacy roles (pre-RBAC), mapped in permissionsForRole ---
  | "manager"
  | "worker";

/** Wildcard: full, unrestricted access (the owner). */
export const ALL: readonly string[] = ["*"];

/**
 * Each role as a set of permission keys, transcribed from the role spec.
 * Owner is the wildcard. Every other role is an explicit, auditable list.
 */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly string[]> = {
  owner: ["*"],

  // Near-owner: runs the farm end to end, but not org-destructive/ownership
  // actions (those are owner-only and not expressed as permission keys).
  farm_manager: [
    // No animals.delete: an animal leaves the herd by disposal (a soft
    // transition), never by hard-delete, which would orphan its records.
    "animals.read", "animals.write",
    "medical.read", "medical.write",
    "vaccinations.read", "vaccinations.write",
    "breeding.read", "breeding.write",
    "milk.read", "milk.write",
    "feeding.read", "feeding.write",
    "inventory.read", "inventory.write",
    "maintenance.read", "maintenance.write",
    "tasks.read", "tasks.write",
    "expenses.read", "expenses.write",
    "accounting.read", "accounting.write",
    "payroll.read",
    "employees.read", "employees.manage",
    "reports.read", "audit.read",
    "org.members", "org.settings",
  ],

  assistant_manager: [
    "animals.read", "animals.write",
    "medical.read",
    "breeding.read",
    "milk.read", "milk.write",
    "feeding.read", "feeding.write",
    "inventory.read", "inventory.write",
    "maintenance.read",
    "tasks.read", "tasks.write",
    "employees.read", "employees.manage",
    "reports.read",
  ],

  veterinarian: [
    "animals.read",
    "medical.read", "medical.write",
    "vaccinations.read", "vaccinations.write",
    "breeding.read", "breeding.write",
    "tasks.read",
    "reports.read",
  ],

  livestock_supervisor: [
    "animals.read",
    "medical.read",
    "milk.read",
    "feeding.read", "feeding.write",
    "inventory.read",
    "tasks.read", "tasks.write",
    "employees.read",
    "reports.read",
  ],

  farm_worker: [
    "animals.read",
    "milk.read",
    "feeding.read", "feeding.write",
    "tasks.read", "tasks.write",
  ],

  milking_supervisor: [
    "animals.read",
    "milk.read", "milk.write",
    "maintenance.read",
    "tasks.read", "tasks.write",
    "employees.read",
    "reports.read",
  ],

  breeding_manager: [
    "animals.read",
    "medical.read",
    "breeding.read", "breeding.write",
    "tasks.read",
    "reports.read",
  ],

  inventory_manager: [
    "animals.read",
    "inventory.read", "inventory.write",
    "feeding.read", "feeding.write",
    "maintenance.read",
    "reports.read",
  ],

  accountant: [
    "expenses.read", "expenses.write",
    "accounting.read", "accounting.write",
    "payroll.read",
    "employees.read",
    "reports.read", "audit.read",
  ],

  hr_manager: [
    "employees.read", "employees.manage",
    "payroll.read",
    "tasks.read",
    "reports.read",
  ],

  maintenance_manager: [
    "maintenance.read", "maintenance.write",
    "inventory.read",
    "tasks.read", "tasks.write",
    "reports.read",
  ],

  // --- legacy aliases ---
  manager: [], // filled below to mirror farm_manager
  worker: [], // filled below to mirror farm_worker
};

// Legacy roles inherit the closest modern equivalent so old member docs keep
// their access without a migration.
(ROLE_PERMISSIONS as Record<string, readonly string[]>).manager = ROLE_PERMISSIONS.farm_manager;
(ROLE_PERMISSIONS as Record<string, readonly string[]>).worker = ROLE_PERMISSIONS.farm_worker;

/** Display metadata for the roles UI. Legacy roles are hidden from pickers. */
export const ROLE_META: Record<
  RoleKey,
  { en: string; ar: string; description: string; descriptionAr: string; legacy?: boolean }
> = {
  owner: { en: "Owner", ar: "المالك", description: "Complete, unrestricted access.", descriptionAr: "صلاحية كاملة غير مقيّدة." },
  farm_manager: { en: "Farm Manager", ar: "مدير المزرعة", description: "Runs daily operations, herd, staff and books.", descriptionAr: "يدير العمليات اليومية والقطيع والموظفين والحسابات." },
  assistant_manager: { en: "Assistant Farm Manager", ar: "مساعد مدير المزرعة", description: "Daily operations, tasks, staff and animals.", descriptionAr: "العمليات اليومية والمهام والموظفون والحيوانات." },
  veterinarian: { en: "Veterinarian", ar: "طبيب بيطري", description: "Medical records, treatments, vaccinations, breeding.", descriptionAr: "السجلات الطبية والعلاجات والتحصينات والتكاثر." },
  livestock_supervisor: { en: "Livestock Supervisor", ar: "مشرف الماشية", description: "Herd health, feeding, tasks and worker assignment.", descriptionAr: "صحة القطيع والتغذية والمهام وتوزيع العمال." },
  farm_worker: { en: "Farm Worker", ar: "عامل مزرعة", description: "Assigned tasks, feeding and watering records.", descriptionAr: "المهام المسندة وسجلات التغذية والسقي." },
  milking_supervisor: { en: "Milking Supervisor", ar: "مشرف الحلابة", description: "Milking sessions, production records, equipment.", descriptionAr: "جلسات الحلابة وسجلات الإنتاج والمعدات." },
  breeding_manager: { en: "Breeding Manager", ar: "مدير التكاثر", description: "AI, breeding schedule, pregnancy and calving.", descriptionAr: "التلقيح وجدول التكاثر والحمل والولادة." },
  inventory_manager: { en: "Inventory Manager", ar: "مدير المخزون", description: "Feed, medicine, equipment stock and warehouses.", descriptionAr: "مخزون الأعلاف والأدوية والمعدات والمستودعات." },
  accountant: { en: "Accountant", ar: "محاسب", description: "Revenue, expenses, payroll, invoices and reports.", descriptionAr: "الإيرادات والمصروفات والرواتب والفواتير والتقارير." },
  hr_manager: { en: "HR Manager", ar: "مدير الموارد البشرية", description: "Employees, attendance, schedules and payroll visibility.", descriptionAr: "الموظفون والحضور والجداول ورؤية الرواتب." },
  maintenance_manager: { en: "Maintenance Manager", ar: "مدير الصيانة", description: "Equipment maintenance, repairs and service logs.", descriptionAr: "صيانة المعدات والإصلاحات وسجلات الخدمة." },
  manager: { en: "Manager (legacy)", ar: "مدير (سابق)", description: "Legacy role — equivalent to Farm Manager.", descriptionAr: "دور سابق — يعادل مدير المزرعة.", legacy: true },
  worker: { en: "Worker (legacy)", ar: "عامل (سابق)", description: "Legacy role — equivalent to Farm Worker.", descriptionAr: "دور سابق — يعادل عامل مزرعة.", legacy: true },
};

/** The roles offered in pickers (invite/edit) — modern roles only, owner first. */
export const ASSIGNABLE_ROLES: RoleKey[] = (Object.keys(ROLE_META) as RoleKey[]).filter(
  (r) => !ROLE_META[r].legacy,
);

/** Human labels for each permission key, for the invite page and roles tab. */
export const PERMISSION_LABELS: Record<PermissionKey, { en: string; ar: string }> = {
  "animals.read": { en: "View animal records", ar: "عرض سجلات الحيوانات" },
  "animals.write": { en: "Add & edit animals", ar: "إضافة وتعديل الحيوانات" },
  "animals.delete": { en: "Delete animals", ar: "حذف الحيوانات" },
  "medical.read": { en: "View medical history", ar: "عرض السجل الطبي" },
  "medical.write": { en: "Record treatments", ar: "تسجيل العلاجات" },
  "vaccinations.read": { en: "View vaccinations", ar: "عرض التحصينات" },
  "vaccinations.write": { en: "Record vaccinations", ar: "تسجيل التحصينات" },
  "breeding.read": { en: "View breeding", ar: "عرض التكاثر" },
  "breeding.write": { en: "Record breeding & AI", ar: "تسجيل التكاثر والتلقيح" },
  "milk.read": { en: "View milk records", ar: "عرض سجلات الحليب" },
  "milk.write": { en: "Record milk", ar: "تسجيل الحليب" },
  "feeding.read": { en: "View feeding", ar: "عرض التغذية" },
  "feeding.write": { en: "Record feeding & water", ar: "تسجيل التغذية والسقي" },
  "inventory.read": { en: "View inventory", ar: "عرض المخزون" },
  "inventory.write": { en: "Manage inventory", ar: "إدارة المخزون" },
  "maintenance.read": { en: "View maintenance", ar: "عرض الصيانة" },
  "maintenance.write": { en: "Manage maintenance", ar: "إدارة الصيانة" },
  "tasks.read": { en: "View tasks", ar: "عرض المهام" },
  "tasks.write": { en: "Manage & complete tasks", ar: "إدارة وإنهاء المهام" },
  "expenses.read": { en: "View expenses", ar: "عرض المصروفات" },
  "expenses.write": { en: "Record expenses", ar: "تسجيل المصروفات" },
  "accounting.read": { en: "View accounting", ar: "عرض الحسابات" },
  "accounting.write": { en: "Manage accounting", ar: "إدارة الحسابات" },
  "payroll.read": { en: "View payroll", ar: "عرض الرواتب" },
  "employees.read": { en: "View employees", ar: "عرض الموظفين" },
  "employees.manage": { en: "Manage employees", ar: "إدارة الموظفين" },
  "reports.read": { en: "View reports", ar: "عرض التقارير" },
  "audit.read": { en: "View activity log", ar: "عرض سجل النشاط" },
  "org.settings": { en: "Organization settings", ar: "إعدادات المؤسسة" },
  "org.members": { en: "Invite & manage members", ar: "دعوة وإدارة الأعضاء" },
  "farms.manage": { en: "Create & manage farms", ar: "إنشاء وإدارة المزارع" },
};

/** Resolve a role to its permission keys. Unknown roles get nothing. */
export function permissionsForRole(role: string): readonly string[] {
  return ROLE_PERMISSIONS[role as RoleKey] ?? [];
}

/**
 * Expand a grant list (which may contain `*` or `module.*`) into the concrete
 * permission keys it covers — for showing a person exactly what they'll get.
 */
export function expandPermissions(perms: readonly string[]): PermissionKey[] {
  if (perms.includes("*")) return [...PERMISSIONS];
  const out = new Set<PermissionKey>();
  for (const p of perms) {
    if (p.endsWith(".*")) {
      const mod = p.slice(0, -2);
      for (const k of PERMISSIONS) if (k.startsWith(`${mod}.`)) out.add(k);
    } else if ((PERMISSIONS as readonly string[]).includes(p)) {
      out.add(p as PermissionKey);
    }
  }
  return [...out];
}

/**
 * Does this permission set grant `key`? Supports three grant forms:
 *  - `*`            — everything (owner)
 *  - `module.*`     — every action in a module
 *  - `module.action`— the exact key
 */
export function hasPermission(perms: readonly string[] | undefined, key: PermissionKey): boolean {
  if (!perms || perms.length === 0) return false;
  if (perms.includes("*")) return true;
  if (perms.includes(key)) return true;
  const mod = key.slice(0, key.indexOf("."));
  return perms.includes(`${mod}.*`);
}

/**
 * The effective permission set for a member: the explicit `permissions` array if
 * present, otherwise derived from the role. This is what makes legacy member docs
 * (role set, `permissions: []`) keep working while new docs are explicit.
 */
export function effectivePermissions(
  role: string | undefined,
  permissions: readonly string[] | undefined,
): readonly string[] {
  if (permissions && permissions.length > 0) return permissions;
  return permissionsForRole(role ?? "");
}
