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
import { usePartners } from "@/hooks/use-farm-data";
import { getRepository } from "@/core/repositories";
import { TODAY } from "@/core/data/seed";
import { cn } from "@/lib/utils";
import type { Transaction, TxnCategory } from "@/core/domain/types";

const INCOME: TxnCategory[] = ["milk_sales", "animal_sales", "manure_sales", "other_income"];
const EXPENSE: TxnCategory[] = [
  "feed",
  "medicine",
  "labor",
  "fuel",
  "utilities",
  "maintenance",
  "veterinary",
  "transport",
  "rent",
  "other_expense",
];

const schema = z.object({
  kind: z.enum(["income", "expense"]),
  category: z.string().min(1, "Pick a category"),
  amount: z.coerce.number().positive("Enter an amount"),
  date: z.string().min(10),
  counterpartyId: z.string().optional(),
  paymentMethod: z.enum(["cash", "bank", "credit"]),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Records one income or expense line.
 *
 * Kind picks the category list, so an expense can never be filed under "milk
 * sales" — the two are mutually exclusive on a dairy's books and the form makes
 * that structural rather than a thing to remember. Amount is always entered
 * positive; the ledger derives sign from kind.
 */
export function RecordTransactionDialog({
  trigger,
  defaultKind = "expense",
}: {
  trigger?: React.ReactNode;
  defaultKind?: FormValues["kind"];
}) {
  const { t, ln, locale } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const { data: partners = [] } = usePartners();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: defaultKind,
      category: "",
      amount: 0,
      date: TODAY,
      paymentMethod: "cash",
    },
  });

  const kind = form.watch("kind");
  const categories = kind === "income" ? INCOME : EXPENSE;

  // Partners relevant to the kind: buyers for income, suppliers/vets for spend.
  const counterparties = partners.filter((p) =>
    kind === "income"
      ? p.kind === "milk_buyer" || p.kind === "animal_buyer"
      : p.kind === "supplier" || p.kind === "veterinarian",
  );

  const setKind = (next: FormValues["kind"]) => {
    form.setValue("kind", next);
    // The old category belongs to the old list; clear it so nothing invalid
    // survives the switch.
    form.setValue("category", "");
    form.setValue("counterpartyId", undefined);
  };

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const txn: Omit<Transaction, "id" | "farmId"> = {
        kind: values.kind,
        category: values.category as TxnCategory,
        amount: values.amount,
        date: values.date,
        counterpartyId: values.counterpartyId,
        paymentMethod: values.paymentMethod,
        description: values.description ?? "",
      };
      return getRepository().saveTransaction(txn);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(locale === "ar" ? "تم تسجيل الحركة المالية" : "Transaction recorded");
      form.reset({ kind: defaultKind, category: "", amount: 0, date: TODAY, paymentMethod: "cash" });
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
            <Plus /> {t("finance.recordTxn")}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("finance.recordTxn")}</DialogTitle>
          <DialogDescription>{t("finance.recordTxnHint")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-1.5">
            {(["income", "expense"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "h-9 rounded-lg border text-[12.5px] font-medium transition",
                  kind === k
                    ? k === "income"
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-input text-muted-foreground hover:bg-accent",
                )}
              >
                {t(`finance.${k}`)}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="txn-category">{t("finance.category")}</Label>
            <Select
              value={form.watch("category")}
              onValueChange={(v) => form.setValue("category", v, { shouldValidate: true })}
            >
              <SelectTrigger id="txn-category" size="sm">
                <SelectValue placeholder={t("common.select")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`txn.${c}`)}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">{t("finance.amount")}</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                inputMode="decimal"
                {...form.register("amount")}
              />
              {form.formState.errors.amount && (
                <p className="text-[11px] text-destructive">
                  {form.formState.errors.amount.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tdate">{t("common.date")}</Label>
              <Input id="tdate" type="date" {...form.register("date")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="txn-counterparty">{t("finance.counterparty")}</Label>
              <Select
                value={form.watch("counterpartyId") ?? ""}
                onValueChange={(v) => form.setValue("counterpartyId", v)}
              >
                <SelectTrigger id="txn-counterparty" size="sm">
                  <SelectValue placeholder={t("common.optional")} />
                </SelectTrigger>
                <SelectContent>
                  {counterparties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {ln(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="txn-payment-method">{t("finance.paymentMethod")}</Label>
              <Select
                value={form.watch("paymentMethod")}
                onValueChange={(v) => form.setValue("paymentMethod", v as FormValues["paymentMethod"])}
              >
                <SelectTrigger id="txn-payment-method" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["cash", "bank", "credit"] as const).map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`finance.method.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">{t("common.notes")}</Label>
            <Textarea id="desc" rows={2} {...form.register("description")} />
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
