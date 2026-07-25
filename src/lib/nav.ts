import {
  BookOpen,
  Factory,
  LayoutDashboard,
  Beef,
  Baby,
  HeartPulse,
  Dna,
  Milk,
  Wheat,
  ListChecks,
  Package,
  Map as MapIcon,
  Wallet,
  Handshake,
  Building2,
  Users,
  FileBarChart,
  Sparkles,
  BarChart3,
  Bell,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { TKey } from "@/lib/i18n/provider";
import type { PermissionKey } from "@/core/auth/permissions";

export interface NavItem {
  href: string;
  labelKey: TKey;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar. */
  primary?: boolean;
  /** Permission required to see this item. Omit for items everyone can reach
   *  (dashboard, notifications, settings). */
  perm?: PermissionKey;
}

export interface NavGroup {
  labelKey: TKey;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    labelKey: "nav.overview",
    items: [
      { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, primary: true },
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell },
      { href: "/map", labelKey: "nav.map", icon: MapIcon, perm: "animals.read" },
    ],
  },
  {
    labelKey: "nav.herd",
    items: [
      { href: "/animals", labelKey: "nav.animals", icon: Beef, primary: true, perm: "animals.read" },
      { href: "/calves", labelKey: "nav.calves", icon: Baby, perm: "animals.read" },
      { href: "/breeding", labelKey: "nav.breeding", icon: Dna, perm: "breeding.read" },
      { href: "/health", labelKey: "nav.health", icon: HeartPulse, perm: "medical.read" },
    ],
  },
  {
    labelKey: "nav.production",
    items: [
      { href: "/milk", labelKey: "nav.milk", icon: Milk, primary: true, perm: "milk.read" },
      { href: "/feed", labelKey: "nav.feed", icon: Wheat, perm: "feeding.read" },
      { href: "/meat", labelKey: "nav.meat", icon: Beef, perm: "animals.read" },
      { href: "/production", labelKey: "nav.production2", icon: Factory, perm: "milk.read" },
    ],
  },
  {
    labelKey: "nav.operations",
    items: [
      { href: "/tasks", labelKey: "nav.tasks", icon: ListChecks, primary: true, perm: "tasks.read" },
      { href: "/inventory", labelKey: "nav.inventory", icon: Package, perm: "inventory.read" },
      { href: "/employees", labelKey: "nav.payroll", icon: Users, perm: "employees.read" },
    ],
  },
  {
    labelKey: "nav.business",
    items: [
      { href: "/finance", labelKey: "nav.finance", icon: Wallet, perm: "expenses.read" },
      { href: "/accounting", labelKey: "nav.accounting", icon: BookOpen, perm: "accounting.read" },
      { href: "/assets", labelKey: "nav.assets", icon: Building2, perm: "accounting.read" },
      { href: "/partners", labelKey: "nav.customers", icon: Handshake, perm: "accounting.read" },
      { href: "/reports", labelKey: "nav.reports", icon: FileBarChart, perm: "reports.read" },
    ],
  },
  {
    labelKey: "nav.intelligence",
    items: [
      { href: "/analytics", labelKey: "nav.analytics", icon: BarChart3, perm: "reports.read" },
      { href: "/activity", labelKey: "nav.activity", icon: ScrollText, perm: "audit.read" },
      { href: "/assistant", labelKey: "nav.assistant", icon: Sparkles },
      { href: "/settings", labelKey: "nav.settings", icon: Settings },
    ],
  },
];

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);
export const primaryNavItems: NavItem[] = allNavItems.filter((i) => i.primary);

/** The trimmed nav for the website (view-only): overview + subscription. The
 *  full operational nav is desktop-only. */
export const webNavGroups: NavGroup[] = [
  {
    labelKey: "nav.overview",
    items: [
      { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, primary: true },
      { href: "/settings", labelKey: "nav.settings", icon: Settings, primary: true },
    ],
  },
];

/** Whether a nav item is the active route. The animal profile lives at /animal
 *  (a query-param route) but belongs under the Animals item. */
export function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  if (href === "/animals" && pathname.startsWith("/animal")) return true;
  return false;
}
