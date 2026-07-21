"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { cardIn } from "./page-header";

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: string;
  icon?: LucideIcon;
  delta?: number;
  /** For metrics where down is good (mortality, cost per litre). */
  invertDelta?: boolean;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
  spark?: number[];
  className?: string;
}

const toneRing: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-muted-foreground bg-muted",
  success: "text-[var(--success)] bg-[color-mix(in_oklab,var(--success)_14%,transparent)]",
  warning: "text-[var(--warning)] bg-[color-mix(in_oklab,var(--warning)_16%,transparent)]",
  destructive: "text-destructive bg-destructive/12",
  info: "text-[var(--info)] bg-[color-mix(in_oklab,var(--info)_14%,transparent)]",
};

function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 26 - ((p - min) / range) * 22;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      className="h-7 w-full"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={positive ? "var(--success)" : "var(--destructive)"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.85"
      />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  delta,
  invertDelta = false,
  tone = "default",
  spark,
  className,
}: StatCardProps) {
  const good = delta === undefined ? true : invertDelta ? delta <= 0 : delta >= 0;
  const DeltaIcon =
    delta === undefined || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <motion.div variants={cardIn}>
      <Card
        className={cn(
          "group h-full overflow-hidden p-4 transition-shadow hover:shadow-[0_2px_4px_rgba(0,0,0,0.05),0_14px_34px_-16px_rgba(0,0,0,0.18)]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] font-medium leading-tight text-muted-foreground">
            {label}
          </p>
          {Icon && (
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg",
                toneRing[tone],
              )}
            >
              <Icon className="size-[15px]" />
            </span>
          )}
        </div>

        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="tabular text-[26px] font-semibold leading-none tracking-tight">
            {value}
          </span>
          {unit && <span className="text-[12px] text-muted-foreground">{unit}</span>}
        </div>

        <div className="mt-2 flex items-center gap-2">
          {delta !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular",
                good
                  ? "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-[var(--success)]"
                  : "bg-destructive/12 text-destructive",
              )}
            >
              <DeltaIcon className="size-3" />
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {hint && (
            <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
          )}
        </div>

        {spark && spark.length > 1 && (
          <div className="-mx-1 mt-2">
            <Sparkline points={spark} positive={good} />
          </div>
        )}
      </Card>
    </motion.div>
  );
}
