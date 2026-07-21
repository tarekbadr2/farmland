"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { ArrowRight, Beef, Search, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/provider";
import { allNavItems } from "@/lib/nav";
import { useAnimals } from "@/hooks/use-farm-data";
import { Badge } from "@/components/ui/badge";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const { t, ln, locale } = useI18n();
  const [query, setQuery] = React.useState("");

  // Only hit the herd index once the operator has typed something specific.
  const { data: animalPage } = useAnimals(
    query.length >= 2 ? { search: query, pageSize: 6 } : { pageSize: 0 },
  );

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        className="top-[15%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">{t("app.search")}</DialogTitle>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
          dir={locale === "ar" ? "rtl" : "ltr"}
        >
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={t("app.search")}
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted-foreground">
              {t("common.noResults")}
            </Command.Empty>

            {(animalPage?.items.length ?? 0) > 0 && (
              <Command.Group heading={t("nav.animals")}>
                {animalPage!.items.map((a) => (
                  <Command.Item
                    key={a.id}
                    value={a.id}
                    onSelect={() => go(`/animals/${a.id}`)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] data-[selected=true]:bg-accent"
                  >
                    <Beef className="size-4 text-muted-foreground" />
                    <span className="font-medium tabular">{a.tag}</span>
                    <span className="text-muted-foreground">{ln(a)}</span>
                    <Badge variant="outline" className="ms-auto">
                      {t(`status.${a.milkStatus}`)}
                    </Badge>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading={t("nav.overview")}>
              {allNavItems
                .filter((i) =>
                  query ? t(i.labelKey).toLowerCase().includes(query.toLowerCase()) : true,
                )
                .map((item) => (
                  <Command.Item
                    key={item.href}
                    value={item.href}
                    onSelect={() => go(item.href)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] data-[selected=true]:bg-accent"
                  >
                    <item.icon className="size-4 text-muted-foreground" />
                    {t(item.labelKey)}
                    <ArrowRight className="ms-auto size-3.5 text-muted-foreground/60 rtl:-scale-x-100" />
                  </Command.Item>
                ))}
            </Command.Group>

            {query.length >= 2 && (
              <Command.Group heading={t("nav.assistant")}>
                <Command.Item
                  value="__ask_ai"
                  onSelect={() => go(`/assistant?q=${encodeURIComponent(query)}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] data-[selected=true]:bg-accent"
                >
                  <Sparkles className="size-4 text-primary" />
                  <span className="truncate">
                    {t("assistant.ask")} — “{query}”
                  </span>
                </Command.Item>
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
