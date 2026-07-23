"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Check, LogOut, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/shell/logo";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import { WEB_ORIGIN } from "@/lib/download";
import { PLANS, PLAN_ORDER, formatEgp } from "@/lib/billing/plans";
import type { Entitlement } from "@/lib/billing/status";

/**
 * Desktop premium gate. The desktop app is where you *run* the farm; buying and
 * managing a subscription happens on the website, where payments (Paymob) and
 * saved cards live. So when a desktop login has no active access, we don't show
 * the in-app plan picker — we send them to the site to sign in and subscribe.
 * The button opens WEB_ORIGIN in the real browser (Electron's window-open
 * handler routes external URLs to the system browser).
 */
export function PremiumGate({ entitlement }: { entitlement: Entitlement }) {
  const { locale } = useI18n();
  const { signOut } = useAuth();
  const ar = locale === "ar";

  const heading =
    entitlement.status === "canceled"
      ? ar ? "انتهى اشتراكك" : "Your subscription ended"
      : entitlement.status === "past_due"
        ? ar ? "دفعتك متأخرة" : "Your payment is past due"
        : entitlement.status === "trialing" || entitlement.status === "legacy"
          ? ar ? "تطبيق Herd OS ميزة مدفوعة" : "Herd OS is a premium app"
          : ar ? "انتهت فترتك التجريبية" : "Your free trial has ended";

  const cheapest = formatEgp(PLANS[PLAN_ORDER[0]].amount, ar ? "ar" : "en");

  const perks = ar
    ? ["إدارة القطيع والحليب واللحوم كاملة", "الأصول والمالية والرواتب والتقارير", "يعمل دون إنترنت على سطح المكتب"]
    : ["Full herd, milk & meat management", "Assets, finance, payroll & reports", "Works fully offline on desktop"];

  // The website: sign in there, pick a plan, pay — then return and the desktop
  // app unlocks. Opens in the system browser from the Electron shell.
  const plansUrl = `${WEB_ORIGIN}/welcome#pricing`;
  const signInUrl = `${WEB_ORIGIN}/login`;

  return (
    <div className="min-h-screen bg-background px-6 py-12" dir={ar ? "rtl" : "ltr"}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mx-auto flex w-full max-w-md flex-col items-center text-center"
      >
        <Logo className="size-12" />

        <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1 text-[11.5px] font-medium text-primary">
          <ShieldCheck className="size-3.5" />
          {ar ? "اشتراك مميّز" : "Premium subscription"}
        </span>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{heading}</h1>

        <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted-foreground">
          {ar
            ? "بياناتك آمنة ومحفوظة. تُدار الاشتراكات والمدفوعات على موقعنا — سجّل الدخول هناك، اختر خطة، وسيُفتح التطبيق فورًا على هذا الجهاز."
            : "Your data is safe and waiting. Subscriptions and payments are handled on our website — sign in there, choose a plan, and the app unlocks here right away."}
        </p>

        <ul className="mt-6 w-full space-y-2.5 rounded-xl border border-border/70 bg-card/40 p-4 text-start">
          {perks.map((p) => (
            <li key={p} className="flex items-center gap-2.5 text-[13px]">
              <Check className="size-4 shrink-0 text-primary" />
              <span>{p}</span>
            </li>
          ))}
        </ul>

        <a
          href={plansUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground transition hover:opacity-90"
        >
          {ar ? `عرض الخطط — من ${cheapest}/شهر` : `View plans — from ${cheapest}/mo`}
          <ArrowUpRight className="size-4" />
        </a>

        <p className="mt-3 text-[12.5px] text-muted-foreground">
          {ar ? "لديك خطة بالفعل؟ " : "Already subscribed? "}
          <a
            href={signInUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {ar ? "سجّل الدخول على الويب" : "Sign in on the web"}
          </a>
        </p>

        <button
          onClick={() => signOut()}
          className="mx-auto mt-8 flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition hover:text-foreground"
        >
          <LogOut className="size-3.5" />
          {ar ? "تسجيل الخروج" : "Sign out"}
        </button>

        <p className="mt-4 text-[11px] text-muted-foreground/80">
          <Link href="/legal/terms" className="underline-offset-2 hover:underline">
            {ar ? "شروط الخدمة" : "Terms"}
          </Link>
          <span className="mx-1.5 text-muted-foreground/40">·</span>
          <Link href="/legal/privacy" className="underline-offset-2 hover:underline">
            {ar ? "سياسة الخصوصية" : "Privacy"}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
