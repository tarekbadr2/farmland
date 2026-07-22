"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, LogOut } from "lucide-react";

import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth/provider";
import { useI18n } from "@/lib/i18n/provider";
import { createFarm } from "@/infrastructure/firebase/client";
import { setActiveFarm } from "@/infrastructure/firebase/tenant";

/**
 * Create-your-farm onboarding.
 *
 * Shown to a signed-in user who belongs to no farm yet (a fresh sign-up). Naming
 * the farm calls the createFarm function, which provisions the tenant + default
 * pens and maps the user as owner; we then re-resolve the session and drop them
 * into their (empty) farm, ready to import the herd.
 */
export function Onboarding() {
  const { refreshSession, signOut } = useAuth();
  const { locale } = useI18n();
  const ar = locale === "ar";

  const [name, setName] = React.useState("");
  const [nameAr, setNameAr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const farmId = await createFarm(name.trim(), nameAr.trim() || undefined);
      setActiveFarm(farmId);
      await refreshSession(); // sets the user → the guard swaps to the app
    } catch {
      setError(ar ? "تعذّر إنشاء المزرعة. حاول مرة أخرى." : "Couldn't create the farm. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6" dir={ar ? "rtl" : "ltr"}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="size-12" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            {ar ? "أنشئ مزرعتك" : "Create your farm"}
          </h1>
          <p className="mt-2 text-[13.5px] text-muted-foreground">
            {ar
              ? "سمِّ مزرعتك للبدء. سنجهّز الحظائر الافتراضية، ثم يمكنك استيراد القطيع ودعوة فريقك."
              : "Name your farm to get started. We'll set up default pens — then you can import your herd and invite your team."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border/70 bg-card p-6">
          <div className="space-y-1.5">
            <Label className="text-[12.5px]">{ar ? "اسم المزرعة" : "Farm name"}</Label>
            <Input
              autoFocus
              placeholder={ar ? "مثال: مزرعة دلتا النيل" : "e.g. Nile Delta Farm"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12.5px]">{ar ? "الاسم بالعربية (اختياري)" : "Arabic name (optional)"}</Label>
            <Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          </div>

          {error && <p className="text-[12.5px] text-destructive">{error}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <ArrowRight className="rtl:-scale-x-100" />}
            {ar ? "إنشاء المزرعة" : "Create farm"}
          </Button>
        </form>

        <button
          onClick={() => signOut()}
          className="mx-auto mt-4 flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition hover:text-foreground"
        >
          <LogOut className="size-3.5" />
          {ar ? "تسجيل الخروج" : "Sign out"}
        </button>
      </motion.div>
    </div>
  );
}
