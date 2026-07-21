"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Baby,
  Flame,
  HeartPulse,
  Lightbulb,
  Loader2,
  Package,
  Sparkles,
  Wallet,
  Wheat,
  Milk as MilkIcon,
  Search,
} from "lucide-react";

import { PageHeader, cardIn, gridStagger } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MilkStatusPill, ReproStatusPill } from "@/components/common/status-pill";
import { useI18n } from "@/lib/i18n/provider";
import {
  useAnimals,
  useBreeding,
  useFeedItems,
  useHealth,
  useInventory,
  useMilkDaily,
  useTransactions,
  useWeather,
  useZones,
} from "@/hooks/use-farm-data";
import { TODAY } from "@/core/data/seed";
import {
  answerQuery,
  buildAdvisorBrief,
  generateInsights,
  SUGGESTED_QUERIES,
  type AdvisorContext,
  type QueryAnswer,
} from "@/core/services/advisor";
import { getFirebase } from "@/infrastructure/firebase/client";
import { isFirebaseBackend } from "@/core/repositories";
import { cn } from "@/lib/utils";

const CATEGORY_ICON = {
  milk: MilkIcon,
  health: HeartPulse,
  breeding: Baby,
  feed: Wheat,
  inventory: Package,
  weather: Flame,
  finance: Wallet,
} as const;

export default function AssistantPage() {
  const { t, ln, locale, formatNumber } = useI18n();

  const { data: animalPage } = useAnimals({ pageSize: 100000 });
  const { data: milkDaily = [] } = useMilkDaily();
  const { data: health = [] } = useHealth();
  const { data: breeding = [] } = useBreeding();
  const { data: feedItems = [] } = useFeedItems();
  const { data: inventory = [] } = useInventory();
  const { data: transactions = [] } = useTransactions();
  const { data: weather } = useWeather();
  const { data: zones = [] } = useZones();

  const ctx: AdvisorContext = React.useMemo(
    () => ({
      animals: animalPage?.items ?? [],
      milkDaily,
      health,
      breeding,
      feedItems,
      inventory,
      transactions,
      weather,
      zones,
      today: TODAY,
    }),
    [animalPage, milkDaily, health, breeding, feedItems, inventory, transactions, weather, zones],
  );

  const insights = React.useMemo(() => (ctx.animals.length ? generateInsights(ctx) : []), [ctx]);

  const [query, setQuery] = React.useState("");
  const [answer, setAnswer] = React.useState<QueryAnswer | null>(null);
  const [thinking, setThinking] = React.useState(false);

  const ask = React.useCallback(
    async (q: string) => {
      const question = q.trim();
      if (!question || !ctx.animals.length) return;
      setThinking(true);

      // Rule-based advisor: deterministic, instant, works offline. Also the
      // fallback whenever the LLM route is unavailable (no key / not signed in /
      // upstream error), so the assistant never goes dark.
      const local = (): QueryAnswer => ({ ...answerQuery(question, ctx), source: "rules" });

      try {
        // Attach the caller's Firebase token so the paid endpoint stays gated to
        // signed-in farm users. In the demo backend there's no session (and no
        // key server-side), so the route returns fallback and we use `local()`.
        let token: string | undefined;
        if (isFirebaseBackend()) {
          try {
            token = await getFirebase().auth.currentUser?.getIdToken();
          } catch {
            /* not signed in — send unauthenticated, route will fall back */
          }
        }

        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ question, brief: buildAdvisorBrief(ctx), locale }),
        });
        const data = (await res.json().catch(() => null)) as { answer?: string } | null;

        if (res.ok && data?.answer) {
          setAnswer({ matched: true, summary: data.answer, summaryAr: data.answer, source: "ai" });
        } else {
          setAnswer(local());
        }
      } catch {
        setAnswer(local());
      } finally {
        setThinking(false);
      }
    },
    [ctx, locale],
  );

  // Seeded from the command palette's "?q=" handoff. Read straight off the
  // location rather than useSearchParams — this page is otherwise fully static
  // and doesn't need to opt into dynamic rendering for one query param.
  const initial = React.useRef(false);
  React.useEffect(() => {
    if (initial.current || !ctx.animals.length) return;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      initial.current = true;
      setQuery(q);
      ask(q);
    }
  }, [ctx.animals.length, ask]);

  return (
    <>
      <PageHeader title={t("assistant.title")} subtitle={t("assistant.subtitle")} />

      {/* ------------------------------ Ask box ------------------------------ */}
      <motion.div variants={cardIn} initial="hidden" animate="show">
        <Card className="overflow-hidden">
          <div
            className="relative p-5"
            style={{
              background:
                "radial-gradient(600px 200px at 15% 0%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 70%)",
            }}
          >
            <div className="flex items-center gap-2 text-[13px] font-medium">
              <Sparkles className="size-4 text-primary" />
              {t("assistant.title")}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(query);
              }}
              className="mt-3 flex flex-col gap-2 sm:flex-row"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("assistant.placeholder")}
                  className="h-11 ps-9 text-[14px]"
                />
              </div>
              <Button type="submit" size="lg" disabled={thinking}>
                {thinking ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {t("assistant.ask")}
              </Button>
            </form>

            <div className="mt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("assistant.suggestions")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_QUERIES.map((s) => {
                  const label = locale === "ar" ? s.ar : s.en;
                  return (
                    <button
                      key={s.en}
                      onClick={() => {
                        setQuery(label);
                        ask(label);
                      }}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <AnimatePresence>
            {(thinking || answer) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-border/70"
              >
                <CardContent className="pt-4">
                  {thinking ? (
                    <div className="flex items-center gap-2 py-6 text-[13px] text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      {t("assistant.thinking")}…
                    </div>
                  ) : answer?.matched ? (
                    <>
                      {answer.source === "ai" && (
                        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/[0.08] px-2.5 py-1 text-[11px] font-medium text-primary">
                          <Sparkles className="size-3" />
                          {locale === "ar" ? "بحث بالذكاء الاصطناعي" : "AI answer"}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
                        {locale === "ar" ? answer.summaryAr : answer.summary}
                      </p>

                      {answer.metric && (
                        <div className="mt-3 inline-flex items-baseline gap-2 rounded-xl bg-primary/[0.07] px-4 py-3">
                          <span className="text-[12px] text-muted-foreground">
                            {locale === "ar" ? answer.metric.labelAr : answer.metric.label}
                          </span>
                          <span className="tabular text-2xl font-semibold">
                            {answer.metric.value}
                          </span>
                        </div>
                      )}

                      {answer.animals && answer.animals.length > 0 && (
                        <>
                          <p className="mt-4 mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("assistant.matched")} — {formatNumber(answer.animals.length)}{" "}
                            {t("assistant.animalsFound")}
                          </p>
                          <div className="max-h-[380px] space-y-1 overflow-y-auto pe-1">
                            {answer.animals.slice(0, 60).map((a) => (
                              <Link
                                key={a.id}
                                href={`/animals/${a.id}`}
                                className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2 transition hover:border-ring/40 hover:bg-accent/40"
                              >
                                <span className="tabular w-20 shrink-0 text-[12.5px] font-medium">
                                  {a.tag}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
                                  {ln(a)}
                                </span>
                                <MilkStatusPill value={a.milkStatus} />
                                <ReproStatusPill value={a.reproStatus} />
                                {a.expectedCalvingDate && (
                                  <span className="tabular hidden shrink-0 text-[11px] text-muted-foreground sm:block">
                                    {a.expectedCalvingDate}
                                  </span>
                                )}
                              </Link>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="py-6">
                      <p className="text-[14px] font-medium">{t("assistant.noAnswer")}</p>
                      <p className="mt-1 text-[12.5px] text-muted-foreground">
                        {t("assistant.noAnswerHint")}
                      </p>
                    </div>
                  )}
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>

      {/* ------------------------------ Insights ----------------------------- */}
      <div className="mt-5 flex items-center gap-2">
        <Lightbulb className="size-4 text-[var(--warning)]" />
        <h3 className="text-[15px] font-semibold">{t("assistant.insights")}</h3>
        <Badge variant="secondary" className="tabular">
          {formatNumber(insights.length)}
        </Badge>
      </div>

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        className="mt-3 grid gap-3 lg:grid-cols-2"
      >
        {insights.map((insight) => {
          const Icon = CATEGORY_ICON[insight.category] ?? Sparkles;
          return (
            <motion.div key={insight.id} variants={cardIn}>
              <Card
                className={cn(
                  "h-full",
                  insight.severity === "critical" && "border-destructive/30",
                  insight.severity === "warning" && "border-[color-mix(in_oklab,var(--warning)_35%,transparent)]",
                )}
              >
                <div className="flex items-start gap-3 px-5 pb-2 pt-4">
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                      insight.severity === "critical"
                        ? "bg-destructive/12 text-destructive"
                        : insight.severity === "warning"
                          ? "bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] text-[var(--warning)]"
                          : "bg-primary/12 text-primary",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="leading-snug">
                      {locale === "ar" ? insight.titleAr : insight.title}
                    </CardTitle>
                    <CardDescription className="mt-0.5">
                      {t(`nav.${insight.category === "milk" ? "milk" : insight.category === "finance" ? "finance" : insight.category === "inventory" ? "inventory" : insight.category === "feed" ? "feed" : insight.category === "breeding" ? "breeding" : "health"}` as never)}
                    </CardDescription>
                  </div>
                </div>

                <CardContent>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    {locale === "ar" ? insight.bodyAr : insight.body}
                  </p>

                  <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {locale === "ar" ? "الحساب" : "Evidence"}
                    </p>
                    <p className="tabular mt-0.5 text-[11.5px] leading-relaxed">{insight.evidence}</p>
                  </div>

                  {insight.action && (
                    <p className="mt-3 flex items-start gap-2 text-[12.5px] font-medium">
                      <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary rtl:-scale-x-100" />
                      {locale === "ar" ? insight.actionAr : insight.action}
                    </p>
                  )}

                  {insight.href && (
                    <Button variant="outline" size="sm" className="mt-3" asChild>
                      <Link href={insight.href}>{t("common.view")}</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </>
  );
}
