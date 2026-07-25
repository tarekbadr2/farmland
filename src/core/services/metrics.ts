/**
 * Pure derivation layer. No React, no I/O — just herd arithmetic.
 * Kept separate so the same numbers can be reused by Cloud Functions,
 * scheduled reports and the AI advisor without duplicating logic.
 */

import { addDays, diffDays, monthKey } from "@/lib/date";
import { average, groupBy, pct, round, sum } from "@/lib/utils";
import type {
  Alert,
  Animal,
  Asset,
  Attendance,
  BreedingEvent,
  DailyMilkPoint,
  Employee,
  FarmTask,
  FeedConsumption,
  FeedItem,
  FeedRation,
  HealthEvent,
  InventoryItem,
  Transaction,
  UtilityReading,
} from "@/core/domain/types";

/* --------------------------------- Herd ---------------------------------- */

export function herdComposition(animals: Animal[]) {
  const live = animals.filter((a) => a.status === "active" || a.status === "quarantine");
  const lactating = live.filter((a) => a.milkStatus === "lactating");
  const dry = live.filter((a) => a.milkStatus === "dry");
  const calves = live.filter((a) => a.isCalf);
  const bulls = live.filter((a) => a.sex === "male" && !a.isCalf);
  const heifers = live.filter((a) => a.milkStatus === "heifer" && !a.isCalf);
  const pregnant = live.filter((a) => a.reproStatus === "pregnant");
  const healthy = live.filter((a) => a.healthScore >= 75 && a.status === "active");

  return {
    total: live.length,
    lactating: lactating.length,
    dry: dry.length,
    calves: calves.length,
    bulls: bulls.length,
    heifers: heifers.length,
    pregnant: pregnant.length,
    healthy: healthy.length,
    quarantine: live.filter((a) => a.status === "quarantine").length,
    healthyPct: round(pct(healthy.length, live.length), 1),
    avgHealthScore: round(average(live.map((a) => a.healthScore)), 1),
    herdValue: sum(live.map((a) => a.valuation)),
  };
}

/* ---------------------------------- Milk ---------------------------------- */

export function milkSummary(daily: DailyMilkPoint[], today: string) {
  const todayPoint = daily.find((d) => d.date === today) ?? daily[daily.length - 1];
  const last30 = daily.slice(-30);
  const prev30 = daily.slice(-60, -30);
  const thisMonth = daily.filter((d) => monthKey(d.date) === monthKey(today));

  const avg30 = average(last30.map((d) => d.totalL));
  const avgPrev30 = average(prev30.map((d) => d.totalL));

  return {
    today: todayPoint?.totalL ?? 0,
    todayMorning: todayPoint?.morningL ?? 0,
    todayEvening: todayPoint?.eveningL ?? 0,
    perCowToday: todayPoint ? round(todayPoint.totalL / Math.max(1, todayPoint.milkingCows), 2) : 0,
    monthTotal: sum(thisMonth.map((d) => d.totalL)),
    avg30,
    deltaPct: avgPrev30 ? round(((avg30 - avgPrev30) / avgPrev30) * 100, 1) : 0,
    rejected30: sum(last30.map((d) => d.rejectedL)),
    avgFat: round(average(last30.map((d) => d.avgFat)), 2),
    avgProtein: round(average(last30.map((d) => d.avgProtein)), 2),
    milkingCows: todayPoint?.milkingCows ?? 0,
  };
}

export function monthlyMilk(daily: DailyMilkPoint[]) {
  const byMonth = groupBy(daily, (d) => monthKey(d.date));
  return Object.entries(byMonth)
    .map(([month, points]) => ({
      month,
      totalL: round(sum(points.map((p) => p.totalL)), 0),
      avgPerCow: round(average(points.map((p) => p.totalL / Math.max(1, p.milkingCows))), 2),
      rejectedL: round(sum(points.map((p) => p.rejectedL)), 0),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * 14-day forecast: exponential smoothing on the last 45 days, nudged by the
 * heat-stress outlook. Deliberately simple and explainable — a farm manager
 * should be able to argue with it.
 */
export function forecastMilk(daily: DailyMilkPoint[], days = 14, heatPenaltyPct = 0) {
  const recent = daily.slice(-45).map((d) => d.totalL);
  if (!recent.length) return [];
  const alpha = 0.3;
  let level = recent[0];
  let trend = 0;
  for (let i = 1; i < recent.length; i++) {
    const prevLevel = level;
    level = alpha * recent[i] + (1 - alpha) * (level + trend);
    trend = 0.1 * (level - prevLevel) + 0.9 * trend;
  }
  const lastDate = daily[daily.length - 1].date;
  return Array.from({ length: days }, (_, i) => ({
    date: addDays(lastDate, i + 1),
    forecastL: Math.max(0, round((level + trend * (i + 1)) * (1 - heatPenaltyPct / 100), 0)),
  }));
}

/* -------------------------------- Breeding -------------------------------- */

export function breedingMetrics(events: BreedingEvent[], animals: Animal[], today: string) {
  // Rolling 12 months. Lifetime calving counts against this year's services
  // would flatter every rate on the page.
  const window = events.filter((e) => {
    const age = diffDays(today, e.date);
    return age >= 0 && age <= 365;
  });

  const heats = window.filter((e) => e.type === "heat");
  const inseminations = window.filter((e) => e.type === "ai" || e.type === "natural_mating");
  const checks = window.filter((e) => e.type === "pregnancy_check");
  const confirmed = checks.filter((e) => e.result === "pregnant");
  const calvings = window.filter((e) => e.type === "calving");
  const abortions = window.filter((e) => e.type === "abortion");

  const dueSoon = animals
    .filter((a) => a.expectedCalvingDate && diffDays(a.expectedCalvingDate, today) >= 0)
    .sort((a, b) => (a.expectedCalvingDate! < b.expectedCalvingDate! ? -1 : 1));

  const stillbirths = calvings.filter((c) => c.outcome === "stillbirth").length;
  const twins = calvings.filter((c) => c.outcome === "twins").length;

  return {
    heats: heats.length,
    checks: checks.length,
    inseminations: inseminations.length,
    conceptionRate: round(pct(confirmed.length, Math.max(1, inseminations.length)), 1),
    servicesPerConception: round(inseminations.length / Math.max(1, confirmed.length), 2),
    calvings: calvings.length,
    abortions: abortions.length,
    abortionRate: round(pct(abortions.length, Math.max(1, calvings.length)), 1),
    stillbirths,
    twins,
    calfSurvival: round(100 - pct(stillbirths, Math.max(1, calvings.length)), 1),
    dueThisWeek: dueSoon.filter((a) => diffDays(a.expectedCalvingDate!, today) <= 7).length,
    dueThisMonth: dueSoon.filter((a) => diffDays(a.expectedCalvingDate!, today) <= 30).length,
    dueSoon,
    pregnancyRate: round(
      pct(animals.filter((a) => a.reproStatus === "pregnant").length,
        Math.max(1, animals.filter((a) => a.sex === "female" && !a.isCalf).length)),
      1,
    ),
  };
}

/* --------------------------------- Health --------------------------------- */

export function healthMetrics(events: HealthEvent[], animals: Animal[], today: string) {
  const last90 = events.filter((e) => diffDays(today, e.date) <= 90 && diffDays(today, e.date) >= 0);
  const diagnoses = last90.filter((e) => e.type === "diagnosis");
  const active = events.filter((e) => e.outcome === "ongoing");
  const withdrawal = events.filter(
    (e) => e.withdrawalUntil && diffDays(e.withdrawalUntil, today) >= 0,
  );
  const dueVaccinations = events.filter(
    (e) =>
      e.type === "vaccination" &&
      e.nextDueDate &&
      diffDays(e.nextDueDate, today) >= 0 &&
      diffDays(e.nextDueDate, today) <= 30,
  );

  const byDisease = groupBy(
    events.filter((e) => e.disease),
    (e) => e.disease!,
  );

  return {
    activeCases: active.length,
    isolated: active.filter((e) => e.isolation).length,
    withdrawalActive: withdrawal.length,
    dueVaccinations: dueVaccinations.length,
    dueVaccinationList: dueVaccinations,
    incidenceRate90: round(pct(diagnoses.length, Math.max(1, animals.length)), 1),
    treatmentCost90: sum(last90.map((e) => e.cost)),
    topDiseases: Object.entries(byDisease)
      .map(([disease, list]) => ({ disease, count: list.length }))
      .sort((a, b) => b.count - a.count),
  };
}

export function diseaseTrend(events: HealthEvent[], months = 12) {
  const diagnoses = events.filter((e) => e.type === "diagnosis" && e.disease);
  const byMonth = groupBy(diagnoses, (e) => monthKey(e.date));
  const keys = Object.keys(byMonth).sort().slice(-months);
  return keys.map((month) => {
    const list = byMonth[month];
    const counts = groupBy(list, (e) => e.disease!);
    return {
      month,
      total: list.length,
      mastitis: counts.mastitis?.length ?? 0,
      lameness: counts.lameness?.length ?? 0,
      metabolic:
        (counts.ketosis?.length ?? 0) + (counts.milk_fever?.length ?? 0),
      respiratory: counts.pneumonia?.length ?? 0,
      other:
        list.length -
        (counts.mastitis?.length ?? 0) -
        (counts.lameness?.length ?? 0) -
        (counts.ketosis?.length ?? 0) -
        (counts.milk_fever?.length ?? 0) -
        (counts.pneumonia?.length ?? 0),
    };
  });
}

/* ---------------------------------- Feed ---------------------------------- */

export function feedMetrics(
  items: FeedItem[],
  consumption: FeedConsumption[],
  daily: DailyMilkPoint[],
  today: string,
  rations: FeedRation[] = [],
) {
  const last30 = consumption.filter((c) => diffDays(today, c.date) <= 30);
  const kg30 = sum(last30.map((c) => c.kg));
  const cost30 = sum(last30.map((c) => c.cost));
  const milk30 = sum(daily.slice(-30).map((d) => d.totalL));

  // Feed cost per litre is a milking-herd metric. Loading dry cows, heifers and
  // calves onto it makes every dairy look insolvent — youngstock feed is a
  // separate line in any real cost model, so it gets reported separately here.
  const milkingRations = new Set(
    rations.filter((r) => r.targetGroup === "lactating").map((r) => r.id),
  );
  const milkingRows = milkingRations.size
    ? last30.filter((c) => milkingRations.has(c.rationId))
    : last30;
  const milkingKg = sum(milkingRows.map((c) => c.kg));
  const milkingCost = sum(milkingRows.map((c) => c.cost));

  const stockValue = sum(items.map((i) => i.stock * i.costPerUnit));
  const lowStock = items.filter((i) => i.stock <= i.reorderLevel);
  const dailyBurn = kg30 / 30;

  return {
    stockValue,
    lowStock,
    lowStockCount: lowStock.length,
    daysCover: round(
      sum(items.filter((i) => i.unit === "ton").map((i) => i.stock * 1000)) /
        Math.max(1, dailyBurn),
      0,
    ),
    /** kg of feed (as fed) per litre of milk — the number the nutritionist quotes. */
    kgPerLiter: round(milkingKg / Math.max(1, milk30), 2),
    costPerLiter: round(milkingCost / Math.max(1, milk30), 2),
    feedCost30: cost30,
    milkingFeedCost30: milkingCost,
    youngstockFeedCost30: cost30 - milkingCost,
    /** Milk litres produced per kg of feed. */
    conversion: round(milk30 / Math.max(1, milkingKg), 3),
  };
}

export function feedEfficiencySeries(
  consumption: FeedConsumption[],
  daily: DailyMilkPoint[],
  days = 90,
) {
  const byDate = groupBy(consumption, (c) => c.date);
  return daily
    .slice(-days)
    .map((d) => {
      const kg = sum((byDate[d.date] ?? []).map((c) => c.kg));
      return {
        date: d.date,
        kg: round(kg, 0),
        milkL: d.totalL,
        efficiency: kg ? round(d.totalL / kg, 3) : 0,
      };
    })
    .filter((p) => p.kg > 0);
}

/* -------------------------------- Inventory ------------------------------- */

export function inventoryMetrics(items: InventoryItem[], today: string) {
  const lowStock = items.filter((i) => i.stock <= i.reorderLevel);
  const expiring = items.filter(
    (i) => i.expiresAt && diffDays(i.expiresAt, today) >= 0 && diffDays(i.expiresAt, today) <= 30,
  );
  const expired = items.filter((i) => i.expiresAt && diffDays(i.expiresAt, today) < 0);
  const medicineValue = sum(
    items.filter((i) => i.category === "medicine").map((i) => i.stock * i.unitCost),
  );
  return {
    stockValue: sum(items.map((i) => i.stock * i.unitCost)),
    medicineValue,
    lowStock,
    expiring,
    expired,
    reorderSuggestions: lowStock.map((i) => ({
      item: i,
      suggestedQty: Math.max(i.reorderLevel * 2 - i.stock, i.reorderLevel),
      estimatedCost: Math.round(
        Math.max(i.reorderLevel * 2 - i.stock, i.reorderLevel) * i.unitCost,
      ),
    })),
  };
}

/* --------------------------------- Finance -------------------------------- */

export function financeMetrics(txns: Transaction[], today: string, milkL30: number) {
  const thisMonth = txns.filter((t) => monthKey(t.date) === monthKey(today));
  const lastMonthKey = monthKey(addDays(`${monthKey(today)}-01`, -1));
  const lastMonth = txns.filter((t) => monthKey(t.date) === lastMonthKey);

  const rev = (list: Transaction[]) =>
    sum(list.filter((t) => t.kind === "income").map((t) => t.amount));
  const exp = (list: Transaction[]) =>
    sum(list.filter((t) => t.kind === "expense").map((t) => t.amount));

  const revenue = rev(thisMonth);
  const expenses = exp(thisMonth);
  const prevRevenue = rev(lastMonth);
  const prevExpenses = exp(lastMonth);

  return {
    revenue,
    expenses,
    profit: revenue - expenses,
    margin: revenue ? round(((revenue - expenses) / revenue) * 100, 1) : 0,
    revenueDelta: prevRevenue ? round(((revenue - prevRevenue) / prevRevenue) * 100, 1) : 0,
    expenseDelta: prevExpenses ? round(((expenses - prevExpenses) / prevExpenses) * 100, 1) : 0,
    costPerLiter: round(exp(txns.filter((t) => diffDays(today, t.date) <= 30)) / Math.max(1, milkL30), 2),
  };
}

export function monthlyFinance(txns: Transaction[], months = 12) {
  const byMonth = groupBy(txns, (t) => monthKey(t.date));
  return Object.keys(byMonth)
    .sort()
    .slice(-months)
    .map((month) => {
      const list = byMonth[month];
      const income = sum(list.filter((t) => t.kind === "income").map((t) => t.amount));
      const expense = sum(list.filter((t) => t.kind === "expense").map((t) => t.amount));
      return { month, income, expense, profit: income - expense };
    });
}

export function expenseBreakdown(txns: Transaction[], today: string, days = 30) {
  const list = txns.filter((t) => t.kind === "expense" && diffDays(today, t.date) <= days);
  const grouped = groupBy(list, (t) => t.category);
  const total = sum(list.map((t) => t.amount));
  return Object.entries(grouped)
    .map(([category, items]) => ({
      category,
      amount: sum(items.map((i) => i.amount)),
      share: round(pct(sum(items.map((i) => i.amount)), Math.max(1, total)), 1),
    }))
    .sort((a, b) => b.amount - a.amount);
}

/* --------------------------------- People --------------------------------- */

export function labourMetrics(employees: Employee[], attendance: Attendance[], today: string) {
  const active = employees.filter((e) => e.active);
  const todayRecords = attendance.filter((a) => a.date === today);
  const last30 = attendance.filter((a) => diffDays(today, a.date) <= 30);
  return {
    headcount: active.length,
    onShiftToday: todayRecords.filter((a) => a.status === "present" || a.status === "late").length,
    absentToday: todayRecords.filter((a) => a.status === "absent").length,
    attendanceRate: round(
      pct(last30.filter((a) => a.status === "present").length, Math.max(1, last30.length)),
      1,
    ),
    payroll: sum(active.map((e) => e.monthlySalary)),
    avgPerformance: round(average(active.map((e) => e.performanceScore)), 1),
    overtimeHours: round(sum(last30.map((a) => a.overtimeHours)), 1),
    safetyIncidents: sum(employees.map((e) => e.safetyIncidents)),
  };
}

/* ---------------------------------- Tasks --------------------------------- */

export function taskMetrics(tasks: FarmTask[], today: string) {
  const todays = tasks.filter((t) => t.dueAt.startsWith(today));
  const done = todays.filter((t) => t.status === "done");
  const overdue = tasks.filter(
    (t) => t.status !== "done" && t.dueAt.slice(0, 10) < today,
  );
  return {
    today: todays,
    todayCount: todays.length,
    doneCount: done.length,
    completionRate: round(pct(done.length, Math.max(1, todays.length)), 0),
    overdue,
    missed: tasks.filter((t) => t.status === "missed").length,
  };
}

/* ------------------------------- Sustainability ---------------------------- */

export function sustainabilityMetrics(
  utilities: UtilityReading[],
  daily: DailyMilkPoint[],
  animals: Animal[],
) {
  const last30 = utilities.slice(-30);
  const milk30 = sum(daily.slice(-30).map((d) => d.totalL));
  const co2 = sum(last30.map((u) => u.co2eKg));
  return {
    waterM3: round(sum(last30.map((u) => u.waterM3)), 0),
    waterPerHead: round(sum(last30.map((u) => u.waterM3)) * 1000 / 30 / Math.max(1, animals.length), 0),
    electricityKwh: round(sum(last30.map((u) => u.electricityKwh)), 0),
    kwhPerLiter: round(sum(last30.map((u) => u.electricityKwh)) / Math.max(1, milk30), 3),
    dieselL: round(sum(last30.map((u) => u.dieselL)), 0),
    outageMinutes: sum(last30.map((u) => u.outageMinutes)),
    co2eKg: round(co2, 0),
    co2PerLiter: round(co2 / Math.max(1, milk30), 2),
  };
}

/* --------------------------------- Mortality ------------------------------ */

export function mortalitySeries(animals: Animal[], months = 12) {
  // Deaths are modelled from status + a stable hash so the series is smooth.
  const dead = animals.filter((a) => a.status === "dead");
  const byMonth = groupBy(dead, (a) => monthKey(a.dateOfBirth));
  return Object.keys(byMonth)
    .sort()
    .slice(-months)
    .map((month) => ({ month, deaths: byMonth[month].length }));
}

/* ----------------------------- Meat & growth ----------------------------- */

/** Buffalo carcass yield off live weight — the industry dressing percentage. */
const DRESSING_PCT = 0.52;
/** Typical buffalo calf birth weight, the baseline for lifetime daily gain. */
const CALF_BIRTH_KG = 38;

/**
 * Meat production, driven by the animal-sales that actually hit the ledger.
 *
 * Each animal-sale transaction is one head off to slaughter or trade — that's
 * the event the farm records in money. Live weight isn't captured per sale, so
 * it's estimated from the herd's own mature average (a sold animal weighs about
 * what the grown animals on the farm weigh); carcass weight then applies the
 * dressing percentage. Revenue is real, weights are modelled — and the comment
 * says so, because a number that looks measured but isn't is worse than one
 * that's honestly an estimate.
 */
export function meatMetrics(animals: Animal[], txns: Transaction[], today: string, days = 365) {
  const from = addDays(today, -days);
  const sales = txns.filter(
    (t) => t.kind === "income" && t.category === "animal_sales" && t.date >= from,
  );
  const headSold = sales.length;
  const revenue = sum(sales.map((t) => t.amount));

  const matureWeights = animals
    .filter((a) => !a.isCalf && a.status !== "dead" && a.weightKg > 0)
    .map((a) => a.weightKg);
  const avgLiveKg = matureWeights.length ? average(matureWeights) : 550;

  const liveWeightKg = round(headSold * avgLiveKg, 0);
  const carcassKg = round(liveWeightKg * DRESSING_PCT, 0);

  return {
    headSold,
    liveWeightKg,
    carcassKg,
    dressingPct: Math.round(DRESSING_PCT * 100),
    revenue,
    avgCarcassKg: round(avgLiveKg * DRESSING_PCT, 0),
    avgPricePerKgLive: liveWeightKg > 0 ? round(revenue / liveWeightKg, 1) : 0,
  };
}

/** Monthly animal-sales revenue and head count — the meat-offtake trend. */
export function monthlyMeat(txns: Transaction[], months = 12) {
  const sales = txns.filter((t) => t.kind === "income" && t.category === "animal_sales");
  const byMonth = groupBy(sales, (t) => monthKey(t.date));
  return Object.keys(byMonth)
    .sort()
    .slice(-months)
    .map((month) => ({
      month,
      revenue: round(sum(byMonth[month].map((t) => t.amount)), 0),
      head: byMonth[month].length,
    }));
}

/**
 * Daily weight gain across the growing stock.
 *
 * ADG is lifetime average — (current weight − birth weight) ÷ age in days —
 * which is the number that actually matters for a fattening operation. Mature
 * animals are excluded: their weight is stable, so their "gain" is noise that
 * would drag the average down and hide how the young stock are really doing.
 */
export function growthMetrics(animals: Animal[], today: string) {
  const live = animals.filter((a) => a.status === "active" || a.status === "quarantine");
  const adgOf = (a: Animal) =>
    (a.weightKg - CALF_BIRTH_KG) / Math.max(1, diffDays(today, a.dateOfBirth));

  // Under two years and above birth weight — animals still putting on frame.
  const growing = live.filter(
    (a) => diffDays(today, a.dateOfBirth) < 730 && a.weightKg > CALF_BIRTH_KG,
  );

  const group = (min: number, max: number) => {
    const list = growing.filter((a) => {
      const age = diffDays(today, a.dateOfBirth);
      return age >= min && age < max;
    });
    return {
      count: list.length,
      adg: list.length ? round(average(list.map(adgOf)), 3) : 0,
    };
  };

  // Average weight by age-in-months — the growth curve.
  const byAgeMonth = groupBy(growing, (a) =>
    String(Math.floor(diffDays(today, a.dateOfBirth) / 30)),
  );
  const weightForAge = Object.keys(byAgeMonth)
    .map(Number)
    .sort((a, b) => a - b)
    .map((m) => ({
      ageMonths: m,
      weightKg: round(average(byAgeMonth[String(m)].map((a) => a.weightKg)), 0),
      count: byAgeMonth[String(m)].length,
    }));

  return {
    avgADG: growing.length ? round(average(growing.map(adgOf)), 3) : 0,
    growingCount: growing.length,
    calves: group(0, 365),
    yearlings: group(365, 730),
    weightForAge,
  };
}

/* ---------------------- Per-animal cost of production --------------------- */

/** Typical buffalo birth weight (kg) — the gain baseline for animals born on
 *  the farm when no acquisition weight was recorded. */
const BIRTH_WEIGHT_KG = 38;

export interface AnimalEconomics {
  purpose: "dairy" | "meat" | "breeding";
  /** Days from acquisition/birth to sale/today. */
  daysOnFarm: number;
  purchaseCost: number;
  /** Feed allocated from the animal's pen consumption over its time on farm. */
  feedCost: number;
  /** Medicines + vaccinations + treatments booked to this animal. */
  healthCost: number;
  totalCost: number;
  startWeightKg: number;
  currentWeightKg: number;
  gainKg: number;
  /** Cost per kg of liveweight — totalCost / current weight. */
  costPerKgLive: number;
  /** Cost per kg of gain — totalCost / (current − start). The number that sets
   *  a break-even sale price for a fattening animal. */
  costPerKgGain: number;
  /** Litres this animal produced over the window (dairy). */
  litres: number;
  /** Cost of producing one litre — totalCost / litres. */
  costPerLitre: number;
  sold: boolean;
  proceeds: number;
  /** Sale proceeds − total cost (only meaningful once sold). */
  profit: number;
}

/**
 * The lifetime cost ledger for one animal, and the unit costs derived from it.
 *
 * Costs are direct: what it cost to buy (or 0 if born here), the feed it ate
 * (its share of its pen's feeding), and the meds/vaccines booked to it. Feed is
 * allocated per head from each pen feeding (`cost / heads`) over the animal's
 * time on the farm — an approximation, since day-by-day pen membership isn't
 * stored, but it reflects real pen-level feed spend rather than a flat average.
 */
export function animalEconomics(input: {
  animal: Animal;
  health: HealthEvent[];
  feedConsumption: FeedConsumption[];
  /** Litres this animal produced over the window (pass 0 for non-dairy). */
  litres: number;
  today: string;
}): AnimalEconomics {
  const { animal, health, feedConsumption, litres, today } = input;

  const purpose: AnimalEconomics["purpose"] =
    animal.purpose ?? (animal.sex === "male" ? "meat" : "dairy");

  const start = animal.acquiredAt || animal.dateOfBirth;
  const end = animal.disposal?.date || today;
  const daysOnFarm = Math.max(0, diffDays(end, start));
  const inWindow = (d: string) => diffDays(d, start) >= 0 && diffDays(end, d) >= 0;

  const purchaseCost = animal.acquisitionCost ?? 0;

  const feedCost = round(
    sum(
      feedConsumption
        .filter((c) => c.zoneId === animal.penId && inWindow(c.date))
        .map((c) => c.cost / Math.max(1, c.heads)),
    ),
  );

  const healthCost = round(
    sum(health.filter((h) => h.animalId === animal.id && inWindow(h.date)).map((h) => h.cost ?? 0)),
  );

  const totalCost = round(purchaseCost + feedCost + healthCost);

  const startWeightKg =
    animal.acquisitionWeightKg ?? (animal.acquiredFrom === "purchased" ? animal.weightKg : BIRTH_WEIGHT_KG);
  const currentWeightKg = animal.disposal?.weightKg ?? animal.weightKg;
  const gainKg = round(Math.max(0, currentWeightKg - startWeightKg));

  const sold = animal.disposal?.type === "sold";
  const proceeds = animal.disposal?.proceeds ?? 0;

  return {
    purpose,
    daysOnFarm,
    purchaseCost: round(purchaseCost),
    feedCost,
    healthCost,
    totalCost,
    startWeightKg: round(startWeightKg),
    currentWeightKg: round(currentWeightKg),
    gainKg,
    costPerKgLive: currentWeightKg > 0 ? round(totalCost / currentWeightKg) : 0,
    costPerKgGain: gainKg > 0 ? round(totalCost / gainKg) : 0,
    litres: round(litres),
    costPerLitre: litres > 0 ? round(totalCost / litres) : 0,
    sold,
    proceeds: round(proceeds),
    profit: sold ? round(proceeds - totalCost) : 0,
  };
}

/* --------------------------------- Assets --------------------------------- */

export interface AssetValue {
  cost: number;
  annualDepreciation: number;
  accumulatedDepreciation: number;
  bookValue: number;
  ageYears: number;
}

/** Straight-line book value for one asset. Land (no useful life) never
 *  depreciates; otherwise (cost − salvage) is written off evenly over the life,
 *  floored at the salvage value. */
export function assetBookValue(asset: Asset, today: string): AssetValue {
  const ageYears = Math.max(0, diffDays(today, asset.acquiredDate) / 365);
  const salvage = asset.salvageValue ?? 0;
  const life = asset.usefulLifeYears ?? 0;
  if (life <= 0) {
    return { cost: asset.cost, annualDepreciation: 0, accumulatedDepreciation: 0, bookValue: asset.cost, ageYears: round(ageYears, 1) };
  }
  const annual = (asset.cost - salvage) / life;
  const accumulated = Math.min(asset.cost - salvage, annual * ageYears);
  return {
    cost: asset.cost,
    annualDepreciation: round(annual),
    accumulatedDepreciation: round(accumulated),
    bookValue: round(asset.cost - accumulated),
    ageYears: round(ageYears, 1),
  };
}

export function assetsSummary(assets: Asset[], today: string) {
  const active = assets.filter((a) => a.status !== "disposed");
  const cost = round(sum(active.map((a) => a.cost)));
  const bookValue = round(sum(active.map((a) => assetBookValue(a, today).bookValue)));
  const byCategory = Object.entries(groupBy(active, (a) => a.category))
    .map(([category, list]) => ({
      category,
      count: list.length,
      cost: round(sum(list.map((x) => x.cost))),
      bookValue: round(sum(list.map((x) => assetBookValue(x, today).bookValue))),
    }))
    .sort((a, b) => b.bookValue - a.bookValue);
  return { count: active.length, cost, bookValue, depreciation: round(cost - bookValue), byCategory };
}

/* ------------------------------- Utility costs ----------------------------- */

/** Default utility tariffs (EGP per unit) — an Egyptian-farm ballpark; edit to
 *  match the actual bills. */
export const UTILITY_TARIFFS = {
  waterPerM3: 8,
  electricityPerKwh: 2.2,
  gasPerM3: 5,
  dieselPerL: 13,
};

/** Turns utility readings into money over the last `days`. Solar generation is
 *  credited back at the electricity tariff as a saving; `net` is the bill after
 *  that offset. */
export function utilityCostSummary(readings: UtilityReading[], today: string, days = 30) {
  const recent = readings.filter((u) => {
    const d = diffDays(today, u.date);
    return d >= 0 && d <= days;
  });
  const water = round(sum(recent.map((u) => u.waterM3)) * UTILITY_TARIFFS.waterPerM3);
  const electricity = round(sum(recent.map((u) => u.electricityKwh)) * UTILITY_TARIFFS.electricityPerKwh);
  const gas = round(sum(recent.map((u) => u.gasM3 ?? 0)) * UTILITY_TARIFFS.gasPerM3);
  const diesel = round(sum(recent.map((u) => u.dieselL)) * UTILITY_TARIFFS.dieselPerL);
  const solarSavings = round(sum(recent.map((u) => u.solarKwh ?? 0)) * UTILITY_TARIFFS.electricityPerKwh);
  const gross = round(water + electricity + gas + diesel);
  return { days, water, electricity, gas, diesel, solarSavings, gross, net: round(gross - solarSavings) };
}

/* ----------------------------- Enterprise P&L ------------------------------ */

const isMeatAnimal = (a: Animal) => a.purpose === "meat" || (!a.purpose && a.sex === "male");

/**
 * Splits the farm's money into its two enterprises — dairy (milk) and meat
 * (fattening) — over the last `days`.
 *
 * Revenue is direct: milk sales → dairy; animal sales → the sold animal's
 * enterprise (untagged sales default to meat). Direct costs are allocated:
 * feed by each herd's share of liveweight, meds/vet by each herd's share of
 * recorded health cost. Everything else (labour, utilities, fuel, rent, …) is
 * shared overhead, shown once rather than force-split. So each enterprise gets a
 * gross margin, and the farm nets out after shared overhead and other income.
 */
export function enterprisePnl(
  transactions: Transaction[],
  animals: Animal[],
  health: HealthEvent[],
  today: string,
  days = 365,
) {
  const inWindow = (d: string) => {
    const x = diffDays(today, d);
    return x >= 0 && x <= days;
  };
  const txns = transactions.filter((t) => inWindow(t.date));

  // Liveweight drivers (feed allocation).
  const live = animals.filter((a) => a.status === "active" || a.status === "quarantine");
  const meatW = sum(live.filter(isMeatAnimal).map((a) => a.weightKg));
  const dairyW = sum(live.filter((a) => !isMeatAnimal(a)).map((a) => a.weightKg));
  const totalW = meatW + dairyW || 1;

  // Health-cost drivers (meds allocation).
  const purposeOf = (id?: string): "meat" | "dairy" => {
    const a = id ? animals.find((x) => x.id === id) : undefined;
    return a && isMeatAnimal(a) ? "meat" : "dairy";
  };
  const hIn = health.filter((h) => inWindow(h.date));
  const meatHealth = sum(hIn.filter((h) => purposeOf(h.animalId) === "meat").map((h) => h.cost ?? 0));
  const dairyHealth = sum(hIn.filter((h) => purposeOf(h.animalId) === "dairy").map((h) => h.cost ?? 0));
  const totalHealth = meatHealth + dairyHealth;

  const byCat = (cats: string[], kind: "income" | "expense") =>
    sum(txns.filter((t) => t.kind === kind && cats.includes(t.category)).map((t) => t.amount));

  const milkRev = byCat(["milk_sales"], "income");
  const otherIncome = byCat(["manure_sales", "other_income"], "income");

  // Animal sales → the sold animal's enterprise; untagged default to meat.
  const saleEnterprise = (t: Transaction): "meat" | "dairy" => {
    const a = t.animalId ? animals.find((x) => x.id === t.animalId) : undefined;
    return a ? (isMeatAnimal(a) ? "meat" : "dairy") : "meat";
  };
  const animalSaleTxns = txns.filter((t) => t.kind === "income" && t.category === "animal_sales");
  const meatSales = sum(animalSaleTxns.filter((t) => saleEnterprise(t) === "meat").map((t) => t.amount));
  const dairySales = sum(animalSaleTxns.filter((t) => saleEnterprise(t) === "dairy").map((t) => t.amount));

  const feedExpense = byCat(["feed"], "expense");
  const medExpense = byCat(["medicine", "veterinary"], "expense");
  const overhead = byCat(
    ["labor", "fuel", "utilities", "maintenance", "rent", "transport", "other_expense"],
    "expense",
  );

  const dairyFeed = round(feedExpense * (dairyW / totalW));
  const meatFeed = round(feedExpense - dairyFeed);
  const dairyMedShare = totalHealth > 0 ? dairyHealth / totalHealth : dairyW / totalW;
  const dairyMeds = round(medExpense * dairyMedShare);
  const meatMeds = round(medExpense - dairyMeds);

  const dairyRevenue = round(milkRev + dairySales);
  const meatRevenue = round(meatSales);

  const dairy = {
    revenue: dairyRevenue,
    feed: dairyFeed,
    meds: dairyMeds,
    grossMargin: round(dairyRevenue - dairyFeed - dairyMeds),
  };
  const meat = {
    revenue: meatRevenue,
    feed: meatFeed,
    meds: meatMeds,
    grossMargin: round(meatRevenue - meatFeed - meatMeds),
  };

  return {
    days,
    dairy,
    meat,
    sharedOverhead: round(overhead),
    otherIncome: round(otherIncome),
    net: round(dairy.grossMargin + meat.grossMargin + otherIncome - overhead),
  };
}

/* --------------------------------- Alerts --------------------------------- */

export function alertCounts(alerts: Alert[]) {
  return {
    unread: alerts.filter((a) => !a.read).length,
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
  };
}
