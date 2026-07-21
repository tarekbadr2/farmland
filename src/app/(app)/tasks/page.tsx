"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  ListChecks,
  RotateCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/menu";
import { PriorityPill } from "@/components/common/status-pill";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { useI18n } from "@/lib/i18n/provider";
import { useTasks, useUpdateTask, useZones } from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import { formatDate } from "@/lib/date";
import { taskMetrics } from "@/core/services/metrics";
import { cn } from "@/lib/utils";
import type { FarmTask, TaskStatus } from "@/core/domain/types";

const LANES: { status: TaskStatus; labelKey: "tasks.todo" | "tasks.inProgress" | "tasks.done" | "tasks.missed"; icon: typeof Circle }[] = [
  { status: "todo", labelKey: "tasks.todo", icon: Circle },
  { status: "in_progress", labelKey: "tasks.inProgress", icon: Clock },
  { status: "done", labelKey: "tasks.done", icon: CheckCircle2 },
  { status: "missed", labelKey: "tasks.missed", icon: XCircle },
];

export default function TasksPage() {
  const { t, ln, locale, formatNumber } = useI18n();
  const { data: tasks = [] } = useTasks();
  const { data: zones = [] } = useZones();
  const updateTask = useUpdateTask();

  const [category, setCategory] = React.useState("all");

  const m = React.useMemo(() => taskMetrics(tasks, TODAY), [tasks]);

  const filtered = React.useMemo(
    () => tasks.filter((task) => category === "all" || task.category === category),
    [tasks, category],
  );

  // Assignee is a free-text name on the task itself now that HR is gone.
  const assigneeName = (name?: string) => name || t("common.unassigned");
  const zoneName = (id?: string) => {
    const z = zones.find((x) => x.id === id);
    return z ? ln(z) : "";
  };

  const toggle = (task: FarmTask) => {
    const next: TaskStatus = task.status === "done" ? "todo" : "done";
    updateTask.mutate(
      { id: task.id, patch: { status: next, completedAt: next === "done" ? `${TODAY}T12:00:00` : undefined } },
      {
        onSuccess: () =>
          toast.success(
            next === "done"
              ? locale === "ar"
                ? "تم إنجاز المهمة"
                : "Task completed"
              : locale === "ar"
                ? "أُعيدت المهمة"
                : "Task reopened",
          ),
      },
    );
  };

  return (
    <>
      <PageHeader
        title={t("tasks.title")}
        subtitle={t("tasks.subtitle")}
        actions={<NewTaskDialog />}
      />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <StatCard label={t("dashboard.todaysTasks")} value={formatNumber(m.todayCount)} icon={ListChecks} tone="info" />
        <StatCard
          label={t("tasks.completion")}
          value={formatNumber(m.completionRate)}
          unit="%"
          icon={CheckCircle2}
          tone={m.completionRate >= 80 ? "success" : "warning"}
        />
        <StatCard
          label={t("tasks.overdue")}
          value={formatNumber(m.overdue.length)}
          icon={CalendarClock}
          tone={m.overdue.length ? "destructive" : "success"}
        />
        <StatCard label={t("tasks.missed")} value={formatNumber(m.missed)} icon={XCircle} tone="warning" />
      </motion.div>

      <motion.div variants={cardIn} initial="hidden" animate="show" className="mt-4">
        <Card>
          <div className="flex flex-col gap-3 border-b border-border/70 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">
                {t("tasks.completion")} — {t("common.today")}
              </p>
              <Progress value={m.completionRate} className="mt-2" />
            </div>
            <div className="flex gap-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger size="sm" className="w-[150px]">
                  <SelectValue placeholder={t("tasks.category")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("tasks.category")} — {t("common.all")}</SelectItem>
                  {["milking", "feeding", "health", "breeding", "cleaning", "maintenance", "admin"].map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`taskCategory.${c}` as never)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <CardContent className="p-3">
            <div className="grid gap-3 lg:grid-cols-4">
              {LANES.map((lane) => {
                const laneTasks = filtered.filter((task) => task.status === lane.status);
                return (
                  <div key={lane.status} className="min-w-0">
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <lane.icon
                        className={cn(
                          "size-3.5",
                          lane.status === "done"
                            ? "text-[var(--success)]"
                            : lane.status === "missed"
                              ? "text-destructive"
                              : "text-muted-foreground",
                        )}
                      />
                      <p className="text-[12px] font-semibold">{t(lane.labelKey)}</p>
                      <Badge variant="secondary" className="ms-auto tabular">
                        {formatNumber(laneTasks.length)}
                      </Badge>
                    </div>

                    <div className="space-y-2 rounded-xl bg-muted/40 p-2">
                      <AnimatePresence initial={false}>
                        {laneTasks.slice(0, 18).map((task) => (
                          <motion.div
                            key={task.id}
                            layout
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            transition={{ duration: 0.18 }}
                          >
                            <button
                              onClick={() => toggle(task)}
                              className="w-full rounded-lg border border-border/70 bg-card p-2.5 text-start transition hover:border-ring/40 hover:shadow-sm active:scale-[0.99]"
                            >
                              <div className="flex items-start gap-2">
                                <span
                                  className={cn(
                                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                                    task.status === "done"
                                      ? "border-[var(--success)] bg-[var(--success)] text-white"
                                      : "border-border",
                                  )}
                                >
                                  {task.status === "done" && (
                                    <CheckCircle2 className="size-3" strokeWidth={3} />
                                  )}
                                </span>
                                <p
                                  className={cn(
                                    "min-w-0 flex-1 text-[12.5px] font-medium leading-snug",
                                    task.status === "done" && "text-muted-foreground line-through",
                                  )}
                                >
                                  {locale === "ar" ? task.titleAr : task.title}
                                </p>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <PriorityPill value={task.priority} />
                                <Badge variant="outline">
                                  {t(`taskCategory.${task.category}` as never)}
                                </Badge>
                                {task.recurrence === "daily" && (
                                  <Badge variant="outline">
                                    <RotateCw /> {t("tasks.recurring")}
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-2 truncate text-[11px] text-muted-foreground">
                                {assigneeName(task.assigneeId)}
                                {zoneName(task.zoneId) ? ` · ${zoneName(task.zoneId)}` : ""} ·{" "}
                                {formatDate(task.dueAt.slice(0, 10), locale, { year: undefined })}{" "}
                                {task.dueAt.slice(11, 16)}
                              </p>
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {!laneTasks.length && (
                        <p className="py-8 text-center text-[11px] text-muted-foreground">
                          {t("common.none")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Card className="mt-4">
        <div className="px-5 pb-2 pt-4">
          <CardTitle>{t("tasks.overdue")}</CardTitle>
          <CardDescription>{formatNumber(m.overdue.length)} {t("common.results")}</CardDescription>
        </div>
        <CardContent className="space-y-1.5">
          {m.overdue.slice(0, 8).map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/[0.04] px-3 py-2"
            >
              <XCircle className="size-4 shrink-0 text-destructive" />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">
                {locale === "ar" ? task.titleAr : task.title}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {assigneeName(task.assigneeId)}
              </span>
              <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                {formatDate(task.dueAt.slice(0, 10), locale, { year: undefined })}
              </span>
            </div>
          ))}
          {!m.overdue.length && (
            <p className="py-8 text-center text-[12px] text-muted-foreground">
              {t("notifications.empty")}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
