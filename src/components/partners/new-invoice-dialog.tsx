"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
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
import { Label } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/provider";
import { usePartners } from "@/hooks/use-farm-data";
import { getRepository } from "@/core/repositories";
import { TODAY } from "@/core/data/seed";
import { addDays } from "@/lib/date";
import { round } from "@/lib/utils";
import { invoiceSeries } from "@/core/services/posting";
import type { Invoice, InvoiceKind } from "@/core/domain/types";

const schema = z.object({
  customerId: z.string().min(1, "Pick a customer"),
  number: z.string().min(1, "Required"),
  issuedAt: z.string().min(10),
  dueAt: z.string().min(10),
  lines: z
    .array(
      z.object({
        description: z.string().min(1, "Required"),
        qty: z.coerce.number().positive(),
        unitPrice: z.coerce.number().min(0),
      }),
    )
    .min(1, "Add at least one line"),
});

type FormValues = z.infer<typeof schema>;

/**
 * Drafts an invoice with one or more line items.
 *
 * A number is suggested but editable, dated so two invoices in the same session
 * can't collide. Every invoice starts `draft` and unpaid — a bill is a claim,
 * not a payment, and marking it paid is a separate act on the finance side once
 * the money actually arrives. The total is derived from the lines, never typed.
 */
export function NewInvoiceDialog({
  trigger,
  kind = "sale",
}: {
  trigger?: React.ReactNode;
  /** Sale bills a customer; purchase records a supplier's bill. Returns undo
   *  their counterpart. */
  kind?: InvoiceKind;
}) {
  const { t, ln, locale, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const { data: partners = [] } = usePartners();

  // A sale is billed to a buyer; a purchase comes from a supplier.
  const buyingSide = kind === "purchase" || kind === "purchase_return";
  const customers = partners.filter((p) =>
    buyingSide ? p.kind === "supplier" : p.kind === "milk_buyer" || p.kind === "animal_buyer",
  );

  const suggestedNumber = `${invoiceSeries(kind)}-${TODAY.replace(/-/g, "").slice(2)}-${String(
    Math.floor(Number(TODAY.replace(/-/g, "").slice(-4))),
  ).slice(-3)}`;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: "",
      number: suggestedNumber,
      issuedAt: TODAY,
      dueAt: addDays(TODAY, 30),
      lines: [{ description: "", qty: 1, unitPrice: 0 }],
    },
  });

  const ar = locale === "ar";
  const heading =
    kind === "purchase"
      ? ar ? "فاتورة مشتريات" : "Purchase bill"
      : kind === "sale_return"
        ? ar ? "مرتجع مبيعات" : "Sales return"
        : kind === "purchase_return"
          ? ar ? "مرتجع مشتريات" : "Purchase return"
          : t("partners.newInvoice");

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const lines = form.watch("lines");
  const total = round(
    (lines ?? []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0),
    2,
  );

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const invoice: Omit<Invoice, "id" | "farmId"> = {
        kind,
        number: values.number.trim(),
        customerId: values.customerId,
        issuedAt: values.issuedAt,
        dueAt: values.dueAt,
        lines: values.lines.map((l) => ({
          description: l.description.trim(),
          qty: l.qty,
          unitPrice: l.unitPrice,
        })),
        paidAmount: 0,
        status: "draft",
      };
      return getRepository().saveInvoice(invoice);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(locale === "ar" ? "تم إنشاء الفاتورة" : "Invoice created");
      form.reset();
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
            <Plus /> {heading}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>{t("partners.newInvoiceHint")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-customer">{buyingSide ? (ar ? "المورّد" : "Supplier") : t("partners.customer")}</Label>
              <Select
                value={form.watch("customerId")}
                onValueChange={(v) => form.setValue("customerId", v, { shouldValidate: true })}
              >
                <SelectTrigger id="invoice-customer" size="sm">
                  <SelectValue placeholder={t("common.select")} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {ln(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.customerId && (
                <p className="text-[11px] text-destructive">
                  {form.formState.errors.customerId.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invno">{t("partners.invoiceNumber")}</Label>
              <Input id="invno" dir="ltr" {...form.register("number")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="issued">{t("partners.issued")}</Label>
              <Input id="issued" type="date" {...form.register("issuedAt")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due">{t("partners.dueDate")}</Label>
              <Input id="due" type="date" {...form.register("dueAt")} />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className="flex-1">{t("partners.lineItem")}</span>
              <span className="w-14 text-center">{t("partners.qty")}</span>
              <span className="w-24 text-end">{t("partners.unitPrice")}</span>
              <span className="w-6" />
            </div>
            {fields.map((field, i) => (
              <div key={field.id} className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    placeholder={t("partners.lineItem")}
                    {...form.register(`lines.${i}.description`)}
                  />
                </div>
                <Input
                  className="w-14 text-center"
                  type="number"
                  step="any"
                  {...form.register(`lines.${i}.qty`)}
                />
                <Input
                  className="tabular w-24 text-end"
                  type="number"
                  step="0.01"
                  {...form.register(`lines.${i}.unitPrice`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={fields.length === 1}
                  onClick={() => remove(i)}
                  aria-label={locale === "ar" ? "حذف السطر" : "Remove line"}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ description: "", qty: 1, unitPrice: 0 })}
            >
              <Plus /> {t("partners.addLine")}
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <span className="text-[13px] font-medium">{t("partners.total")}</span>
            <span className="tabular text-[15px] font-semibold">EGP {formatNumber(total)}</span>
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
