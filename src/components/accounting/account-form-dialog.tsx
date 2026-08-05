"use client";

import * as React from "react";
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
import { useI18n } from "@/lib/i18n/provider";
import { useAccounts, useSaveAccount } from "@/hooks/use-farm-data";
import { normalBalance, nextChildCode } from "@/core/services/accounting";
import type { Account, AccountNature, AccountType } from "@/core/domain/types";

export const ACCOUNT_TYPES: { value: AccountType; en: string; ar: string }[] = [
  { value: "asset", en: "Asset", ar: "أصول" },
  { value: "liability", en: "Liability", ar: "خصوم" },
  { value: "equity", en: "Equity", ar: "حقوق ملكية" },
  { value: "revenue", en: "Revenue", ar: "إيرادات" },
  { value: "expense", en: "Expense", ar: "مصروفات" },
];

/**
 * Add or edit an account. When a parent is given the code is proposed
 * automatically from its siblings, which is how accountants expect a coded tree
 * to behave.
 */
export function AccountFormDialog({
  trigger,
  account,
  parent,
}: {
  trigger: React.ReactNode;
  account?: Account;
  parent?: Account;
}) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [open, setOpen] = React.useState(false);
  const { data: accounts = [] } = useAccounts();
  const save = useSaveAccount();
  const editing = Boolean(account);

  const suggestedCode = React.useMemo(() => {
    if (account) return account.code;
    if (!parent) return "";
    return nextChildCode(
      parent.code,
      accounts.filter((a) => a.parentId === parent.id).map((a) => a.code),
    );
  }, [account, parent, accounts]);

  const [code, setCode] = React.useState(suggestedCode);
  const [name, setName] = React.useState(account?.name ?? "");
  const [nameAr, setNameAr] = React.useState(account?.nameAr ?? "");
  const [type, setType] = React.useState<AccountType>(account?.type ?? parent?.type ?? "asset");
  const [nature, setNature] = React.useState<AccountNature>(
    account?.nature ?? normalBalance(parent?.type ?? "asset"),
  );
  const [isGroup, setIsGroup] = React.useState(account?.isGroup ?? false);
  const [opening, setOpening] = React.useState(String(account?.openingBalance ?? ""));

  // Re-seed the form whenever it's reopened for a different account/parent.
  React.useEffect(() => {
    if (!open) return;
    setCode(suggestedCode);
    setName(account?.name ?? "");
    setNameAr(account?.nameAr ?? "");
    const t = account?.type ?? parent?.type ?? "asset";
    setType(t);
    setNature(account?.nature ?? normalBalance(t));
    setIsGroup(account?.isGroup ?? false);
    setOpening(String(account?.openingBalance ?? ""));
  }, [open, account, parent, suggestedCode]);

  const pickType = (t: AccountType) => {
    setType(t);
    setNature(normalBalance(t)); // contra accounts can still flip it below
  };

  const submit = async () => {
    if (!code.trim() || !name.trim()) return;
    try {
      await save.mutateAsync({
        ...(account?.id ? { id: account.id } : {}),
        code: code.trim(),
        parentId: account?.parentId ?? parent?.id ?? null,
        name: name.trim(),
        nameAr: nameAr.trim() || name.trim(),
        type,
        nature,
        isGroup,
        openingBalance: opening ? Number(opening) : undefined,
        active: account?.active ?? true,
        systemKey: account?.systemKey,
      });
      toast.success(ar ? "تم حفظ الحساب." : "Account saved.");
      setOpen(false);
    } catch (e) {
      console.error("[account-save]", e);
      const detail = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      toast.error(ar ? `تعذّر حفظ الحساب: ${detail}` : `Couldn't save the account: ${detail}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? (ar ? "تعديل حساب" : "Edit account") : ar ? "حساب جديد" : "New account"}
          </DialogTitle>
          <DialogDescription>
            {parent && !editing
              ? `${ar ? "تحت" : "Under"} ${parent.code} · ${ar ? parent.nameAr : parent.name}`
              : ar
                ? "حساب في شجرة الحسابات."
                : "An account in the chart of accounts."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="account-code">{ar ? "الكود" : "Code"}</Label>
            <Input id="account-code" value={code} onChange={(e) => setCode(e.target.value)} className="tabular-nums" />
          </div>
          <div>
            <Label htmlFor="account-type">{ar ? "نوع الحساب" : "Account type"}</Label>
            <Select value={type} onValueChange={(v) => pickType(v as AccountType)}>
              <SelectTrigger id="account-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {ar ? t.ar : t.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="account-name">{ar ? "الاسم (إنجليزي)" : "Name (English)"}</Label>
            <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="account-name-ar">{ar ? "الاسم (عربي)" : "Name (Arabic)"}</Label>
            <Input id="account-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
          </div>
          <div>
            <Label htmlFor="account-nature">{ar ? "طبيعة الحساب" : "Nature"}</Label>
            <Select value={nature} onValueChange={(v) => setNature(v as AccountNature)}>
              <SelectTrigger id="account-nature">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="debit">{ar ? "مدين" : "Debit"}</SelectItem>
                <SelectItem value="credit">{ar ? "دائن" : "Credit"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="account-opening">{ar ? "رصيد افتتاحي" : "Opening balance"}</Label>
            <Input
              id="account-opening"
              type="number"
              step="0.01"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              className="tabular-nums"
            />
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <div>
            <p className="text-[13px] font-medium">{ar ? "حساب رئيسي (مجموعة)" : "Group account"}</p>
            <p className="text-[11.5px] text-muted-foreground">
              {ar ? "عنوان فقط — لا يُرحَّل إليه مباشرة." : "A header only — you can't post to it."}
            </p>
          </div>
          <Switch checked={isGroup} onCheckedChange={setIsGroup} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={save.isPending || !code.trim() || !name.trim()}>
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            {ar ? "حفظ" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
