"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

import { useI18n } from "@/lib/i18n/provider";

/**
 * Shared renderer for the legal pages (Terms, Privacy).
 *
 * These are good-faith DRAFTS to give the product a real structure — they are
 * not legal advice and must be reviewed by a qualified lawyer (and have the
 * company's legal name + contact filled in) before launch. The draft banner
 * says as much to anyone reading, and the wiring is done so swapping in vetted
 * copy is a one-file edit.
 */

export interface LegalSection {
  h: { en: string; ar: string };
  /** Paragraph(s); an array renders as separate <p> blocks. */
  p: { en: string | string[]; ar: string | string[] };
}

export function LegalDoc({
  title,
  updated,
  intro,
  sections,
}: {
  title: { en: string; ar: string };
  updated: { en: string; ar: string };
  intro: { en: string; ar: string };
  sections: LegalSection[];
}) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const pick = (v: { en: string; ar: string }) => (ar ? v.ar : v.en);
  const paras = (v: { en: string | string[]; ar: string | string[] }) => {
    const raw = ar ? v.ar : v.en;
    return Array.isArray(raw) ? raw : [raw];
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-6" dir={ar ? "rtl" : "ltr"}>
      <Link
        href="/welcome"
        className="mb-8 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
        {ar ? "العودة" : "Back"}
      </Link>

      <div className="mb-2 flex items-center gap-2 text-primary">
        <FileText className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{pick(title)}</h1>
      </div>
      <p className="text-[12.5px] text-muted-foreground">{pick(updated)}</p>

      {/* Draft notice — honest about what this is. */}
      <div className="my-6 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4 text-[12.5px] leading-relaxed text-amber-800 dark:text-amber-200">
        {ar
          ? "هذه مسودّة أولية لأغراض التطوير وليست استشارة قانونية. يجب مراجعتها من محامٍ مختص واستكمال الاسم القانوني للشركة وبيانات التواصل قبل الإطلاق."
          : "This is a working draft for development purposes and is not legal advice. It must be reviewed by a qualified lawyer, and the company's legal name and contact details completed, before launch."}
      </div>

      <p className="text-[14px] leading-relaxed text-muted-foreground">{pick(intro)}</p>

      <div className="mt-8 space-y-7">
        {sections.map((s, i) => (
          <section key={i}>
            <h2 className="mb-2 text-[15.5px] font-semibold tracking-tight">
              {i + 1}. {pick(s.h)}
            </h2>
            <div className="space-y-2.5 text-[13.5px] leading-relaxed text-muted-foreground">
              {paras(s.p).map((para, j) => (
                <p key={j}>{para}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
