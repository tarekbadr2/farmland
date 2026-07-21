/**
 * The farm advisor.
 *
 * Two jobs: (1) generate insights nobody asked for but everybody needs, and
 * (2) answer plain-language questions about the herd. Both run entirely on the
 * client over the loaded dataset — deterministic, explainable, and instant.
 *
 * In production this same rule set runs in a Cloud Function on a schedule, and
 * an LLM sits in front of `answerQuery` to widen phrasing coverage. The rules
 * stay: an advisor that cannot show its arithmetic doesn't get trusted twice.
 */

import { addDays, diffDays, monthKey } from "@/lib/date";
import { average, groupBy, pct, round, sum } from "@/lib/utils";
import {
  breedingMetrics,
  financeMetrics,
  growthMetrics,
  healthMetrics,
  herdComposition,
  inventoryMetrics,
  meatMetrics,
  milkSummary,
} from "@/core/services/metrics";
import type {
  Animal,
  BreedingEvent,
  DailyMilkPoint,
  FeedItem,
  HealthEvent,
  InventoryItem,
  Transaction,
  WeatherNow,
  Zone,
} from "@/core/domain/types";

export interface Insight {
  id: string;
  severity: "info" | "warning" | "critical";
  category: "milk" | "health" | "breeding" | "feed" | "inventory" | "weather" | "finance";
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  /** The arithmetic behind the claim, so a manager can argue with it. */
  evidence: string;
  action?: string;
  actionAr?: string;
  href?: string;
  animalIds?: string[];
}

export interface AdvisorContext {
  animals: Animal[];
  milkDaily: DailyMilkPoint[];
  health: HealthEvent[];
  breeding: BreedingEvent[];
  feedItems: FeedItem[];
  inventory: InventoryItem[];
  transactions: Transaction[];
  weather?: WeatherNow;
  zones: Zone[];
  today: string;
}

/* -------------------------------------------------------------------------- */
/*                                  Insights                                  */
/* -------------------------------------------------------------------------- */

export function generateInsights(ctx: AdvisorContext): Insight[] {
  const out: Insight[] = [];
  const { animals, milkDaily, health, inventory, weather, today, zones } = ctx;

  /* --- Individual yield drops: the earliest signal of a sick cow ---------- */
  const droppers = animals
    .filter((a) => a.milkStatus === "lactating" && a.avgDailyMilkL > 0)
    .map((a) => {
      // Expected yield for the peer group at the same stage of lactation.
      const peers = animals.filter(
        (p) =>
          p.milkStatus === "lactating" &&
          p.lactationNumber === a.lactationNumber &&
          p.id !== a.id,
      );
      const peerAvg = average(peers.map((p) => p.avgDailyMilkL)) || a.avgDailyMilkL;
      const dropPct = round(((peerAvg - a.avgDailyMilkL) / peerAvg) * 100, 1);
      return { animal: a, dropPct, peerAvg };
    })
    .filter((d) => d.dropPct >= 18)
    .sort((a, b) => b.dropPct - a.dropPct);

  if (droppers.length) {
    const worst = droppers[0];
    out.push({
      id: "insight_yield_drop",
      severity: "warning",
      category: "milk",
      title: `${droppers.length} animals producing well below their peer group`,
      titleAr: `${droppers.length} حيوان إنتاجه أقل بكثير من مثيلاته`,
      body: `${worst.animal.tag} is down ${worst.dropPct}% against lactation-${worst.animal.lactationNumber} peers. A drop this size usually means subclinical mastitis, lameness or a feed-access problem before it means genetics.`,
      bodyAr: `${worst.animal.tag} أقل بنسبة ${worst.dropPct}% من مثيلاتها في الموسم ${worst.animal.lactationNumber}. هذا الانخفاض غالبًا التهاب ضرع تحت سريري أو عرج أو مشكلة وصول للعلف.`,
      evidence: `Peer mean ${round(worst.peerAvg, 1)} L/day vs ${worst.animal.avgDailyMilkL} L/day observed.`,
      action: "Run a California Mastitis Test on the flagged animals at the next milking.",
      actionAr: "أجرِ اختبار CMT على الحيوانات المحددة في الحلبة القادمة.",
      href: `/animal?id=${worst.animal.id}`,
      animalIds: droppers.slice(0, 12).map((d) => d.animal.id),
    });
  }

  /* --- Disease clustering by pen ----------------------------------------- */
  const recent = health.filter(
    (h) => h.type === "diagnosis" && diffDays(today, h.date) <= 21 && diffDays(today, h.date) >= 0,
  );
  const byPen = groupBy(
    recent
      .map((h) => ({ h, pen: animals.find((a) => a.id === h.animalId)?.penId }))
      .filter((x) => x.pen) as { h: HealthEvent; pen: string }[],
    (x) => x.pen,
  );
  Object.entries(byPen).forEach(([penId, cases]) => {
    const penAnimals = animals.filter((a) => a.penId === penId).length;
    if (!penAnimals) return;
    const rate = pct(cases.length, penAnimals);
    if (cases.length >= 4 && rate > 6) {
      const zone = zones.find((z) => z.id === penId);
      const dominant = groupBy(cases, (c) => c.h.disease ?? "other");
      const topDisease = Object.entries(dominant).sort((a, b) => b[1].length - a[1].length)[0];
      out.push({
        id: `insight_cluster_${penId}`,
        severity: "critical",
        category: "health",
        title: `Disease cluster forming in ${zone?.name ?? penId}`,
        titleAr: `تجمع حالات مرضية في ${zone?.nameAr ?? penId}`,
        body: `${cases.length} clinical cases in 21 days across ${penAnimals} head — ${round(rate, 1)}% of the pen, mostly ${topDisease[0].replace(/_/g, " ")}. Above 5% in three weeks the pattern is environmental, not individual.`,
        bodyAr: `${cases.length} حالة خلال ٢١ يومًا من ${penAnimals} رأس — ${round(rate, 1)}% من الحظيرة. فوق ٥٪ يكون السبب بيئيًا لا فرديًا.`,
        evidence: `${cases.length}/${penAnimals} = ${round(rate, 1)}% incidence, 21-day window.`,
        action: "Inspect bedding dryness, water trough hygiene and stocking density in this pen today.",
        actionAr: "افحص جفاف الفرشة ونظافة أحواض الشرب وكثافة الحيوانات في هذه الحظيرة اليوم.",
        href: "/health",
      });
    }
  });

  /* --- Heat stress -------------------------------------------------------- */
  if (weather && weather.thi >= 78) {
    const severe = weather.thi >= 84;
    const expectedDrop = severe ? 9 : 5;
    const todayMilk = milkDaily[milkDaily.length - 1]?.totalL ?? 0;
    out.push({
      id: "insight_heat",
      severity: severe ? "critical" : "warning",
      category: "weather",
      title: `Heat stress: THI ${weather.thi} — expect ~${expectedDrop}% less milk`,
      titleAr: `إجهاد حراري: المؤشر ${weather.thi} — متوقع انخفاض ${expectedDrop}٪ في اللبن`,
      body: `Buffalo start losing yield above THI 78 and dry-matter intake falls before the milk does. At today's ${Math.round(todayMilk).toLocaleString()} L baseline that is roughly ${Math.round((todayMilk * expectedDrop) / 100).toLocaleString()} L at risk.`,
      bodyAr: `يبدأ الجاموس بفقد الإنتاج فوق مؤشر ٧٨، وينخفض استهلاك المادة الجافة قبل اللبن. الخطر اليوم حوالي ${Math.round((todayMilk * expectedDrop) / 100).toLocaleString()} لتر.`,
      evidence: `THI = 0.8·T + (RH/100)·(T−14.4) + 46.4 → ${weather.thi} at ${weather.temperatureC}°C / ${weather.humidityPct}% RH.`,
      action: "Run fans and misters from 10:00, shift the concentrate feed to after 18:00, check water flow rates.",
      actionAr: "شغّل المراوح والرذاذ من الساعة ١٠، وأجّل العلف المركز لما بعد ٦ مساءً، وتأكد من تدفق المياه.",
      href: "/analytics",
    });
  }

  /* --- Feed efficiency drift ---------------------------------------------- */
  const last14 = milkDaily.slice(-14);
  const prev14 = milkDaily.slice(-28, -14);
  const avgNow = average(last14.map((d) => d.totalL / Math.max(1, d.milkingCows)));
  const avgPrev = average(prev14.map((d) => d.totalL / Math.max(1, d.milkingCows)));
  const change = avgPrev ? round(((avgNow - avgPrev) / avgPrev) * 100, 1) : 0;
  if (change <= -4) {
    out.push({
      id: "insight_efficiency",
      severity: "warning",
      category: "feed",
      title: `Yield per cow down ${Math.abs(change)}% over two weeks`,
      titleAr: `إنتاج الرأس انخفض ${Math.abs(change)}٪ خلال أسبوعين`,
      body: "A fortnight-scale drop that isn't explained by the calving pattern usually traces back to the ration: silage face spoilage, a changed concentrate batch, or sorting at the feed bunk.",
      bodyAr: "الانخفاض على مدى أسبوعين وغير المبرر بنمط الولادات يعود عادة إلى الخلطة: تلف واجهة السيلاج أو تغير تشغيلة المركزات أو فرز العلف.",
      evidence: `${round(avgPrev, 2)} → ${round(avgNow, 2)} L/cow/day across 28 days.`,
      action: "Re-weigh the TMR mix and pull a fresh silage sample for dry-matter testing.",
      actionAr: "أعد وزن مكونات الخلطة وخذ عينة سيلاج جديدة لفحص المادة الجافة.",
      href: "/feed",
    });
  }

  /* --- Vaccination batching ------------------------------------------------ */
  const dueVac = health.filter(
    (h) =>
      h.type === "vaccination" &&
      h.nextDueDate &&
      diffDays(h.nextDueDate, today) >= 0 &&
      diffDays(h.nextDueDate, today) <= 14,
  );
  if (dueVac.length >= 5) {
    out.push({
      id: "insight_vaccination",
      severity: "info",
      category: "health",
      title: `Batch ${dueVac.length} vaccinations into one session`,
      titleAr: `اجمع ${dueVac.length} تحصينًا في جلسة واحدة`,
      body: "These fall due within 14 days of each other. One handling session instead of several cuts labour and, more importantly, cuts the stress-related yield dip that follows every restraint.",
      bodyAr: "تستحق كلها خلال ١٤ يومًا. جلسة واحدة بدل عدة جلسات توفر العمالة وتقلل انخفاض الإنتاج الناتج عن التوتر.",
      evidence: `${dueVac.length} doses due between ${today} and ${addDays(today, 14)}.`,
      action: "Schedule a single vaccination round and pre-pull the doses from the clinic fridge.",
      actionAr: "حدد جولة تحصين واحدة وجهّز الجرعات من ثلاجة العيادة.",
      href: "/health",
      animalIds: dueVac.map((v) => v.animalId),
    });
  }

  /* --- Expiring medicine --------------------------------------------------- */
  const expiring = inventory.filter(
    (i) =>
      i.expiresAt &&
      diffDays(i.expiresAt, today) >= 0 &&
      diffDays(i.expiresAt, today) <= 30 &&
      i.stock > 0,
  );
  if (expiring.length) {
    const value = sum(expiring.map((i) => i.stock * i.unitCost));
    out.push({
      id: "insight_expiry",
      severity: "warning",
      category: "inventory",
      title: `${expiring.length} medicines expire within 30 days`,
      titleAr: `${expiring.length} دواء ينتهي خلال ٣٠ يومًا`,
      body: `${Math.round(value).toLocaleString()} EGP of stock is about to become waste. Move these to the front of the shelf and use them first where clinically appropriate.`,
      bodyAr: `مخزون بقيمة ${Math.round(value).toLocaleString()} جنيه على وشك أن يصبح هالكًا. ضعها في مقدمة الرف واستخدمها أولًا.`,
      evidence: expiring.map((i) => `${i.name} (${i.expiresAt})`).join(", "),
      action: "Print the use-first list for the clinic.",
      actionAr: "اطبع قائمة الاستخدام أولًا للعيادة.",
      href: "/inventory",
    });
  }

  /* --- Low stock ----------------------------------------------------------- */
  const low = inventory.filter((i) => i.stock <= i.reorderLevel);
  if (low.length) {
    out.push({
      id: "insight_low_stock",
      severity: low.some((i) => i.category === "medicine") ? "warning" : "info",
      category: "inventory",
      title: `${low.length} items below reorder level`,
      titleAr: `${low.length} صنف تحت حد إعادة الطلب`,
      body: low
        .slice(0, 4)
        .map((i) => `${i.name}: ${i.stock}/${i.reorderLevel} ${i.unit}`)
        .join(" · "),
      bodyAr: low.slice(0, 4).map((i) => `${i.nameAr}: ${i.stock}/${i.reorderLevel}`).join(" · "),
      evidence: `${low.length} SKUs at or under their reorder threshold.`,
      action: "Approve the suggested purchase order.",
      actionAr: "اعتمد أمر الشراء المقترح.",
      href: "/inventory",
    });
  }

  /* --- Calving preparation ------------------------------------------------- */
  const dueSoon = animals.filter(
    (a) =>
      a.expectedCalvingDate &&
      diffDays(a.expectedCalvingDate, today) >= 0 &&
      diffDays(a.expectedCalvingDate, today) <= 5,
  );
  if (dueSoon.length) {
    out.push({
      id: "insight_calving",
      severity: "info",
      category: "breeding",
      title: `${dueSoon.length} calvings expected within 5 days`,
      titleAr: `${dueSoon.length} ولادة متوقعة خلال ٥ أيام`,
      body: `Move ${dueSoon.map((a) => a.tag).slice(0, 6).join(", ")} to the maternity pen now. Colostrum quality in the first six hours sets the calf's immunity for its whole first year.`,
      bodyAr: `انقل ${dueSoon.map((a) => a.tag).slice(0, 6).join("، ")} إلى حظيرة الولادة الآن. جودة اللبأ في أول ٦ ساعات تحدد مناعة العجل طوال عامه الأول.`,
      evidence: `Gestation 310 days from recorded service dates.`,
      action: "Prepare the maternity pen and thaw a colostrum reserve.",
      actionAr: "جهّز حظيرة الولادة وأذب احتياطي اللبأ.",
      href: "/breeding",
      animalIds: dueSoon.map((a) => a.id),
    });
  }

  const order = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* -------------------------------------------------------------------------- */
/*                             Natural language query                         */
/* -------------------------------------------------------------------------- */

export interface QueryAnswer {
  summary: string;
  summaryAr: string;
  animals?: Animal[];
  metric?: { label: string; labelAr: string; value: string };
  matched: boolean;
  /** Where the answer came from — the LLM advisor or the deterministic rules. */
  source?: "ai" | "rules";
}

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

export function answerQuery(query: string, ctx: AdvisorContext): QueryAnswer {
  const q = query.trim().toLowerCase();
  const { animals, milkDaily, health, transactions, today } = ctx;
  const female = animals.filter((a) => a.sex === "female" && !a.isCalf);

  if (!q) return { summary: "", summaryAr: "", matched: false };

  /* Pregnant / due ------------------------------------------------------- */
  if (has(q, "pregnant", "due", "calving", "عشار", "ولادة", "حامل")) {
    const nextMonth = has(q, "next month", "الشهر القادم", "الشهر القادمة");
    const week = has(q, "week", "أسبوع");
    const horizon = week ? 7 : nextMonth ? 60 : 30;
    const from = nextMonth ? 30 : 0;
    const list = animals
      .filter((a) => {
        if (!a.expectedCalvingDate) return false;
        const d = diffDays(a.expectedCalvingDate, today);
        return d >= from && d <= horizon;
      })
      .sort((a, b) => a.expectedCalvingDate!.localeCompare(b.expectedCalvingDate!));
    return {
      matched: true,
      animals: list,
      summary: `${list.length} pregnant animals are due between ${addDays(today, from)} and ${addDays(today, horizon)}.`,
      summaryAr: `${list.length} حيوان عشار متوقع ولادته بين ${addDays(today, from)} و ${addDays(today, horizon)}.`,
    };
  }

  /* Weight loss ----------------------------------------------------------- */
  if (has(q, "lost weight", "losing weight", "thin", "body condition", "فقد وزن", "نحيف", "الوزن")) {
    const list = animals
      .filter((a) => a.bodyConditionScore <= 2.8 && !a.isCalf)
      .sort((a, b) => a.bodyConditionScore - b.bodyConditionScore);
    return {
      matched: true,
      animals: list,
      summary: `${list.length} animals are at or below body condition score 2.8 — thin enough to hurt fertility and yield.`,
      summaryAr: `${list.length} حيوان بحالة جسم ٢.٨ أو أقل — نحافة تؤثر على الخصوبة والإنتاج.`,
    };
  }

  /* Highest lifetime production -------------------------------------------- */
  if (has(q, "lifetime", "highest", "best producer", "top produc", "أعلى", "إنتاج العمر")) {
    const list = [...animals]
      .filter((a) => a.lifetimeMilkL > 0)
      .sort((a, b) => b.lifetimeMilkL - a.lifetimeMilkL)
      .slice(0, 25);
    return {
      matched: true,
      animals: list,
      summary: `Top ${list.length} animals by lifetime production. ${list[0]?.tag} leads with ${list[0]?.lifetimeMilkL.toLocaleString()} L across ${list[0]?.lactationNumber} lactations.`,
      summaryAr: `أعلى ${list.length} حيوانًا في إنتاج العمر. ${list[0]?.tag} في المقدمة بـ ${list[0]?.lifetimeMilkL.toLocaleString()} لتر.`,
    };
  }

  /* Sick / treatment ------------------------------------------------------- */
  if (has(q, "sick", "treatment", "mastitis", "ill", "مريض", "علاج", "التهاب")) {
    const activeIds = new Set(health.filter((h) => h.outcome === "ongoing").map((h) => h.animalId));
    const list = animals.filter((a) => activeIds.has(a.id));
    return {
      matched: true,
      animals: list,
      summary: `${list.length} animals are under active treatment right now.`,
      summaryAr: `${list.length} حيوان تحت العلاج النشط حاليًا.`,
    };
  }

  /* Dry cows ---------------------------------------------------------------- */
  if (has(q, "dry", "جاف")) {
    const list = animals.filter((a) => a.milkStatus === "dry");
    return {
      matched: true,
      animals: list,
      summary: `${list.length} animals are dry.`,
      summaryAr: `${list.length} حيوان في فترة الجفاف.`,
    };
  }

  /* Milk totals ------------------------------------------------------------- */
  if (has(q, "milk", "production", "yield", "لبن", "حليب", "إنتاج")) {
    const todayPoint = milkDaily[milkDaily.length - 1];
    const month = milkDaily.filter((d) => monthKey(d.date) === monthKey(today));
    return {
      matched: true,
      metric: {
        label: "Milk today",
        labelAr: "لبن اليوم",
        value: `${Math.round(todayPoint?.totalL ?? 0).toLocaleString()} L`,
      },
      summary: `Today: ${Math.round(todayPoint?.totalL ?? 0).toLocaleString()} L from ${todayPoint?.milkingCows ?? 0} milking animals (${round((todayPoint?.totalL ?? 0) / Math.max(1, todayPoint?.milkingCows ?? 1), 2)} L/head). Month to date: ${Math.round(sum(month.map((d) => d.totalL))).toLocaleString()} L.`,
      summaryAr: `اليوم: ${Math.round(todayPoint?.totalL ?? 0).toLocaleString()} لتر من ${todayPoint?.milkingCows ?? 0} رأس. الشهر حتى الآن: ${Math.round(sum(month.map((d) => d.totalL))).toLocaleString()} لتر.`,
    };
  }

  /* Money ------------------------------------------------------------------- */
  if (has(q, "profit", "revenue", "cost", "expense", "ربح", "إيراد", "مصروف", "تكلفة")) {
    const month = transactions.filter((x) => monthKey(x.date) === monthKey(today));
    const inc = sum(month.filter((x) => x.kind === "income").map((x) => x.amount));
    const exp = sum(month.filter((x) => x.kind === "expense").map((x) => x.amount));
    return {
      matched: true,
      metric: {
        label: "Profit month to date",
        labelAr: "ربح الشهر حتى الآن",
        value: `${Math.round(inc - exp).toLocaleString()} EGP`,
      },
      summary: `Month to date: ${Math.round(inc).toLocaleString()} EGP in, ${Math.round(exp).toLocaleString()} EGP out — net ${Math.round(inc - exp).toLocaleString()} EGP (${round(((inc - exp) / Math.max(1, inc)) * 100, 1)}% margin).`,
      summaryAr: `الشهر حتى الآن: ${Math.round(inc).toLocaleString()} إيرادات و ${Math.round(exp).toLocaleString()} مصروفات — الصافي ${Math.round(inc - exp).toLocaleString()} جنيه.`,
    };
  }

  /* Open / not pregnant ------------------------------------------------------ */
  if (has(q, "open", "not pregnant", "empty", "فارغ", "غير حامل")) {
    const list = female.filter((a) => a.reproStatus === "open");
    return {
      matched: true,
      animals: list,
      summary: `${list.length} females are open — ${round(pct(list.length, female.length), 1)}% of the breeding herd.`,
      summaryAr: `${list.length} أنثى فارغة — ${round(pct(list.length, female.length), 1)}% من قطيع التربية.`,
    };
  }

  /* Fallback: tag lookup ------------------------------------------------------ */
  const byTag = animals.filter((a) =>
    `${a.tag} ${a.name} ${a.nameAr} ${a.rfid}`.toLowerCase().includes(q),
  );
  if (byTag.length) {
    return {
      matched: true,
      animals: byTag.slice(0, 40),
      summary: `${byTag.length} animals match “${query}”.`,
      summaryAr: `${byTag.length} حيوان مطابق لـ «${query}».`,
    };
  }

  return { matched: false, summary: "", summaryAr: "" };
}

/* -------------------------------------------------------------------------- */
/*                          Compact brief for the LLM                          */
/* -------------------------------------------------------------------------- */

/**
 * A dense, plain-text snapshot of the whole farm — the context an LLM advisor
 * reads before answering. It is the SAME arithmetic the dashboard and analytics
 * pages show, flattened into labelled lines, so the model and the UI can never
 * disagree. Kept to a few hundred tokens: aggregates only, never the row-level
 * herd (that would blow the context and teach the model to hallucinate tags).
 * The model is told to answer from this and nothing else.
 */
export function buildAdvisorBrief(ctx: AdvisorContext): string {
  const { animals, milkDaily, health, breeding, inventory, transactions, weather, today } = ctx;

  const herd = herdComposition(animals);
  const milk = milkSummary(milkDaily, today);
  const milkL30 = milk.avg30 * 30;
  const breed = breedingMetrics(breeding, animals, today);
  const hlth = healthMetrics(health, animals, today);
  const fin = financeMetrics(transactions, today, milkL30);
  const inv = inventoryMetrics(inventory, today);
  const meat = meatMetrics(animals, transactions, today);
  const growth = growthMetrics(animals, today);

  const money = (n: number) => `EGP ${Math.round(n).toLocaleString("en-US")}`;
  const L = (n: number) => `${Math.round(n).toLocaleString("en-US")} L`;

  const lines = [
    `DATE: ${today}`,
    weather
      ? `WEATHER: ${weather.temperatureC}°C, humidity ${weather.humidityPct}%, THI ${weather.thi} (${weather.heatStress} heat stress).`
      : null,
    "",
    "HERD:",
    `  Live head ${herd.total}: ${herd.lactating} lactating, ${herd.dry} dry, ${herd.heifers} heifers, ${herd.pregnant} pregnant, ${herd.calves} calves, ${herd.bulls} bulls.`,
    `  Health: avg score ${herd.avgHealthScore}/100, ${herd.healthyPct}% healthy, avg body condition ${herd.avgBcs}/5, ${herd.quarantine} in quarantine.`,
    `  Herd valuation ${money(herd.herdValue)}.`,
    "",
    "MILK (per day unless noted):",
    `  Today ${L(milk.today)} from ${milk.milkingCows} cows (${milk.perCowToday} L/cow).`,
    `  30-day average ${L(milk.avg30)}/day, trend ${milk.deltaPct >= 0 ? "+" : ""}${milk.deltaPct}% vs prior 30 days.`,
    `  This month ${L(milk.monthTotal)} total. Fat ${milk.avgFat}%, protein ${milk.avgProtein}%. Rejected 30d ${L(milk.rejected30)}.`,
    "",
    "BREEDING (rolling 12 months):",
    `  ${breed.inseminations} services, conception rate ${breed.conceptionRate}%, ${breed.servicesPerConception} services/conception.`,
    `  ${breed.calvings} calvings, ${breed.abortions} abortions (${breed.abortionRate}% of calvings), calf survival ${breed.calfSurvival}%.`,
    `  Pregnancy rate ${breed.pregnancyRate}%. Due this week ${breed.dueThisWeek}, this month ${breed.dueThisMonth}.`,
    "",
    "HEALTH:",
    `  ${hlth.activeCases} active cases (${hlth.isolated} isolated), ${hlth.withdrawalActive} animals in drug withdrawal.`,
    `  ${hlth.dueVaccinations} vaccinations due within 30 days. 90-day incidence ${hlth.incidenceRate90}%, treatment cost ${money(hlth.treatmentCost90)}.`,
    hlth.topDiseases.length
      ? `  Top conditions: ${hlth.topDiseases.slice(0, 4).map((d) => `${d.disease} (${d.count})`).join(", ")}.`
      : null,
    "",
    "MEAT / GROWTH (weights ESTIMATED — not weighed at sale):",
    `  ${meat.headSold} head sold in 12 months, ${money(meat.revenue)} revenue, ~${meat.carcassKg} kg carcass at ${meat.dressingPct}% dressing.`,
    `  Growing stock ${growth.growingCount} head, avg daily gain ${growth.avgADG} kg/day (calves ${growth.calves.adg}, yearlings ${growth.yearlings.adg}).`,
    "",
    "FINANCE (this month):",
    `  Revenue ${money(fin.revenue)} (${fin.revenueDelta >= 0 ? "+" : ""}${fin.revenueDelta}%), expenses ${money(fin.expenses)}, profit ${money(fin.profit)} (${fin.margin}% margin).`,
    `  Cost per litre ${fin.costPerLiter} EGP.`,
    "",
    "INVENTORY:",
    `  Stock value ${money(inv.stockValue)}. ${inv.lowStock.length} items low, ${inv.expiring.length} expiring within 30 days, ${inv.expired.length} expired.`,
    inv.lowStock.length
      ? `  Low: ${inv.lowStock.slice(0, 6).map((i) => i.name).join(", ")}.`
      : null,
  ];

  return lines.filter((l) => l !== null).join("\n");
}

export const SUGGESTED_QUERIES = [
  { en: "Show pregnant buffalo due next month", ar: "اعرض الجاموس العشار المتوقع ولادته الشهر القادم" },
  { en: "Which animals lost weight?", ar: "أي الحيوانات فقدت وزنًا؟" },
  { en: "Show buffalo with highest lifetime production", ar: "اعرض الجاموس الأعلى في إنتاج العمر" },
  { en: "Which animals are sick right now?", ar: "أي الحيوانات مريضة الآن؟" },
  { en: "How much milk did we produce today?", ar: "كم أنتجنا من اللبن اليوم؟" },
  { en: "What is this month's profit?", ar: "كم ربح هذا الشهر؟" },
];
