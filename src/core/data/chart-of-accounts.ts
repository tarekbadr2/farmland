/**
 * Default chart of accounts (شجرة الحسابات) for a new farm.
 *
 * Follows the layout an Egyptian accountant expects — assets, liabilities,
 * equity, revenue, expenses — with hierarchical codes, so parentage is derived
 * from the code itself (10201's parent is 102). Contra accounts (accumulated
 * depreciation, drawings) carry an explicit nature that opposes their type.
 *
 * `systemKey` marks the accounts the app posts to automatically; they're
 * protected from deletion so auto-posting can always resolve them.
 */

import type { Account, AccountNature, AccountType, ID } from "@/core/domain/types";
import { normalBalance } from "@/core/services/accounting";

interface Spec {
  code: string;
  en: string;
  ar: string;
  type: AccountType;
  group?: boolean;
  /** Overrides the type's normal side — used by contra accounts. */
  nature?: AccountNature;
  systemKey?: string;
}

const SPECS: Spec[] = [
  /* --------------------------------- Assets -------------------------------- */
  { code: "1", en: "Assets", ar: "الأصول", type: "asset", group: true },
  { code: "11", en: "Current assets", ar: "الأصول المتداولة", type: "asset", group: true },
  { code: "1101", en: "Cash on hand", ar: "الخزينة", type: "asset", systemKey: "cash" },
  { code: "1102", en: "Bank accounts", ar: "البنوك", type: "asset", systemKey: "bank" },
  { code: "1103", en: "Customers (receivable)", ar: "العملاء", type: "asset", systemKey: "receivable" },
  { code: "1104", en: "Notes receivable", ar: "أوراق القبض", type: "asset", systemKey: "notes_receivable" },
  { code: "1105", en: "Inventory", ar: "المخزون", type: "asset", group: true },
  { code: "110501", en: "Feed inventory", ar: "مخزون الأعلاف", type: "asset", systemKey: "inventory_feed" },
  { code: "110502", en: "Veterinary supplies", ar: "مخزون الأدوية", type: "asset", systemKey: "inventory_vet" },
  { code: "110503", en: "Other inventory", ar: "مخزون آخر", type: "asset" },
  { code: "1106", en: "Prepaid expenses", ar: "مصروفات مدفوعة مقدماً", type: "asset" },

  { code: "12", en: "Fixed assets", ar: "الأصول الثابتة", type: "asset", group: true },
  { code: "1201", en: "Land", ar: "الأراضي", type: "asset", systemKey: "asset_land" },
  { code: "1202", en: "Buildings & barns", ar: "المباني والحظائر", type: "asset", systemKey: "asset_building" },
  { code: "1203", en: "Machinery & equipment", ar: "الآلات والمعدات", type: "asset", systemKey: "asset_machine" },
  { code: "1204", en: "Vehicles", ar: "السيارات", type: "asset", systemKey: "asset_vehicle" },
  { code: "1205", en: "Livestock", ar: "الثروة الحيوانية", type: "asset", systemKey: "asset_livestock" },
  // Contra-asset: sits on the credit side even though it's an asset account.
  { code: "1206", en: "Accumulated depreciation", ar: "مجمع الإهلاك", type: "asset", nature: "credit", systemKey: "accum_depreciation" },

  /* ------------------------------ Liabilities ------------------------------ */
  { code: "2", en: "Liabilities", ar: "الخصوم", type: "liability", group: true },
  { code: "21", en: "Current liabilities", ar: "الخصوم المتداولة", type: "liability", group: true },
  { code: "2101", en: "Suppliers (payable)", ar: "الموردون", type: "liability", systemKey: "payable" },
  { code: "2102", en: "Notes payable", ar: "أوراق الدفع", type: "liability", systemKey: "notes_payable" },
  { code: "2103", en: "Accrued expenses", ar: "مصروفات مستحقة", type: "liability" },
  { code: "2104", en: "Salaries payable", ar: "رواتب مستحقة", type: "liability", systemKey: "salaries_payable" },
  { code: "22", en: "Long-term liabilities", ar: "الخصوم طويلة الأجل", type: "liability", group: true },
  { code: "2201", en: "Loans", ar: "القروض", type: "liability" },

  /* --------------------------------- Equity -------------------------------- */
  { code: "3", en: "Equity", ar: "حقوق الملكية", type: "equity", group: true },
  { code: "3101", en: "Capital", ar: "رأس المال", type: "equity", systemKey: "capital" },
  { code: "3102", en: "Retained earnings", ar: "الأرباح المرحّلة", type: "equity", systemKey: "retained_earnings" },
  // Contra-equity: withdrawals reduce owner's equity.
  { code: "3103", en: "Owner drawings", ar: "المسحوبات الشخصية", type: "equity", nature: "debit" },

  /* -------------------------------- Revenue -------------------------------- */
  { code: "4", en: "Revenue", ar: "الإيرادات", type: "revenue", group: true },
  { code: "4101", en: "Milk sales", ar: "مبيعات الألبان", type: "revenue", systemKey: "revenue_milk" },
  { code: "4102", en: "Livestock sales", ar: "مبيعات الحيوانات", type: "revenue", systemKey: "revenue_livestock" },
  { code: "4103", en: "Meat sales", ar: "مبيعات اللحوم", type: "revenue", systemKey: "revenue_meat" },
  { code: "4104", en: "Manure sales", ar: "مبيعات السماد", type: "revenue", systemKey: "revenue_manure" },
  { code: "4105", en: "Other income", ar: "إيرادات أخرى", type: "revenue", systemKey: "revenue_other" },

  /* -------------------------------- Expenses ------------------------------- */
  { code: "5", en: "Expenses", ar: "المصروفات", type: "expense", group: true },
  { code: "5101", en: "Feed", ar: "الأعلاف", type: "expense", systemKey: "expense_feed" },
  { code: "5102", en: "Medicine & veterinary", ar: "الأدوية والعلاج البيطري", type: "expense", systemKey: "expense_medicine" },
  { code: "5103", en: "Wages & salaries", ar: "الأجور والرواتب", type: "expense", systemKey: "expense_labor" },
  { code: "5104", en: "Utilities (water & power)", ar: "المياه والكهرباء", type: "expense", systemKey: "expense_utilities" },
  { code: "5105", en: "Fuel", ar: "الوقود", type: "expense", systemKey: "expense_fuel" },
  { code: "5106", en: "Maintenance", ar: "الصيانة", type: "expense", systemKey: "expense_maintenance" },
  { code: "5107", en: "Transport", ar: "النقل", type: "expense", systemKey: "expense_transport" },
  { code: "5108", en: "Rent", ar: "الإيجار", type: "expense", systemKey: "expense_rent" },
  { code: "5109", en: "Depreciation", ar: "الإهلاك", type: "expense", systemKey: "expense_depreciation" },
  { code: "5110", en: "Other expenses", ar: "مصروفات أخرى", type: "expense", systemKey: "expense_other" },
];

/** The parent is the account whose code is the longest proper prefix of ours. */
function findParentCode(code: string, codes: string[]): string | null {
  let best: string | null = null;
  for (const c of codes) {
    if (c !== code && code.startsWith(c) && (!best || c.length > best.length)) best = c;
  }
  return best;
}

/** Build the starting account tree for a farm. */
export function defaultChartOfAccounts(farmId: ID, now = new Date().toISOString()): Account[] {
  const codes = SPECS.map((s) => s.code);
  const idFor = (code: string) => `acc_${code}`;

  return SPECS.map((s) => {
    const parentCode = findParentCode(s.code, codes);
    return {
      id: idFor(s.code),
      farmId,
      code: s.code,
      parentId: parentCode ? idFor(parentCode) : null,
      name: s.en,
      nameAr: s.ar,
      type: s.type,
      nature: s.nature ?? normalBalance(s.type),
      isGroup: s.group ?? false,
      active: true,
      systemKey: s.systemKey,
      createdAt: now,
    } satisfies Account;
  });
}

/** Look up a seeded account by its stable system key (for auto-posting). */
export function findBySystemKey(accounts: Account[], key: string): Account | undefined {
  return accounts.find((a) => a.systemKey === key);
}
