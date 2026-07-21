"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Baby,
  Check,
  Download,
  HeartPulse,
  Loader2,
  Milk,
  Sparkles,
  Wallet,
  Wheat,
  WifiOff,
  Users,
  Languages,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/provider";
import { getFirebase } from "@/infrastructure/firebase/client";
import { DOWNLOAD_URL } from "@/lib/download";

const FEATURES = [
  { icon: Milk, en: "Milk & parlor", enD: "Two-shift records, quality, forecasts and per-cow yield.", ar: "الحليب والحلابة", arD: "سجلات الوردية، الجودة، التنبؤ، وإنتاج كل بقرة." },
  { icon: Baby, en: "Breeding", enD: "Heats, inseminations, pregnancy checks and calvings.", ar: "التكاثر", arD: "الشياع، التلقيح، فحص الحمل، والولادات." },
  { icon: HeartPulse, en: "Health", enD: "Treatments, vaccinations and milk-withdrawal control.", ar: "الصحة", arD: "العلاجات، التطعيمات، والتحكم في فترة سحب الحليب." },
  { icon: Wheat, en: "Feed", enD: "Rations, inventory and feed-conversion efficiency.", ar: "التغذية", arD: "العلائق، المخزون، وكفاءة تحويل العلف." },
  { icon: Wallet, en: "Finance", enD: "Income, expenses, invoices and cost-per-litre.", ar: "المالية", arD: "الدخل، المصروفات، الفواتير، وتكلفة اللتر." },
  { icon: BarChart3, en: "Analytics & reports", enD: "Period comparisons, PDF and Excel exports, bilingual.", ar: "التحليلات والتقارير", arD: "مقارنة الفترات، تصدير PDF وExcel، بلغتين." },
  { icon: WifiOff, en: "Works offline", enD: "Record in the parlor with no signal; it syncs on reconnect.", ar: "يعمل دون إنترنت", arD: "سجّل في الحظيرة بلا شبكة، وتتم المزامنة عند الاتصال." },
  { icon: Users, en: "Your whole team", enD: "Roles for owner, manager, vet, accountant and workers.", ar: "فريقك بالكامل", arD: "أدوار للمالك والمدير والطبيب والمحاسب والعمال." },
  { icon: Sparkles, en: "AI advisor", enD: "Ask about the herd in plain language and get answers.", ar: "مستشار ذكي", arD: "اسأل عن القطيع بلغتك واحصل على إجابات." },
];

export default function LandingPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";

  return (
    <>
      {/* ------------------------------- Hero ------------------------------- */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(600px 300px at 50% -10%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)",
          }}
        />
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-20 text-center sm:py-28">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1 text-[12px] font-medium text-primary"
          >
            <Sparkles className="size-3.5" />
            {ar ? "برنامج إدارة الجاموس للمزارع الحديثة" : "The herd system for modern buffalo dairies"}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-6xl"
          >
            {ar ? "أدر مزرعتك كأنها مؤسسة" : "Run your dairy like an enterprise"}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mt-4 max-w-2xl text-balance text-[15px] leading-relaxed text-muted-foreground sm:text-lg"
          >
            {ar
              ? "الحليب والتكاثر والصحة والأعلاف والمالية والتحليلات — كلها في تطبيق واحد لسطح المكتب، يعمل دون إنترنت وبالعربية والإنجليزية."
              : "Milk, breeding, health, feed, finance and analytics — one desktop app that works offline and speaks Arabic and English."}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Button asChild size="lg">
              <a href={DOWNLOAD_URL} download>
                <Download /> {ar ? "حمّل التطبيق لويندوز" : "Download for Windows"}
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#demo">
                {ar ? "اطلب عرضًا توضيحيًا" : "Request a demo"} <ArrowRight className="rtl:-scale-x-100" />
              </a>
            </Button>
          </motion.div>

          <p className="mt-4 text-[12px] text-muted-foreground">
            {ar ? "ويندوز 10 و11 · تثبيت بنقرة واحدة" : "Windows 10 & 11 · one-click installer"}
          </p>
        </div>
      </section>

      {/* ----------------------------- Features ----------------------------- */}
      <section id="features" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            {ar ? "كل ما تحتاجه المزرعة" : "Everything the farm needs"}
          </h2>
          <p className="mt-3 text-[14px] text-muted-foreground">
            {ar
              ? "من الحلابة الصباحية إلى دفتر الحسابات — نظام واحد بدل عشرة دفاتر."
              : "From the morning milking to the ledger — one system instead of ten notebooks."}
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.en}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.3, delay: (i % 3) * 0.05 }}
                className="rounded-2xl border border-border/70 bg-card p-5"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-3 text-[15px] font-semibold">{ar ? f.ar : f.en}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {ar ? f.arD : f.enD}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------ Pricing ----------------------------- */}
      <section id="pricing" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">{ar ? "الأسعار" : "Pricing"}</h2>
          <p className="mt-3 text-[14px] text-muted-foreground">
            {ar ? "خطة واحدة بسيطة لكل مزرعة." : "One simple plan per farm."}
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-md rounded-3xl border border-primary/30 bg-card p-8 shadow-sm">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-primary">
            {ar ? "بريميوم" : "Premium"}
          </p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-4xl font-semibold">{ar ? "تواصل معنا" : "Let's talk"}</span>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {ar ? "تسعير حسب حجم القطيع. اطلب عرضًا لمعرفة التفاصيل." : "Priced by herd size. Request a demo for details."}
          </p>

          <ul className="mt-6 space-y-2.5 text-[13.5px]">
            {(ar
              ? ["تطبيق سطح المكتب الكامل", "عدد غير محدود من الحيوانات والمستخدمين", "يعمل دون إنترنت", "تقارير PDF وExcel", "دعم بالعربية والإنجليزية"]
              : ["Full desktop application", "Unlimited animals and users", "Works fully offline", "PDF & Excel reports", "Arabic & English support"]
            ).map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>

          <Button asChild size="lg" className="mt-7 w-full">
            <a href="#demo">{ar ? "اطلب عرضًا" : "Request a demo"}</a>
          </Button>
        </div>
      </section>

      {/* --------------------------- Request a demo ------------------------- */}
      <section id="demo" className="scroll-mt-20 border-t border-border/60 bg-muted/30 py-16">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              {ar ? "اطلب عرضًا توضيحيًا" : "Request a demo"}
            </h2>
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
              {ar
                ? "اترك بياناتك وسنتواصل معك لعرض النظام على قطيعك وتجهيز حسابك."
                : "Leave your details and we'll reach out to walk you through the system on your own herd and set up your account."}
            </p>
            <div className="mt-6 flex items-center gap-2 text-[13px] text-muted-foreground">
              <Languages className="size-4 text-primary" />
              {ar ? "متاح بالعربية والإنجليزية" : "Available in Arabic & English"}
            </div>
          </div>

          <DemoForm />
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function DemoForm() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [state, setState] = React.useState<"idle" | "sending" | "done" | "error">("idle");
  const [form, setForm] = React.useState({ name: "", farm: "", email: "", phone: "", message: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    setState("sending");
    try {
      const { collection, addDoc, serverTimestamp } = await import("firebase/firestore");
      await addDoc(collection(getFirebase().db, "leads"), {
        name: form.name.trim(),
        farm: form.farm.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        message: form.message.trim(),
        locale,
        createdAt: serverTimestamp(),
      });
      setState("done");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-primary/30 bg-card p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Check className="size-6" />
        </span>
        <p className="mt-3 text-[15px] font-semibold">{ar ? "تم استلام طلبك" : "Request received"}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {ar ? "سنتواصل معك قريبًا." : "We'll be in touch shortly."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border/70 bg-card p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder={ar ? "الاسم" : "Name"} value={form.name} onChange={set("name")} required />
        <Input placeholder={ar ? "اسم المزرعة" : "Farm name"} value={form.farm} onChange={set("farm")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input type="email" placeholder={ar ? "البريد الإلكتروني" : "Email"} value={form.email} onChange={set("email")} required />
        <Input placeholder={ar ? "رقم الهاتف" : "Phone"} value={form.phone} onChange={set("phone")} />
      </div>
      <Textarea rows={3} placeholder={ar ? "كم عدد رؤوس قطيعك؟ (اختياري)" : "How big is your herd? (optional)"} value={form.message} onChange={set("message")} />
      {state === "error" && (
        <p className="text-[12.5px] text-destructive">
          {ar ? "تعذّر الإرسال. حاول مرة أخرى." : "Couldn't send. Please try again."}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={state === "sending"}>
        {state === "sending" ? <Loader2 className="animate-spin" /> : <ArrowRight className="rtl:-scale-x-100" />}
        {ar ? "أرسل الطلب" : "Send request"}
      </Button>
    </form>
  );
}
