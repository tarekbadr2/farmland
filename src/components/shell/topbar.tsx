"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, QrCode, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import { useFarm } from "@/hooks/use-farm-data";
import { useAuth } from "@/lib/auth/provider";
import { SidebarNav } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { SyncStatus } from "@/components/shell/sync-status";
import { InstallButton } from "@/components/shell/install-button";
import { ScanTagDialog } from "@/components/animals/scan-tag-dialog";
import { useFullApp } from "@/lib/work-mode";
import { WorkModeToggle } from "@/components/shell/work-mode-toggle";
import { PreferencesMenu } from "@/components/shell/preferences-menu";
import { FarmSwitcher } from "@/components/shell/farm-switcher";

export function Topbar() {
  const router = useRouter();
  const { t, ln, locale } = useI18n();
  const { user, signOut } = useAuth();
  const webView = !useFullApp();
  const { data: farm } = useFarm();
  const initials = (user?.name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const { online, pending } = useSyncStatus();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    // The desktop shell's Find / New menu accelerators open the palette too.
    const openPalette = () => setPaletteOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("herdos:command-palette", openPalette);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("herdos:command-palette", openPalette);
    };
  }, []);


  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/70 glass">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </Button>

          <WorkModeToggle />
          <FarmSwitcher />

          <button
            onClick={() => setPaletteOpen(true)}
            className="ms-auto hidden h-9 w-64 items-center gap-2 rounded-lg border border-input bg-card/70 px-3 text-[13px] text-muted-foreground shadow-xs transition hover:border-ring/40 hover:bg-card md:flex xl:w-80"
          >
            <Search className="size-4 shrink-0" />
            <span className="truncate">{t("app.search")}</span>
            <kbd className="ms-auto rounded border border-border px-1.5 py-px text-[10px]">
              ⌘K
            </kbd>
          </button>

          <div className="ms-auto flex items-center gap-0.5 md:ms-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setPaletteOpen(true)}
              aria-label={t("app.searchShort")}
            >
              <Search />
            </Button>

            {!webView && (
              <ScanTagDialog
                trigger={
                  <Button variant="ghost" size="icon" aria-label={t("animals.scanTag")}>
                    <QrCode />
                  </Button>
                }
              />
            )}

            <InstallButton />
            <SyncStatus className="hidden sm:flex" />
            <PreferencesMenu />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ms-1"
                  aria-label={locale === "ar" ? "قائمة الحساب" : "Account menu"}
                >
                  <Avatar className="size-7">
                    {user?.photoURL && <AvatarImage src={user.photoURL} alt="" />}
                    <AvatarFallback className="bg-primary/15 text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{user?.name ?? "—"}</DropdownMenuLabel>
                <div className="px-2 pb-1.5 text-[11px] capitalize text-muted-foreground">
                  {user?.role ?? "guest"}
                  {farm ? ` · ${ln(farm)}` : ""}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">{t("nav.settings")}</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
                    await signOut();
                    router.push("/");
                  }}
                >
                  {t("app.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <AnimatePresence>
          {!online && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden bg-[color-mix(in_oklab,var(--warning)_18%,transparent)]"
            >
              <p className="px-5 py-1.5 text-center text-[12px] font-medium">
                {t("app.offline")}
                {pending > 0 && (
                  <span className="opacity-80">
                    {" · "}
                    {locale === "ar"
                      ? `${pending} تسجيل بانتظار المزامنة`
                      : `${pending} ${pending === 1 ? "entry" : "entries"} waiting to sync`}
                  </span>
                )}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="start" className="p-0">
          <DialogTitle className="sr-only">{t("nav.overview")}</DialogTitle>
          <SidebarNav onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Dialog>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}

export function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return <Badge variant="destructive">{count}</Badge>;
}
