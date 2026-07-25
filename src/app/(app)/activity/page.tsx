"use client";

import * as React from "react";
import {
  Activity,
  Baby,
  Beef,
  Coins,
  HeartPulse,
  Milk,
  Package,
  ListChecks,
  ShieldCheck,
  UserCog,
  Wheat,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/primitives";
import { useActivity } from "@/hooks/use-farm-data";
import { useI18n } from "@/lib/i18n/provider";
import { formatDate } from "@/lib/date";
import type { AuditCategory } from "@/core/domain/types";
import { cn } from "@/lib/utils";

const META: Record<AuditCategory, { icon: LucideIcon; en: string; ar: string; tone: string }> = {
  animals: { icon: Beef, en: "Animals", ar: "الحيوانات", tone: "text-sky-600" },
  medical: { icon: HeartPulse, en: "Health", ar: "الصحة", tone: "text-rose-600" },
  breeding: { icon: Baby, en: "Breeding", ar: "التكاثر", tone: "text-fuchsia-600" },
  milk: { icon: Milk, en: "Milk", ar: "الحليب", tone: "text-indigo-600" },
  feeding: { icon: Wheat, en: "Feed", ar: "الأعلاف", tone: "text-amber-600" },
  inventory: { icon: Package, en: "Inventory", ar: "المخزون", tone: "text-orange-600" },
  tasks: { icon: ListChecks, en: "Tasks", ar: "المهام", tone: "text-emerald-600" },
  finance: { icon: Coins, en: "Finance", ar: "المالية", tone: "text-teal-600" },
  employees: { icon: UserCog, en: "Employees", ar: "الموظفون", tone: "text-violet-600" },
  members: { icon: ShieldCheck, en: "Access", ar: "الصلاحيات", tone: "text-red-600" },
  system: { icon: Activity, en: "System", ar: "النظام", tone: "text-muted-foreground" },
};

const CATEGORIES = Object.keys(META) as AuditCategory[];

function relTime(iso: string, ar: boolean): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return ar ? "الآن" : "just now";
  if (mins < 60) return ar ? `منذ ${mins} د` : `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return ar ? `منذ ${hrs} س` : `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return ar ? `منذ ${days} ي` : `${days}d ago`;
  return "";
}

export default function ActivityPage() {
  const { t, locale } = useI18n();
  const ar = locale === "ar";
  const { data: entries = [], isLoading } = useActivity(300);
  const [cat, setCat] = React.useState<AuditCategory | "all">("all");

  const filtered = cat === "all" ? entries : entries.filter((e) => e.category === cat);

  return (
    <>
      <PageHeader
        title={t("nav.activity")}
        subtitle={
          ar
            ? "كل إجراء مهم على المزرعة — من قام به، ومتى."
            : "Every significant action on the farm — who did it, and when."
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        <Chip active={cat === "all"} onClick={() => setCat("all")}>
          {ar ? "الكل" : "All"}
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
            {ar ? META[c].ar : META[c].en}
          </Chip>
        ))}
      </div>

      <Card className="divide-y divide-border/70">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-center text-[13px] text-muted-foreground">
            {ar ? "لا يوجد نشاط بعد." : "No activity yet."}
          </p>
        ) : (
          filtered.map((e) => {
            const m = META[e.category] ?? META.system;
            return (
              <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted", m.tone)}>
                  <m.icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px]">
                    {ar && e.summaryAr ? e.summaryAr : e.summary}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {e.actorName}
                    <span className="opacity-60"> · {e.actorRole.replace(/_/g, " ")}</span>
                  </p>
                </div>
                <div className="shrink-0 text-end text-[11px] text-muted-foreground">
                  <div>{relTime(e.at, ar) || formatDate(e.at.slice(0, 10), locale)}</div>
                  <div className="tabular opacity-70">{e.at.slice(11, 16)}</div>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[12px] font-medium transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-ring/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
