import {
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
  FileBarChart,
  Sparkles,
  BarChart3,
  Bell,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { TKey } from "@/lib/i18n/provider";

export interface NavItem {
  href: string;
  labelKey: TKey;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar. */
  primary?: boolean;
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
      { href: "/map", labelKey: "nav.map", icon: MapIcon },
    ],
  },
  {
    labelKey: "nav.herd",
    items: [
      { href: "/animals", labelKey: "nav.animals", icon: Beef, primary: true },
      { href: "/calves", labelKey: "nav.calves", icon: Baby },
      { href: "/breeding", labelKey: "nav.breeding", icon: Dna },
      { href: "/health", labelKey: "nav.health", icon: HeartPulse },
    ],
  },
  {
    labelKey: "nav.production",
    items: [
      { href: "/milk", labelKey: "nav.milk", icon: Milk, primary: true },
      { href: "/feed", labelKey: "nav.feed", icon: Wheat },
    ],
  },
  {
    labelKey: "nav.operations",
    items: [
      { href: "/tasks", labelKey: "nav.tasks", icon: ListChecks, primary: true },
      { href: "/inventory", labelKey: "nav.inventory", icon: Package },
    ],
  },
  {
    labelKey: "nav.business",
    items: [
      { href: "/finance", labelKey: "nav.finance", icon: Wallet },
      { href: "/partners", labelKey: "nav.customers", icon: Handshake },
      { href: "/reports", labelKey: "nav.reports", icon: FileBarChart },
    ],
  },
  {
    labelKey: "nav.intelligence",
    items: [
      { href: "/analytics", labelKey: "nav.analytics", icon: BarChart3 },
      { href: "/assistant", labelKey: "nav.assistant", icon: Sparkles },
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell },
      { href: "/settings", labelKey: "nav.settings", icon: Settings },
    ],
  },
];

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);
export const primaryNavItems: NavItem[] = allNavItems.filter((i) => i.primary);

/** Whether a nav item is the active route. The animal profile lives at /animal
 *  (a query-param route) but belongs under the Animals item. */
export function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  if (href === "/animals" && pathname.startsWith("/animal")) return true;
  return false;
}
