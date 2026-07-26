"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Factory, Play, Sigma, Wallet } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import {
  useCompleteWorkOrder,
  useFeedItems,
  useInventory,
  useWorkOrders,
} from "@/hooks/use-farm-data";
import { WorkOrderDialog } from "@/components/production/work-order-dialog";
import { Can } from "@/lib/auth/guard";
import { checkWorkOrder, itemName, workOrderCost, type StockLookup } from "@/core/services/production";
import { formatDate } from "@/lib/date";
import { sum } from "@/lib/utils";
import type { WorkOrder } from "@/core/domain/types";

export default function ProductionPage() {
  const { locale, formatCurrency, formatNumber } = useI18n();
  const ar = locale === "ar";
  const { data: orders = [] } = useWorkOrders();
  const { data: inventory = [] } = useInventory();
  const { data: feed = [] } = useFeedItems();
  const complete = useCompleteWorkOrder();

  const stock: StockLookup = React.useMemo(() => ({ inventory, feed }), [inventory, feed]);

  const done = orders.filter((o) => o.status === "done");
  const planned = orders.filter((o) => o.status === "planned");
  // Completed runs carry their own snapshot; that's the honest historical cost.
  const producedValue = sum(done.map((o) => o.totalCost ?? 0));

  const run = async (order: WorkOrder) => {
    try {
      await complete.mutateAsync(order.id);
      toast.success(ar ? "تم تنفيذ أمر الشغل." : "Work order completed.");
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      toast.error(
        code === "insufficient-stock"
          ? ar ? "المخزون غير كافٍ لتنفيذ الأمر." : "Not enough stock to run this order."
          : code === "already-completed"
            ? ar ? "هذا الأمر منفَّذ بالفعل." : "That order has already been run."
            : ar ? "تعذّر التنفيذ." : "Couldn't run that order.",
      );
    }
  };

  return (
    <>
      <PageHeader
        title={ar ? "الإنتاج" : "Production"}
        subtitle={
          ar
            ? "أوامر الشغل: تحويل المدخلات إلى منتج، وحساب تكلفة الوحدة."
            : "Work orders — turn inputs into product and cost the result."
        }
        actions={
          <Can permission="maintenance.write">
          <WorkOrderDialog
            trigger={
              <Button size="sm">
                <Factory /> {ar ? "أمر شغل" : "New work order"}
              </Button>
            }
          />
          </Can>
        }
      />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="mb-4 grid gap-3 sm:grid-cols-3"
      >
        <motion.div variants={cardIn}>
          <StatCard
            label={ar ? "أوامر منفَّذة" : "Completed runs"}
            value={formatNumber(done.length)}
            icon={CheckCircle2}
            tone="success"
          />
        </motion.div>
        <motion.div variants={cardIn}>
          <StatCard
            label={ar ? "قيد التنفيذ" : "Planned"}
            value={formatNumber(planned.length)}
            icon={Factory}
          />
        </motion.div>
        <motion.div variants={cardIn}>
          <StatCard
            label={ar ? "تكلفة الإنتاج" : "Production cost"}
            value={formatCurrency(producedValue)}
            icon={Wallet}
          />
        </motion.div>
      </motion.div>

      <Card>
        <div className="px-5 pb-2 pt-4">
          <CardTitle>{ar ? "أوامر الشغل" : "Work orders"}</CardTitle>
          <CardDescription>
            {ar
              ? "تُخصم المدخلات وتُضاف المخرجات عند التنفيذ، وتنتقل التكلفة إلى المنتج."
              : "Running an order draws the inputs, adds the output, and carries the cost into it."}
          </CardDescription>
        </div>
        <CardContent className="space-y-2.5">
          {orders.length === 0 && (
            <p className="py-8 text-center text-[13px] text-muted-foreground">
              {ar ? "لا توجد أوامر شغل بعد." : "No work orders yet."}
            </p>
          )}

          {orders.map((o) => {
            // A planned order is costed live; a completed one shows what it did cost.
            const live = workOrderCost(o, stock);
            const totalCost = o.status === "done" ? (o.totalCost ?? live.totalCost) : live.totalCost;
            const unitCost =
              live.outputQuantity > 0 ? totalCost / live.outputQuantity : 0;
            const check = checkWorkOrder(o, stock);

            return (
              <div key={o.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{o.name}</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {o.number} · {formatDate(o.date, locale)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold tabular-nums">
                      {formatCurrency(totalCost)}
                    </span>
                    <Badge
                      variant={
                        o.status === "done"
                          ? "success"
                          : o.status === "cancelled"
                            ? "destructive"
                            : "warning"
                      }
                    >
                      {o.status === "done"
                        ? ar ? "منفَّذ" : "Done"
                        : o.status === "cancelled"
                          ? ar ? "ملغى" : "Cancelled"
                          : ar ? "مخطط" : "Planned"}
                    </Badge>
                    {o.status === "planned" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={complete.isPending || !check.ok}
                        onClick={() => run(o)}
                      >
                        <Play className="size-3.5" /> {ar ? "تنفيذ" : "Run"}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-2 grid gap-2 border-t border-border/60 pt-2 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {ar ? "المدخلات" : "Inputs"}
                    </p>
                    {o.inputs.map((l, i) => (
                      <div key={i} className="flex justify-between text-[12px]">
                        <span className="truncate">{itemName(l, stock, ar)}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatNumber(l.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {ar ? "المخرجات" : "Outputs"}
                    </p>
                    {o.outputs.map((l, i) => (
                      <div key={i} className="flex justify-between text-[12px]">
                        <span className="truncate">{itemName(l, stock, ar)}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatNumber(l.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 text-[12.5px]">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Sigma className="size-3.5" />
                    {ar ? "تكلفة الوحدة" : "Cost per unit"}
                  </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(unitCost)}</span>
                </div>

                {o.status === "planned" && !check.ok && check.shortages.length > 0 && (
                  <p className="mt-1.5 text-[11.5px] text-amber-600 dark:text-amber-500">
                    {ar ? "المخزون غير كافٍ:" : "Short of:"}{" "}
                    {check.shortages
                      .map((s) => `${itemName(s.line, stock, ar)} (${formatNumber(s.short)})`)
                      .join("، ")}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
