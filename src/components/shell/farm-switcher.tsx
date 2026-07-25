"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc } from "firebase/firestore";
import { Building2, Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { useAuth } from "@/lib/auth/provider";
import { useI18n } from "@/lib/i18n/provider";
import { getFirebase } from "@/infrastructure/firebase/client";
import { cn } from "@/lib/utils";

/**
 * Farm switcher — shown only when the signed-in member belongs to more than one
 * farm. Picking a farm re-resolves the member's role/permissions for it and
 * clears the farm-scoped query cache so every screen reloads against the new
 * tenant.
 */
export function FarmSwitcher() {
  const { user, switchFarm, bypassed } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = React.useState(false);

  const farmIds = user?.farmIds ?? [];

  // Names for the farms this user can access (each is readable — they're a
  // member). Cheap: a handful of docs, cached.
  const { data: farms = [] } = useQuery({
    queryKey: ["myFarms", farmIds],
    enabled: !bypassed && farmIds.length > 1,
    queryFn: async () => {
      const { db } = getFirebase();
      const docs = await Promise.all(
        farmIds.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, "farms", id));
            const d = snap.data();
            return { id, name: (locale === "ar" ? d?.nameAr : d?.name) ?? id };
          } catch {
            return { id, name: id };
          }
        }),
      );
      return docs;
    },
  });

  if (bypassed || farmIds.length <= 1) return null;

  const active = user?.activeFarmId;
  const activeName = farms.find((f) => f.id === active)?.name ?? active ?? "";

  const choose = async (id: string) => {
    if (id === active) return;
    setSwitching(true);
    try {
      await switchFarm(id);
      await queryClient.invalidateQueries();
    } finally {
      setSwitching(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-[190px] gap-1.5" disabled={switching}>
          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{activeName}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{locale === "ar" ? "المزارع" : "Farms"}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {farms.map((f) => (
          <DropdownMenuItem key={f.id} onSelect={() => choose(f.id)} className="gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <span className="truncate">{f.name}</span>
            {f.id === active && <Check className={cn("ms-auto size-4 text-primary")} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
