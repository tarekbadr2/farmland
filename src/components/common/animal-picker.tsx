"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAnimals } from "@/hooks/use-farm-data";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { Animal, ID } from "@/core/domain/types";

/**
 * Picks one animal from the herd.
 *
 * Searches tag, name and RFID together, because in a pen someone reads whatever
 * is legible on the animal — the ear tag if it's clean, the name if they know
 * her, the RFID if they're holding a scanner.
 */
export function AnimalPicker({
  value,
  onChange,
  filter,
  placeholder,
}: {
  value?: ID;
  onChange: (id: ID, animal: Animal) => void;
  /** Narrows the list, e.g. to females for a breeding event. */
  filter?: (animal: Animal) => boolean;
  placeholder?: string;
}) {
  const { t, ln } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const { data: page } = useAnimals({ pageSize: 100000 });
  const all = React.useMemo(() => page?.items ?? [], [page]);

  const selected = all.find((a) => a.id === value);

  const results = React.useMemo(() => {
    const pool = filter ? all.filter(filter) : all;
    const q = search.trim().toLowerCase();
    if (!q) return pool.slice(0, 50);
    return pool
      .filter((a) => `${a.tag} ${a.name} ${a.nameAr} ${a.rfid}`.toLowerCase().includes(q))
      .slice(0, 50);
  }, [all, filter, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="tabular font-medium">{selected.tag}</span>
              <span className="truncate text-muted-foreground">{ln(selected)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder ?? t("animals.title")}</span>
          )}
          <ChevronDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="relative border-b border-border p-2">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("animals.tag")}
            className="h-8 ps-8 text-[13px]"
          />
        </div>

        <div className="max-h-[260px] overflow-y-auto p-1">
          {results.map((animal) => (
            <button
              key={animal.id}
              type="button"
              onClick={() => {
                onChange(animal.id, animal);
                setOpen(false);
                setSearch("");
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-[13px] hover:bg-accent"
            >
              <Check
                className={cn(
                  "size-3.5 shrink-0",
                  animal.id === value ? "opacity-100 text-primary" : "opacity-0",
                )}
              />
              <span className="tabular w-20 shrink-0 font-medium">{animal.tag}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{ln(animal)}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {animal.penId}
              </span>
            </button>
          ))}
          {!results.length && (
            <p className="py-6 text-center text-[12px] text-muted-foreground">
              {t("common.noResults")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
