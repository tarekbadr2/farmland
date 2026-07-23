"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Handshake, Milk, Plus, Star, Stethoscope, Truck, Users } from "lucide-react";

import { PageHeader, gridStagger, cardIn } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { DataTable, type Column } from "@/components/common/data-table";
import { NewInvoiceDialog } from "@/components/partners/new-invoice-dialog";
import { InvoicesCard } from "@/components/partners/invoices-card";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import { useInvoices, usePartners } from "@/hooks/use-farm-data";
import { formatDate } from "@/lib/date";
import { sum } from "@/lib/utils";
import type { Partner, PartnerKind } from "@/core/domain/types";

const KIND_META: Record<PartnerKind, { icon: typeof Milk; labelKey: "partners.milkBuyers" | "partners.animalBuyers" | "partners.suppliers" | "partners.vets" }> = {
  milk_buyer: { icon: Milk, labelKey: "partners.milkBuyers" },
  animal_buyer: { icon: Users, labelKey: "partners.animalBuyers" },
  supplier: { icon: Truck, labelKey: "partners.suppliers" },
  veterinarian: { icon: Stethoscope, labelKey: "partners.vets" },
};

export default function PartnersPage() {
  const { t, ln, locale, formatNumber, formatCurrency, formatCompact } = useI18n();
  const { data: partners = [], isLoading } = usePartners();
  const { data: invoices = [] } = useInvoices();

  const receivable = sum(partners.filter((p) => p.balance > 0).map((p) => p.balance));
  const payable = Math.abs(sum(partners.filter((p) => p.balance < 0).map((p) => p.balance)));
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;

  const columns: Column<Partner>[] = [
    {
      key: "name",
      header: t("common.name"),
      cell: (p) => (
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {React.createElement(KIND_META[p.kind].icon, { className: "size-4" })}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{ln(p)}</p>
            <p className="truncate text-[11px] text-muted-foreground">{p.contactName}</p>
          </div>
        </div>
      ),
    },
    {
      key: "kind",
      header: t("common.status"),
      cell: (p) => <Badge variant="secondary">{t(KIND_META[p.kind].labelKey)}</Badge>,
    },
    {
      key: "phone",
      header: t("employees.phone"),
      secondary: true,
      cell: (p) => <span className="tabular text-[12px] text-muted-foreground">{p.phone}</span>,
    },
    {
      key: "since",
      header: t("partners.since"),
      secondary: true,
      cell: (p) => (
        <span className="tabular text-[12px] text-muted-foreground">
          {formatDate(p.since, locale, { day: undefined })}
        </span>
      ),
    },
    {
      key: "rating",
      header: t("partners.rating"),
      cell: (p) => (
        <span className="flex items-center gap-1 text-[12.5px]">
          <Star className="size-3.5 fill-[var(--warning)] text-[var(--warning)]" />
          <span className="tabular">{formatNumber(p.rating)}</span>
        </span>
      ),
    },
    {
      key: "balance",
      header: t("partners.balance"),
      align: "end",
      cell: (p) => (
        <span
          className={
            p.balance > 0
              ? "tabular text-[12.5px] font-semibold text-[var(--success)]"
              : p.balance < 0
                ? "tabular text-[12.5px] font-semibold text-destructive"
                : "tabular text-[12.5px] text-muted-foreground"
          }
        >
          {formatCurrency(p.balance)}
        </span>
      ),
    },
  ];

  const groups: PartnerKind[] = ["milk_buyer", "animal_buyer", "supplier", "veterinarian"];

  return (
    <>
      <PageHeader
        title={t("partners.title")}
        subtitle={t("partners.subtitle")}
        actions={
          <>
            {/* Sales bill a customer; purchases record a supplier's bill.
                Returns undo either, and post the mirror entry. */}
            <NewInvoiceDialog
              kind="purchase"
              trigger={
                <Button variant="outline" size="sm">
                  <Plus /> {locale === "ar" ? "فاتورة مشتريات" : "Purchase bill"}
                </Button>
              }
            />
            <NewInvoiceDialog
              kind="sale_return"
              trigger={
                <Button variant="outline" size="sm">
                  {locale === "ar" ? "مرتجع مبيعات" : "Sales return"}
                </Button>
              }
            />
            <NewInvoiceDialog
              kind="purchase_return"
              trigger={
                <Button variant="outline" size="sm">
                  {locale === "ar" ? "مرتجع مشتريات" : "Purchase return"}
                </Button>
              }
            />
            <NewInvoiceDialog />
          </>
        }
      />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <StatCard label={t("partners.title")} value={formatNumber(partners.length)} icon={Handshake} tone="info" />
        <StatCard label={t("partners.receivable")} value={formatCompact(receivable)} icon={Milk} tone="success" />
        <StatCard label={t("partners.payable")} value={formatCompact(payable)} icon={Truck} tone="warning" />
        <StatCard
          label={t("finance.overdue")}
          value={formatNumber(overdueCount)}
          icon={Star}
          tone={overdueCount ? "destructive" : "success"}
        />
      </motion.div>

      <motion.div variants={cardIn} initial="hidden" animate="show" className="mt-4">
        <Card>
          <div className="px-5 pb-2 pt-4">
            <CardTitle>{t("partners.title")}</CardTitle>
            <CardDescription>
              {formatNumber(partners.length)} {t("common.results")}
            </CardDescription>
          </div>
          <CardContent className="px-0 pb-0">
            <Tabs defaultValue="all">
              <div className="px-5">
                <TabsList className="mb-2 flex w-full overflow-x-auto sm:w-auto">
                  <TabsTrigger value="all">{t("common.all")}</TabsTrigger>
                  {groups.map((g) => (
                    <TabsTrigger key={g} value={g}>
                      {t(KIND_META[g].labelKey)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {["all", ...groups].map((key) => (
                <TabsContent key={key} value={key}>
                  <DataTable
                    columns={columns}
                    rows={key === "all" ? partners : partners.filter((p) => p.kind === key)}
                    loading={isLoading}
                    mobileCard={(p) => (
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          {React.createElement(KIND_META[p.kind].icon, { className: "size-4" })}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium">{ln(p)}</p>
                          <p className="truncate text-[12px] text-muted-foreground">{p.phone}</p>
                        </div>
                        <span
                          className={
                            p.balance >= 0
                              ? "tabular shrink-0 text-[12.5px] font-semibold text-[var(--success)]"
                              : "tabular shrink-0 text-[12.5px] font-semibold text-destructive"
                          }
                        >
                          {formatCompact(p.balance)}
                        </span>
                      </div>
                    )}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={cardIn} initial="hidden" animate="show" className="mt-4">
        <InvoicesCard />
      </motion.div>
    </>
  );
}
