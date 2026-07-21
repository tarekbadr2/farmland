"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/provider";
import type {
  AlertSeverity,
  AnimalStatus,
  MilkStatus,
  ReproStatus,
  TaskPriority,
  TaskStatus,
} from "@/core/domain/types";
import { cn } from "@/lib/utils";

type Variant = React.ComponentProps<typeof Badge>["variant"];

const milkVariant: Record<MilkStatus, Variant> = {
  lactating: "success",
  dry: "warning",
  heifer: "info",
  not_applicable: "outline",
};

const reproVariant: Record<ReproStatus, Variant> = {
  pregnant: "default",
  inseminated: "info",
  open: "outline",
  fresh: "success",
  not_applicable: "outline",
};

const statusVariant: Record<AnimalStatus, Variant> = {
  active: "success",
  quarantine: "destructive",
  sold: "secondary",
  dead: "outline",
  culled: "outline",
};

const taskStatusVariant: Record<TaskStatus, Variant> = {
  todo: "outline",
  in_progress: "info",
  done: "success",
  missed: "destructive",
};

const priorityVariant: Record<TaskPriority, Variant> = {
  low: "outline",
  medium: "secondary",
  high: "warning",
  critical: "destructive",
};

const severityVariant: Record<AlertSeverity, Variant> = {
  info: "info",
  warning: "warning",
  critical: "destructive",
};

export function MilkStatusPill({ value }: { value: MilkStatus }) {
  const { t } = useI18n();
  if (value === "not_applicable") return <span className="text-muted-foreground">—</span>;
  return <Badge variant={milkVariant[value]}>{t(`status.${value}`)}</Badge>;
}

export function ReproStatusPill({ value }: { value: ReproStatus }) {
  const { t } = useI18n();
  if (value === "not_applicable") return <span className="text-muted-foreground">—</span>;
  return <Badge variant={reproVariant[value]}>{t(`status.${value}`)}</Badge>;
}

export function AnimalStatusPill({ value }: { value: AnimalStatus }) {
  const { t } = useI18n();
  return <Badge variant={statusVariant[value]}>{t(`status.${value}`)}</Badge>;
}

export function TaskStatusPill({ value }: { value: TaskStatus }) {
  const { t } = useI18n();
  return <Badge variant={taskStatusVariant[value]}>{t(`status.${value}`)}</Badge>;
}

export function PriorityPill({ value }: { value: TaskPriority }) {
  const { t } = useI18n();
  return <Badge variant={priorityVariant[value]}>{t(`status.${value}`)}</Badge>;
}

export function SeverityPill({ value }: { value: AlertSeverity }) {
  const { t } = useI18n();
  return <Badge variant={severityVariant[value]}>{t(`status.${value === "info" ? "none" : value === "warning" ? "medium" : "critical"}`)}</Badge>;
}

/** Health score as a compact bar — colour carries the message, number confirms it. */
export function HealthScore({ value }: { value: number }) {
  const tone =
    value >= 80 ? "var(--success)" : value >= 60 ? "var(--warning)" : "var(--destructive)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${value}%`, background: tone }}
        />
      </div>
      <span className={cn("tabular text-[12px] font-medium")} style={{ color: tone }}>
        {value}
      </span>
    </div>
  );
}
