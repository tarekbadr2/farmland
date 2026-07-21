"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Languages } from "lucide-react";

import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";
import { DOWNLOAD_URL } from "@/lib/download";

/**
 * Public marketing chrome — the product's front door. No auth, no app shell;
 * just a header with the download call-to-action and a footer. Lives outside the
 * (app) route group so it never touches the authenticated dashboard.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { locale, toggleLocale } = useI18n();
  const ar = locale === "ar";

  const nav = [
    { href: "#features", en: "Features", ar: "المميزات" },
    { href: "#pricing", en: "Pricing", ar: "الأسعار" },
    { href: "#demo", en: "Request a demo", ar: "اطلب عرضًا" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background" dir={ar ? "rtl" : "ltr"}>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/welcome" className="flex items-center gap-2">
            <Logo />
            <span className="text-[15px] font-semibold tracking-tight">Herd OS</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="text-[13.5px] text-muted-foreground transition hover:text-foreground"
              >
                {ar ? n.ar : n.en}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleLocale} aria-label="Toggle language">
              <Languages className="size-4" />
            </Button>
            <Button asChild size="sm">
              <a href={DOWNLOAD_URL} download>
                <Download className="size-4" />
                {ar ? "حمّل التطبيق" : "Download"}
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-6 text-center">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-[14px] font-semibold">Herd OS</span>
          </div>
          <p className="max-w-md text-[12.5px] text-muted-foreground">
            {ar
              ? "نظام إدارة مزارع الجاموس — الحليب والتكاثر والصحة والأعلاف والمالية في مكان واحد."
              : "Enterprise herd management for buffalo dairies — milk, breeding, health, feed and finance in one place."}
          </p>
          <p className="text-[11.5px] text-muted-foreground/70">
            © {2026} Herd OS · {ar ? "صُنع لمزارع مصر" : "Built for Egyptian farms"}
          </p>
        </div>
      </footer>
    </div>
  );
}
