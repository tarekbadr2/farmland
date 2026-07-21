"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import { useZones } from "@/hooks/use-farm-data";
import { getRepository } from "@/core/repositories";
import { TODAY } from "@/core/data/seed";
import type { FarmTask, TaskCategory, TaskPriority } from "@/core/domain/types";

const CATEGORIES: TaskCategory[] = [
  "milking",
  "feeding",
  "health",
  "breeding",
  "cleaning",
  "maintenance",
  "admin",
];

// Priority and recurrence have no shared dictionary namespace, so their labels
// are inline bilingual pairs rather than fragile cross-section key lookups.
const PRIORITIES: { value: TaskPriority; en: string; ar: string }[] = [
  { value: "low", en: "Low", ar: "منخفضة" },
  { value: "medium", en: "Medium", ar: "متوسطة" },
  { value: "high", en: "High", ar: "عالية" },
  { value: "critical", en: "Critical", ar: "حرجة" },
];
const RECURRENCE: { value: "none" | "daily" | "weekly" | "monthly"; en: string; ar: string }[] = [
  { value: "none", en: "One-off", ar: "مرة واحدة" },
  { value: "daily", en: "Daily", ar: "يومي" },
  { value: "weekly", en: "Weekly", ar: "أسبوعي" },
  { value: "monthly", en: "Monthly", ar: "شهري" },
];

const schema = z.object({
  title: z.string().min(1, "Required"),
  category: z.string().min(1, "Pick a category"),
  priority: z.enum(["low", "medium", "high", "critical"]),
  dueAt: z.string().min(10),
  assigneeId: z.string().optional(),
  zoneId: z.string().optional(),
  recurrence: z.enum(["none", "daily", "weekly", "monthly"]),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Creates a task.
 *
 * A new task always starts `todo` — status is a thing the board moves, never a
 * thing you set at creation. Assignee is optional so a supervisor can pool a
 * job before deciding who takes it, but priority and a due date are required,
 * because a task with neither is one nobody will ever be held to.
 */
export function NewTaskDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { t, ln, locale } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const { data: zones = [] } = useZones();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      category: "",
      priority: "medium",
      dueAt: TODAY,
      recurrence: "none",
    },
  });

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const task: Omit<FarmTask, "id" | "farmId"> = {
        title: values.title.trim(),
        titleAr: values.title.trim(), // one field; Arabic title mirrors it here
        category: values.category as TaskCategory,
        priority: values.priority,
        status: "todo",
        dueAt: values.dueAt,
        assigneeId: values.assigneeId || undefined,
        zoneId: values.zoneId || undefined,
        recurrence: values.recurrence,
        notes: values.notes,
      };
      return getRepository().saveTask(task);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(locale === "ar" ? "تم إنشاء المهمة" : "Task created");
      form.reset({ title: "", category: "", priority: "medium", dueAt: TODAY, recurrence: "none" });
      setOpen(false);
    },
    onError: (error) =>
      toast.error(
        error.message ||
          (locale === "ar" ? "تعذر الحفظ. حاول مرة أخرى." : "Couldn't save. Try again."),
      ),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> {t("tasks.newTask")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("tasks.newTask")}</DialogTitle>
          <DialogDescription>{t("tasks.newTaskHint")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="title">{t("tasks.title_")}</Label>
            <Input id="title" autoFocus {...form.register("title")} />
            {form.formState.errors.title && (
              <p className="text-[11px] text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("tasks.category")}</Label>
              <Select
                value={form.watch("category")}
                onValueChange={(v) => form.setValue("category", v, { shouldValidate: true })}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder={t("common.select")} />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`taskCategory.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.category && (
                <p className="text-[11px] text-destructive">
                  {form.formState.errors.category.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("tasks.priority")}</Label>
              <Select
                value={form.watch("priority")}
                onValueChange={(v) => form.setValue("priority", v as TaskPriority)}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {locale === "ar" ? p.ar : p.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dueAt">{t("tasks.due")}</Label>
              <Input id="dueAt" type="date" {...form.register("dueAt")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignee">{t("tasks.assignee")}</Label>
              <Input
                id="assignee"
                placeholder={t("tasks.unassigned")}
                {...form.register("assigneeId")}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("tasks.recurring")}</Label>
              <Select
                value={form.watch("recurrence")}
                onValueChange={(v) => form.setValue("recurrence", v as FormValues["recurrence"])}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {locale === "ar" ? r.ar : r.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("tasks.linkZone")}</Label>
              <Select
                value={form.watch("zoneId") ?? ""}
                onValueChange={(v) => form.setValue("zoneId", v)}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder={t("common.optional")} />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {ln(z)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tnotes">{t("common.notes")}</Label>
            <Textarea id="tnotes" rows={2} {...form.register("notes")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
