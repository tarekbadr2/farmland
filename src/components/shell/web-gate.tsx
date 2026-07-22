"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, LayoutDashboard, Monitor } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/provider";
import { useI18n } from "@/lib/i18n/provider";
import { DOWNLOAD_URL } from "@/lib/download";
import { IS_DESKTOP, isWebViewAllowed } from "@/lib/platform";

/**
 * On the website the app is view-only. This lets the overview and settings/
 * subscription routes through and replaces every operational route with a "this
 * lives in the desktop app" screen. The desktop build and the demo/bypass build
 * pass straight through.
 */
export function WebGate({ children }: { children: React.ReactNode }) {
  const { bypassed } = useAuth();
  const { locale } = useI18n();
  const pathname = usePathname();
  const ar = locale === "ar";

  if (IS_DESKTOP || bypassed || isWebViewAllowed(pathname)) return <>{children}</>;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center" dir={ar ? "rtl" : "ltr"}>
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <Monitor className="size-7" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        {ar ? "هذه الميزة في تطبيق سطح المكتب" : "This lives in the desktop app"}
      </h1>
      <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
        {ar
          ? "إدارة القطيع والحليب والصحة والمالية تتم في تطبيق Herd OS لسطح المكتب. من الويب يمكنك متابعة اشتراكك ونظرة عامة على مزرعتك."
          : "Managing your herd, milk, health and finances happens in the Herd OS desktop app. On the web you can follow your subscription and a farm overview."}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <a href={DOWNLOAD_URL} download>
            <Download className="size-4" />
            {ar ? "حمّل تطبيق سطح المكتب" : "Download the desktop app"}
          </a>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">
            <LayoutDashboard className="size-4" />
            {ar ? "النظرة العامة" : "Overview"}
          </Link>
        </Button>
      </div>
    </div>
  );
}
