"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { LogOut } from "lucide-react";

import { Logo } from "@/components/shell/logo";
import { PlanPicker } from "@/components/billing/plan-picker";
import { useI18n } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/auth/provider";
import type { Entitlement } from "@/lib/billing/status";

/**
 * Paywall — the hard gate shown once the trial lapses (and billing enforcement
 * is on). The farm's data is untouched behind it; picking a plan and paying
 * restores access.
 */
export function Paywall({ entitlement }: { entitlement: Entitlement }) {
  const { locale } = useI18n();
  const { signOut } = useAuth();
  const ar = locale === "ar";

  const heading =
    entitlement.status === "past_due"
      ? ar ? "دفعتك متأخرة" : "Your payment is past due"
      : entitlement.status === "canceled"
        ? ar ? "انتهى اشتراكك" : "Your subscription ended"
        : ar ? "انتهت فترتك التجريبية" : "Your free trial has ended";

  return (
    <div className="min-h-screen bg-background px-6 py-12" dir={ar ? "rtl" : "ltr"}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mx-auto w-full max-w-4xl"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="size-12" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">{heading}</h1>
          <p className="mt-2 max-w-lg text-[13.5px] text-muted-foreground">
            {ar
              ? "بياناتك في أمان ومحفوظة. اختر خطة لمتابعة إدارة مزرعتك — يمكنك الترقية أو التغيير في أي وقت."
              : "Your data is safe and waiting. Choose a plan to keep managing your farm — you can upgrade or change anytime."}
          </p>
        </div>

        <PlanPicker currentTier={entitlement.tier} />

        <button
          onClick={() => signOut()}
          className="mx-auto mt-8 flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition hover:text-foreground"
        >
          <LogOut className="size-3.5" />
          {ar ? "تسجيل الخروج" : "Sign out"}
        </button>

        <p className="mt-4 text-center text-[11px] text-muted-foreground/80">
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
