"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronsLeft, Sparkles } from "lucide-react";
import { navGroups, isNavActive } from "@/lib/nav";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { useAlerts, useFarm } from "@/hooks/use-farm-data";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/primitives";

export function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t, ln, locale } = useI18n();
  const { bypassed } = useAuth();
  const { data: alerts } = useAlerts();
  const unread = alerts?.filter((a) => !a.read).length ?? 0;
  const { data: farm } = useFarm();

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex items-center gap-2.5 px-3 py-4",
          collapsed && "justify-center px-0",
        )}
      >
        <Logo />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">
              {farm ? ln(farm) : t("app.name")}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {t("app.tagline")}
            </p>
          </div>
        )}
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-2 pb-4">
        {navGroups.map((group) => (
          <div key={group.labelKey} className="mb-4">
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                {t(group.labelKey)}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isNavActive(pathname, item.href);
                const badge = item.href === "/notifications" && unread ? unread : null;

                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    data-tour={`nav:${item.href}`}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                      collapsed && "justify-center px-0",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        className="absolute inset-0 -z-10 rounded-lg bg-accent"
                      />
                    )}
                    <item.icon
                      className={cn(
                        "size-[17px] shrink-0 transition-colors",
                        active ? "text-primary" : "text-muted-foreground/80",
                      )}
                    />
                    {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                    {!collapsed && badge ? (
                      <Badge variant="destructive" className="ms-auto tabular">
                        {badge}
                      </Badge>
                    ) : null}
                  </Link>
                );

                return (
                  <li key={item.href}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side={locale === "ar" ? "left" : "right"}>
                          {t(item.labelKey)}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Only while running on demo data — a live farm doesn't need a
          permanent banner taking up sidebar space. */}
      {!collapsed && bypassed && (
        <div className="mx-3 mb-3 rounded-xl border border-primary/20 bg-primary/[0.06] p-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <Sparkles className="size-4 text-primary" />
            {t("app.demoData")}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t("app.demoDataHint")}
          </p>
        </div>
      )}
    </div>
  );
}

export function DesktopSidebar() {
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    const stored = window.localStorage.getItem("herdos.sidebar");
    if (stored === "collapsed") setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      window.localStorage.setItem("herdos.sidebar", c ? "expanded" : "collapsed");
      return !c;
    });
  };

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 border-e border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block",
        collapsed ? "w-[68px]" : "w-[248px]",
      )}
    >
      <div className="relative h-full">
        <SidebarNav collapsed={collapsed} />
        <Button
          variant="outline"
          size="icon-sm"
          onClick={toggle}
          aria-label="Toggle sidebar"
          className="absolute -end-3.5 top-6 size-7 rounded-full shadow-sm"
        >
          <ChevronsLeft
            className={cn(
              "size-3.5 transition-transform",
              collapsed && "rotate-180",
              "rtl:-scale-x-100",
            )}
          />
        </Button>
      </div>
    </aside>
  );
}
