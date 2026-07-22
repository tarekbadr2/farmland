"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { primaryNavItems, webNavGroups, isNavActive } from "@/lib/nav";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { IS_DESKTOP } from "@/lib/platform";
import { cn } from "@/lib/utils";

/** Thumb-reachable bar. Five destinations max — anything more is a menu. */
export function MobileTabBar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { bypassed } = useAuth();
  const items =
    !IS_DESKTOP && !bypassed
      ? webNavGroups.flatMap((g) => g.items)
      : [
          ...primaryNavItems,
          { href: "/assistant", labelKey: "nav.assistant" as const, icon: Sparkles },
        ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 glass pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="flex">
        {items.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-active"
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <item.icon className="size-[19px]" />
                <span className="truncate">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
