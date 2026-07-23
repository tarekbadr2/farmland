"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CalendarCheck, Plus, Users, Wallet } from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import { useEmployees, useAttendance } from "@/hooks/use-farm-data";
import { labourMetrics } from "@/core/services/metrics";
import { EmployeeFormDialog, EMPLOYEE_ROLES } from "@/components/employees/employee-form-dialog";
import { RecordCostDialog } from "@/components/common/record-cost-dialog";
import { TODAY } from "@/core/data/seed";

export default function EmployeesPage() {
  const { locale, formatCurrency, formatNumber } = useI18n();
  const ar = locale === "ar";
  const { data: employees = [] } = useEmployees();
  const { data: attendance = [] } = useAttendance();

  const m = React.useMemo(() => labourMetrics(employees, attendance, TODAY), [employees, attendance]);
  const roleLabel = (r: string) => {
    const e = EMPLOYEE_ROLES.find((x) => x.value === r);
    return e ? (ar ? e.ar : e.en) : r;
  };

  const sorted = [...employees].sort((a, b) => Number(b.active) - Number(a.active) || b.monthlySalary - a.monthlySalary);

  return (
    <>
      <PageHeader
        title={ar ? "الرواتب والموظفون" : "Payroll & staff"}
        subtitle={ar ? "الفريق، الرواتب الشهرية، والحضور." : "Your team, monthly payroll and attendance."}
        actions={
          <>
            {/* One click books the whole month's wage bill to expenses. */}
            <RecordCostDialog
              category="labor"
              title={ar ? "صرف رواتب الشهر" : "Run monthly payroll"}
              defaultAmount={m.payroll}
              defaultDescription={ar ? "رواتب الشهر" : "Monthly payroll"}
              trigger={
                <Button variant="outline" size="sm">
                  <Wallet /> {ar ? "صرف الرواتب" : "Run payroll"}
                </Button>
              }
            />
            <EmployeeFormDialog
            trigger={
              <Button size="sm">
                <Plus /> {ar ? "موظف جديد" : "New employee"}
              </Button>
            }
            />
          </>
        }
      />

      <motion.div variants={gridStagger} initial="hidden" animate="show" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={ar ? "عدد الموظفين" : "Headcount"} value={formatNumber(m.headcount)} icon={Users} />
        <StatCard label={ar ? "الرواتب الشهرية" : "Monthly payroll"} value={formatCurrency(m.payroll)} icon={Wallet} tone="info" />
        <StatCard label={ar ? "نسبة الحضور (30 يوم)" : "Attendance (30d)"} value={`${formatNumber(m.attendanceRate)}%`} icon={CalendarCheck} tone={m.attendanceRate >= 90 ? "success" : "warning"} />
        <StatCard label={ar ? "في الوردية اليوم" : "On shift today"} value={formatNumber(m.onShiftToday)} icon={Users} tone="success" />
      </motion.div>

      <motion.div variants={gridStagger} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((e) => (
          <motion.div key={e.id} variants={cardIn}>
            <EmployeeFormDialog
              employee={e}
              trigger={
                <Card className="h-full cursor-pointer p-4 transition hover:border-ring/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">{ar ? e.nameAr || e.name : e.name}</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {roleLabel(e.role)} · {e.phone || "—"}
                      </p>
                    </div>
                    {!e.active && <Badge variant="outline">{ar ? "غير نشط" : "Inactive"}</Badge>}
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-[11px] text-muted-foreground">{ar ? "الراتب الشهري" : "Monthly salary"}</p>
                      <p className="text-[15px] font-semibold">{formatCurrency(e.monthlySalary)}</p>
                    </div>
                    <Badge variant="secondary" className="capitalize">
                      {e.shift}
                    </Badge>
                  </div>
                </Card>
              }
            />
          </motion.div>
        ))}
      </motion.div>

      {employees.length === 0 && (
        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          {ar ? "لا يوجد موظفون بعد." : "No employees yet — add your first."}
        </p>
      )}
    </>
  );
}
