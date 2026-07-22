"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Loader2, ShieldCheck, WifiOff, Languages } from "lucide-react";

import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";

/** Google's mark, inlined — the brand guidelines require the four colours. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51Z"
      />
    </svg>
  );
}

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type FormValues = z.infer<typeof schema>;

export default function SignInPage() {
  const router = useRouter();
  const { t, locale, toggleLocale } = useI18n();
  const { signInWithEmail, signInWithGoogle, bypassed, user, needsOnboarding } = useAuth();
  const [pending, setPending] = React.useState<"email" | "google" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: bypassed
      ? { email: "owner@niledelta.farm", password: "demo1234" }
      : { email: "", password: "" },
  });

  // Already signed in (or auth is off) — don't make anyone look at a login wall.
  React.useEffect(() => {
    // Signed in — into the app (the guard shows onboarding if there's no farm).
    if (user || needsOnboarding) router.replace("/dashboard");
  }, [user, needsOnboarding, router]);

  const run = async (kind: "email" | "google", fn: () => Promise<void>) => {
    setPending(kind);
    setError(null);
    try {
      await fn();
      router.push("/dashboard");
    } catch (e) {
      // Firebase error codes are precise but unreadable; the operator needs one
      // sentence, not `auth/invalid-login-credentials`.
      const code = (e as { code?: string }).code ?? "";
      setError(
        code.includes("popup-closed")
          ? null
          : code.includes("network")
            ? locale === "ar"
              ? "لا يوجد اتصال بالشبكة."
              : "No network connection."
            : t("auth.invalid"),
      );
    } finally {
      setPending(null);
    }
  };

  const onSubmit = (values: FormValues) =>
    bypassed
      ? router.push("/dashboard")
      : run("email", () => signInWithEmail(values.email, values.password));

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ------------------------------- Brand side ------------------------------ */}
      <div className="relative hidden overflow-hidden bg-[oklch(0.21_0.03_165)] text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(900px 500px at 15% 10%, oklch(0.45 0.11 165 / 0.55), transparent 60%), radial-gradient(700px 400px at 85% 80%, oklch(0.4 0.09 200 / 0.5), transparent 60%)",
          }}
        />
        <div className="relative z-10 p-10">
          <div className="flex items-center gap-3">
            <Logo className="bg-white/12 text-white backdrop-blur" />
            <div>
              <p className="text-sm font-semibold">{t("app.name")}</p>
              <p className="text-xs text-white/60">{t("app.tagline")}</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-lg p-10">
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-[34px] font-semibold leading-[1.15] tracking-tight"
          >
            {locale === "ar"
              ? "نظام تشغيل مزرعة الجاموس الحديثة."
              : "The operating system for a modern buffalo dairy."}
          </motion.h2>
          <motion.ul
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } } }}
            className="mt-7 space-y-3.5"
          >
            {[
              { icon: ShieldCheck, text: t("auth.marketing1") },
              { icon: WifiOff, text: t("auth.marketing2") },
              { icon: Languages, text: t("auth.marketing3") },
            ].map((item) => (
              <motion.li
                key={item.text}
                variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}
                className="flex items-start gap-3 text-[14px] text-white/80"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <item.icon className="size-4" />
                </span>
                {item.text}
              </motion.li>
            ))}
          </motion.ul>
        </div>

        <div className="relative z-10 flex items-center gap-6 border-t border-white/10 p-10 text-white/70">
          {[
            { k: "617", v: locale === "ar" ? "رأس مُدارة" : "head managed" },
            { k: "5.4k", v: locale === "ar" ? "لتر/يوم" : "litres/day" },
            { k: "99.9%", v: locale === "ar" ? "جاهزية" : "uptime" },
          ].map((s) => (
            <div key={s.k}>
              <p className="tabular text-xl font-semibold text-white">{s.k}</p>
              <p className="text-[11px]">{s.v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* -------------------------------- Form side ------------------------------ */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2.5">
              <Logo />
              <span className="text-sm font-semibold">{t("app.name")}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={toggleLocale}>
              {locale === "en" ? "العربية" : "English"}
            </Button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <h1 className="text-2xl font-semibold tracking-tight">{t("auth.signIn")}</h1>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {t("auth.signInSubtitle")}
            </p>

            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...form.register("password")}
                />
              </div>
              {error || form.formState.errors.email || form.formState.errors.password ? (
                <p className="text-[12px] text-destructive">{error ?? t("auth.invalid")}</p>
              ) : null}

              <Button type="submit" size="lg" className="w-full" disabled={pending !== null}>
                {pending === "email" ? <Loader2 className="animate-spin" /> : null}
                {t("auth.signIn")}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              {t("auth.or")}
              <span className="h-px flex-1 bg-border" />
            </div>

            {bypassed ? (
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => router.push("/dashboard")}
              >
                {t("auth.continueDemo")}
                <ArrowRight className="rtl:-scale-x-100" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                disabled={pending !== null}
                onClick={() => run("google", signInWithGoogle)}
              >
                {pending === "google" ? <Loader2 className="animate-spin" /> : <GoogleMark />}
                {t("auth.google")}
              </Button>
            )}

            <p className="mt-8 text-center text-[11px] leading-relaxed text-muted-foreground">
              {bypassed ? t("app.demoDataHint") : t("app.liveDataHint")}
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
