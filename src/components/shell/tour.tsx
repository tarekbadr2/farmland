"use client";

/**
 * Guided spotlight tour.
 *
 * A first-run walkthrough: it dims the screen, cuts a spotlight around a target
 * element (anchored by `data-tour="…"`), and floats a tooltip with Next / Back /
 * Skip. Steps that can't find their anchor (e.g. the sidebar on mobile) fall
 * back to a centred card so the copy still shows. Completion is remembered per
 * farm so it runs once.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

interface Step {
  /** `data-tour` value to spotlight; omit for a centred card. */
  anchor?: string;
  en: { title: string; body: string };
  ar: { title: string; body: string };
}

const STEPS: Step[] = [
  {
    en: { title: "Welcome to Herd OS", body: "We've filled your farm with sample data so you can explore. This quick tour shows you around — it takes about a minute." },
    ar: { title: "مرحبًا بك في Herd OS", body: "لقد ملأنا مزرعتك ببيانات تجريبية لتتصفّحها. تعرّفك هذه الجولة السريعة على النظام في أقل من دقيقة." },
  },
  {
    anchor: "nav:/dashboard",
    en: { title: "Dashboard", body: "Your herd, milk production, and finances at a glance — the first thing you see each morning." },
    ar: { title: "لوحة التحكم", body: "قطيعك وإنتاج الحليب والحسابات في لمحة واحدة — أول ما تراه كل صباح." },
  },
  {
    anchor: "nav:/animals",
    en: { title: "Animals", body: "Every head, searchable by tag or name. Open any animal for its full history, milk, and health." },
    ar: { title: "الحيوانات", body: "كل رأس، قابل للبحث بالرقم أو الاسم. افتح أي حيوان لعرض سجله الكامل والحليب والصحة." },
  },
  {
    anchor: "nav:/milk",
    en: { title: "Milk", body: "Record morning and evening sessions and watch yield trends per animal and across the herd." },
    ar: { title: "الحليب", body: "سجّل حلبات الصباح والمساء وتابع اتجاهات الإنتاج لكل حيوان وللقطيع كله." },
  },
  {
    anchor: "nav:/health",
    en: { title: "Health", body: "Vaccinations, treatments, and health events — with reminders before anything is due." },
    ar: { title: "الصحة", body: "التطعيمات والعلاجات والأحداث الصحية — مع تذكيرات قبل مواعيد الاستحقاق." },
  },
  {
    anchor: "nav:/breeding",
    en: { title: "Breeding", body: "Track heats, inseminations, and pregnancy checks so no window is missed." },
    ar: { title: "التكاثر", body: "تابع الشياع والتلقيح وفحوصات الحمل حتى لا تفوت أي فرصة." },
  },
  {
    anchor: "nav:/finance",
    en: { title: "Finance", body: "Income, expenses, and invoices — see exactly what the farm earns and spends." },
    ar: { title: "الحسابات", body: "الإيرادات والمصروفات والفواتير — اعرف بالضبط ما تكسبه المزرعة وتنفقه." },
  },
  {
    anchor: "nav:/assistant",
    en: { title: "AI Advisor", body: "Ask anything about your herd in plain language — it answers from your own farm's data." },
    ar: { title: "المستشار الذكي", body: "اسأل أي شيء عن قطيعك بلغة بسيطة — يجيب من بيانات مزرعتك أنت." },
  },
  {
    anchor: "sample-banner",
    en: { title: "Your real herd", body: "When you're ready, clear the sample data here and start adding your own animals. That's it — enjoy!" },
    ar: { title: "قطيعك الحقيقي", body: "عندما تكون جاهزًا، امسح البيانات التجريبية من هنا وابدأ بإضافة حيواناتك. هذا كل شيء — بالتوفيق!" },
  },
];

type Rect = { top: number; left: number; width: number; height: number };

interface TourCtx {
  start: () => void;
  active: boolean;
}
const Ctx = React.createContext<TourCtx | null>(null);
export function useTour(): TourCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useTour must be used within <TourProvider>");
  return ctx;
}

const PAD = 8; // spotlight padding around the target
const GAP = 14; // gap between spotlight and tooltip
const TIP_W = 320;

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const start = React.useCallback(() => {
    setStep(0);
    setActive(true);
  }, []);
  const stop = React.useCallback(() => setActive(false), []);

  const current = STEPS[step];

  // Locate the current step's anchor (retrying, since a nav item may still be
  // rendering) and keep its rect fresh on scroll / resize.
  React.useEffect(() => {
    if (!active) return;
    if (!current.anchor) {
      setRect(null);
      return;
    }
    let raf = 0;
    let tries = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${current.anchor}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        return;
      }
      if (tries++ < 40) raf = requestAnimationFrame(measure); // ~0.6s of retries
      else setRect(null); // give up → centred fallback
    };
    measure();
    const onMove = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${current.anchor}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [active, step, current.anchor]);

  const next = React.useCallback(() => {
    setStep((s) => {
      if (s >= STEPS.length - 1) {
        setActive(false);
        return s;
      }
      return s + 1;
    });
  }, []);
  const back = React.useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, back, stop]);

  return (
    <Ctx.Provider value={{ start, active }}>
      {children}
      {mounted && active
        ? createPortal(
            <Overlay
              step={step}
              rect={rect}
              onNext={next}
              onBack={back}
              onSkip={stop}
            />,
            document.body,
          )
        : null}
    </Ctx.Provider>
  );
}

function Overlay({
  step,
  rect,
  onNext,
  onBack,
  onSkip,
}: {
  step: number;
  rect: Rect | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const s = STEPS[step];
  const copy = ar ? s.ar : s.en;
  const last = step === STEPS.length - 1;

  const spot = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // Place the tooltip in whichever margin around the spotlight has the most
  // room; fall back to dead-centre when there's no anchor.
  const tip = React.useMemo(() => computeTip(spot), [spot]);

  return (
    <div className="fixed inset-0 z-[100]" dir={ar ? "rtl" : "ltr"} aria-live="polite" role="dialog">
      {/* Full-screen click-catcher: clicking anywhere off the tooltip skips the
          tour and — crucially — stops stray clicks from reaching the app beneath.
          When a spotlight is active the box-shadow layer paints the dim, so this
          stays transparent; otherwise it carries the scrim itself. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onSkip}
        className="absolute inset-0"
        style={spot ? undefined : { background: "rgba(2,6,23,0.62)" }}
      />
      {/* Purely-visual spotlight cutout (no pointer events — clicks pass through
          to the catcher above so nothing in the app fires by accident). */}
      {spot && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary/80"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px rgba(2,6,23,0.62)",
          }}
        />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-auto absolute w-[320px] max-w-[calc(100vw-24px)] rounded-2xl border border-border/70 bg-popover p-4 shadow-2xl"
          style={tip}
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {step + 1} / {STEPS.length}
            </span>
            <button
              onClick={onSkip}
              className="text-muted-foreground transition hover:text-foreground"
              aria-label={ar ? "تخطّي" : "Skip"}
            >
              <X className="size-4" />
            </button>
          </div>

          <h3 className="text-[15px] font-semibold tracking-tight">{copy.title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{copy.body}</p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              onClick={onSkip}
              className="text-[12px] text-muted-foreground transition hover:text-foreground"
            >
              {ar ? "تخطّي الجولة" : "Skip tour"}
            </button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="outline" size="sm" onClick={onBack}>
                  <ArrowLeft className="rtl:-scale-x-100" />
                  {ar ? "السابق" : "Back"}
                </Button>
              )}
              <Button size="sm" onClick={onNext}>
                {last ? (ar ? "تم" : "Done") : ar ? "التالي" : "Next"}
                {!last && <ArrowRight className="rtl:-scale-x-100" />}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Position the tooltip near the spotlight, clamped to the viewport. */
function computeTip(spot: Rect | null): React.CSSProperties {
  if (typeof window === "undefined" || !spot) {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampTop = (t: number) => Math.max(12, Math.min(t, vh - 220));
  const clampLeft = (l: number) => Math.max(12, Math.min(l, vw - TIP_W - 12));

  const spaceRight = vw - (spot.left + spot.width);
  const spaceLeft = spot.left;
  const spaceBelow = vh - (spot.top + spot.height);

  // Sidebar items are tall-and-narrow at a screen edge → prefer the wide side.
  if (spaceRight >= TIP_W + GAP) {
    return { top: clampTop(spot.top), left: spot.left + spot.width + GAP };
  }
  if (spaceLeft >= TIP_W + GAP) {
    return { top: clampTop(spot.top), left: spot.left - TIP_W - GAP };
  }
  if (spaceBelow >= 200) {
    return { top: spot.top + spot.height + GAP, left: clampLeft(spot.left) };
  }
  return { top: clampTop(spot.top - 200 - GAP), left: clampLeft(spot.left) };
}
