"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, LogOut, Sparkles, SkipForward } from "lucide-react";

import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth/provider";
import { useI18n } from "@/lib/i18n/provider";
import { createFarm } from "@/infrastructure/firebase/client";
import { setActiveFarm } from "@/infrastructure/firebase/tenant";
import { seedSampleFarm } from "@/core/data/sample";

/**
 * Create-your-farm onboarding.
 *
 * Two steps for a fresh sign-up: (1) name the farm — which provisions the tenant
 * + default pens and maps the user as owner; then (2) an explicit choice of
 * whether to load a sample herd + guided tour, or start empty. Only after that
 * do we re-resolve the session and drop them into their farm.
 */
export function Onboarding() {
  const { refreshSession, signOut } = useAuth();
  const { locale } = useI18n();
  const ar = locale === "ar";

  const [phase, setPhase] = React.useState<"name" | "tutorial">("name");
  const [name, setName] = React.useState("");
  const [nameAr, setNameAr] = React.useState("");
  const [farmId, setFarmId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<null | "creating" | "seeding" | "finishing">(null);
  const [error, setError] = React.useState<string | null>(null);

  // Step 1 — name → create the farm, then move to the tutorial choice.
  const submitName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy("creating");
    setError(null);
    try {
      const id = await createFarm(name.trim(), nameAr.trim() || undefined);
      setActiveFarm(id);
      setFarmId(id);
      setBusy(null);
      setPhase("tutorial");
    } catch {
      setError(ar ? "تعذّر إنشاء المزرعة. حاول مرة أخرى." : "Couldn't create the farm. Try again.");
      setBusy(null);
    }
  };

  // Step 2 — with or without the tutorial. A seed hiccup shouldn't strand
  // onboarding; they just land on an empty farm, which is still valid.
  const finish = async (withTutorial: boolean) => {
    setBusy(withTutorial ? "seeding" : "finishing");
    setError(null);
    try {
      if (withTutorial && farmId) {
        try {
          await seedSampleFarm(farmId);
        } catch {
          /* non-fatal */
        }
      }
      await refreshSession(); // sets the user → the guard swaps to the app
    } catch {
      setError(ar ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Try again.");
      setBusy(null);
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
        {phase === "name" ? (
          <>
            <div className="mb-6 flex flex-col items-center text-center">
              <Logo className="size-12" />
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">
                {ar ? "أنشئ مزرعتك" : "Create your farm"}
              </h1>
              <p className="mt-2 text-[13.5px] text-muted-foreground">
                {ar
                  ? "سمِّ مزرعتك للبدء. سنجهّز الحظائر الافتراضية، ثم نسألك إن كنت تريد جولة تعريفية."
                  : "Name your farm to get started. We'll set up default pens, then ask if you'd like a quick guided tour."}
              </p>
            </div>

            <form onSubmit={submitName} className="space-y-4 rounded-2xl border border-border/70 bg-card p-6">
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

              <Button type="submit" size="lg" className="w-full" disabled={!!busy || !name.trim()}>
                {busy === "creating" ? <Loader2 className="animate-spin" /> : <ArrowRight className="rtl:-scale-x-100" />}
                {busy === "creating"
                  ? ar ? "ننشئ مزرعتك…" : "Creating your farm…"
                  : ar ? "متابعة" : "Continue"}
              </Button>

              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                {ar ? "بإنشائك مزرعة فإنك توافق على " : "By creating a farm you agree to our "}
                <Link href="/legal/terms" className="underline underline-offset-2 hover:text-foreground">
                  {ar ? "شروط الخدمة" : "Terms"}
                </Link>
                {ar ? " و" : " & "}
                <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
                  {ar ? "سياسة الخصوصية" : "Privacy Policy"}
                </Link>
              </p>
            </form>
          </>
        ) : (
          <>
            <div className="mb-6 flex flex-col items-center text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <Sparkles className="size-6" />
              </span>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">
                {ar ? "مزرعتك جاهزة!" : "Your farm is ready!"}
              </h1>
              <p className="mt-2 text-[13.5px] text-muted-foreground">
                {ar
                  ? "هل تريد جولة تعريفية سريعة؟ سنملأ مزرعتك ببيانات تجريبية ونرشدك خلال النظام. يمكنك مسحها لاحقًا بنقرة واحدة."
                  : "Want a quick guided tour? We'll fill your farm with sample data and walk you through the app. You can clear it later in one click."}
              </p>
            </div>

            <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-6">
              {error && <p className="text-[12.5px] text-destructive">{error}</p>}

              <Button
                size="lg"
                className="w-full"
                disabled={!!busy}
                onClick={() => finish(true)}
              >
                {busy === "seeding" ? <Loader2 className="animate-spin" /> : <Sparkles className="size-4" />}
                {busy === "seeding"
                  ? ar ? "نجهّز الجولة…" : "Setting up your tour…"
                  : ar ? "نعم، أرشدني بجولة" : "Yes, show me around"}
              </Button>

              <Button
                size="lg"
                variant="outline"
                className="w-full"
                disabled={!!busy}
                onClick={() => finish(false)}
              >
                {busy === "finishing" ? <Loader2 className="animate-spin" /> : <SkipForward className="size-4 rtl:-scale-x-100" />}
                {busy === "finishing"
                  ? ar ? "لحظة…" : "One moment…"
                  : ar ? "لا، سأبدأ بمزرعة فارغة" : "No, start with an empty farm"}
              </Button>
            </div>
          </>
        )}

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
