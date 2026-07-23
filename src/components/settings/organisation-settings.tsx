"use client";

import * as React from "react";
import { Building2, Coins, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import {
  useBranches,
  useCurrencies,
  useSaveBranch,
  useSaveCurrency,
} from "@/hooks/use-farm-data";
import { isValidRate } from "@/core/services/org";
import { formatDate } from "@/lib/date";

/**
 * الفروع والعملات — sites the farm operates, and the money it deals in.
 *
 * Both are additive: a single-site farm in one currency never has to touch this
 * screen, and everything keeps working exactly as before.
 */
export function OrganisationSettings() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const { data: branches = [] } = useBranches();
  const { data: currencies = [] } = useCurrencies();
  const saveBranch = useSaveBranch();
  const saveCurrency = useSaveCurrency();

  const [branchName, setBranchName] = React.useState("");
  const [branchNameAr, setBranchNameAr] = React.useState("");

  // Rates are edited in place; held as strings so a half-typed value doesn't
  // momentarily save as 0.
  const [rates, setRates] = React.useState<Record<string, string>>({});
  const [newCode, setNewCode] = React.useState("");
  const [newRate, setNewRate] = React.useState("");

  const addBranch = async () => {
    if (!branchName.trim()) return;
    try {
      await saveBranch.mutateAsync({
        name: branchName.trim(),
        nameAr: branchNameAr.trim() || branchName.trim(),
        active: true,
      });
      toast.success(ar ? "تمت إضافة الفرع." : "Branch added.");
      setBranchName("");
      setBranchNameAr("");
    } catch {
      toast.error(ar ? "تعذّر الحفظ." : "Couldn't save that.");
    }
  };

  const commitRate = async (id: string, code: string, value: string) => {
    const rate = Number(value);
    if (!isValidRate(rate)) {
      toast.error(ar ? "سعر الصرف يجب أن يكون أكبر من صفر." : "The rate must be greater than zero.");
      return;
    }
    const existing = currencies.find((c) => c.id === id)!;
    try {
      await saveCurrency.mutateAsync({ ...existing, rateToBase: rate });
      toast.success(ar ? `تم تحديث سعر ${code}.` : `${code} rate updated.`);
    } catch {
      toast.error(ar ? "تعذّر التحديث." : "Couldn't update that.");
    }
  };

  const addCurrency = async () => {
    const code = newCode.trim().toUpperCase();
    const rate = Number(newRate);
    if (code.length < 3 || !isValidRate(rate)) return;
    try {
      await saveCurrency.mutateAsync({
        code,
        name: code,
        nameAr: code,
        rateToBase: rate,
        active: true,
      });
      toast.success(ar ? "تمت إضافة العملة." : "Currency added.");
      setNewCode("");
      setNewRate("");
    } catch {
      toast.error(ar ? "تعذّر الحفظ." : "Couldn't save that.");
    }
  };

  const base = currencies.find((c) => c.isBase);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* --------------------------------- Branches -------------------------------- */}
      <Card>
        <div className="px-5 pb-2 pt-4">
          <CardTitle className="flex items-center gap-1.5">
            <Building2 className="size-4" /> {ar ? "الفروع" : "Branches"}
          </CardTitle>
          <CardDescription>
            {ar ? "المواقع التي تعمل بها المزرعة." : "The sites the farm operates."}
          </CardDescription>
        </div>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            {branches.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[13px]"
              >
                <span className="truncate">{ar ? b.nameAr : b.name}</span>
                {b.isDefault && (
                  <Badge variant="outline">{ar ? "افتراضي" : "Default"}</Badge>
                )}
              </div>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>{ar ? "اسم الفرع" : "Branch name"}</Label>
              <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} />
            </div>
            <div>
              <Label>{ar ? "الاسم بالعربية" : "Arabic name"}</Label>
              <Input value={branchNameAr} onChange={(e) => setBranchNameAr(e.target.value)} dir="rtl" />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={addBranch}
            disabled={saveBranch.isPending || !branchName.trim()}
          >
            {saveBranch.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            {ar ? "إضافة فرع" : "Add branch"}
          </Button>
        </CardContent>
      </Card>

      {/* -------------------------------- Currencies ------------------------------- */}
      <Card>
        <div className="px-5 pb-2 pt-4">
          <CardTitle className="flex items-center gap-1.5">
            <Coins className="size-4" /> {ar ? "العملات" : "Currencies"}
          </CardTitle>
          <CardDescription>
            {base
              ? ar
                ? `الأسعار مقابل ${base.code} — العملة الأساسية دائمًا 1.`
                : `Rates against ${base.code} — the base currency is always 1.`
              : ""}
          </CardDescription>
        </div>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            {currencies.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px]"
              >
                <span className="w-12 font-medium tabular-nums">{c.code}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {ar ? c.nameAr : c.name}
                </span>
                {c.isBase ? (
                  <Badge variant="outline">{ar ? "أساسية" : "Base"}</Badge>
                ) : (
                  <Input
                    type="number"
                    step="0.0001"
                    min={0}
                    className="h-8 w-28 text-end text-[12.5px] tabular-nums"
                    value={rates[c.id] ?? String(c.rateToBase)}
                    onChange={(e) => setRates((r) => ({ ...r, [c.id]: e.target.value }))}
                    onBlur={(e) => {
                      if (Number(e.target.value) !== c.rateToBase) {
                        commitRate(c.id, c.code, e.target.value);
                      }
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {currencies.some((c) => c.updatedAt) && (
            <p className="text-[11px] text-muted-foreground">
              {ar ? "آخر تحديث:" : "Last updated:"}{" "}
              {formatDate(
                currencies
                  .map((c) => c.updatedAt)
                  .filter(Boolean)
                  .sort()
                  .at(-1)!,
                locale,
              )}
            </p>
          )}

          <div className="grid grid-cols-[5rem_1fr_auto] items-end gap-2">
            <div>
              <Label>{ar ? "الرمز" : "Code"}</Label>
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="USD"
                maxLength={3}
              />
            </div>
            <div>
              <Label>{ar ? `السعر مقابل ${base?.code ?? ""}` : `Rate to ${base?.code ?? "base"}`}</Label>
              <Input
                type="number"
                step="0.0001"
                min={0}
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addCurrency}
              disabled={saveCurrency.isPending || newCode.trim().length < 3 || !isValidRate(Number(newRate))}
            >
              <Plus /> {ar ? "إضافة" : "Add"}
            </Button>
          </div>

          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            {ar
              ? `تُقيَّد كل المبالغ في الدفاتر بـ${base?.code ?? ""}؛ تُحفظ العملة الأصلية وسعرها على المستند للمراجعة.`
              : `The books are always kept in ${base?.code ?? "the base currency"}; a document's original currency and rate are stored on it for audit.`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
