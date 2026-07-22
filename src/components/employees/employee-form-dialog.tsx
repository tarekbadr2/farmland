"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label, Switch } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/menu";
import { getRepository } from "@/core/repositories";
import { useI18n } from "@/lib/i18n/provider";
import { qk } from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import type { Employee, EmployeeRole } from "@/core/domain/types";

export const EMPLOYEE_ROLES: { value: EmployeeRole; en: string; ar: string }[] = [
  { value: "milker", en: "Milker", ar: "حلّاب" },
  { value: "feeder", en: "Feeder", ar: "مسؤول تغذية" },
  { value: "vet_assistant", en: "Vet assistant", ar: "مساعد بيطري" },
  { value: "supervisor", en: "Supervisor", ar: "مشرف" },
  { value: "driver", en: "Driver", ar: "سائق" },
  { value: "cleaner", en: "Cleaner", ar: "عامل نظافة" },
  { value: "accountant", en: "Accountant", ar: "محاسب" },
  { value: "manager", en: "Manager", ar: "مدير" },
];

const SHIFTS: { value: Employee["shift"]; en: string; ar: string }[] = [
  { value: "morning", en: "Morning", ar: "صباحي" },
  { value: "evening", en: "Evening", ar: "مسائي" },
  { value: "night", en: "Night", ar: "ليلي" },
  { value: "rotating", en: "Rotating", ar: "متناوب" },
];

/** Add or edit an employee (payroll record). */
export function EmployeeFormDialog({ employee, trigger }: { employee?: Employee; trigger: React.ReactNode }) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const queryClient = useQueryClient();
  const editing = Boolean(employee);

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(employee?.name ?? "");
  const [nameAr, setNameAr] = React.useState(employee?.nameAr ?? "");
  const [role, setRole] = React.useState<EmployeeRole>(employee?.role ?? "milker");
  const [shift, setShift] = React.useState<Employee["shift"]>(employee?.shift ?? "morning");
  const [phone, setPhone] = React.useState(employee?.phone ?? "");
  const [salary, setSalary] = React.useState(String(employee?.monthlySalary ?? ""));
  const [hiredAt, setHiredAt] = React.useState(employee?.hiredAt ?? TODAY);
  const [active, setActive] = React.useState(employee?.active ?? true);

  const save = useMutation({
    mutationFn: () =>
      getRepository().saveEmployee({
        id: employee?.id,
        code: employee?.code ?? `EMP-${String(Date.now()).slice(-5)}`,
        name: name.trim(),
        nameAr: nameAr.trim() || name.trim(),
        role,
        shift,
        phone: phone.trim(),
        nationalId: employee?.nationalId ?? "",
        hiredAt,
        monthlySalary: Number(salary) || 0,
        active,
        performanceScore: employee?.performanceScore ?? 80,
        trainings: employee?.trainings ?? [],
        safetyIncidents: employee?.safetyIncidents ?? 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.employees });
      setOpen(false);
      toast.success(editing ? (ar ? "تم التحديث" : "Saved") : (ar ? "تمت الإضافة" : "Employee added"));
    },
    onError: () => toast.error(ar ? "تعذّر الحفظ." : "Couldn't save."),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg" showClose={!save.isPending}>
        <DialogHeader>
          <DialogTitle>{editing ? (ar ? "تعديل موظف" : "Edit employee") : (ar ? "موظف جديد" : "New employee")}</DialogTitle>
          <DialogDescription>{ar ? "بيانات الموظف والراتب الشهري." : "Employee details and monthly salary."}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save.mutate();
          }}
          className="space-y-4"
          dir={ar ? "rtl" : "ltr"}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "الاسم" : "Name"}</Label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "الاسم بالعربية" : "Arabic name"}</Label>
              <Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "الوظيفة" : "Role"}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as EmployeeRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{ar ? r.ar : r.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "الوردية" : "Shift"}</Label>
              <Select value={shift} onValueChange={(v) => setShift(v as Employee["shift"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIFTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{ar ? s.ar : s.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "الراتب الشهري (ج.م)" : "Monthly salary (EGP)"}</Label>
              <Input type="number" inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "الهاتف" : "Phone"}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{ar ? "تاريخ التعيين" : "Hired"}</Label>
              <Input type="date" value={hiredAt} onChange={(e) => setHiredAt(e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
              <Label className="text-[12.5px]">{ar ? "نشط" : "Active"}</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={save.isPending || !name.trim()}>
              {save.isPending ? <Loader2 className="animate-spin" /> : null}
              {ar ? "حفظ" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
