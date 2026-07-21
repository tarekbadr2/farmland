import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import {
  AlertInput,
  REGION,
  addDays,
  allFarmIds,
  daysBetween,
  db,
  farmPath,
  localDate,
  round,
  writeAlerts,
} from "./shared";

/**
 * The farm's morning briefing.
 *
 * Runs once before the morning milking so whoever opens the app at 5am sees
 * today's exceptions rather than yesterday's. Every detector derives its alerts
 * from scratch with deterministic ids, so the set is idempotent: re-running
 * refreshes, it never duplicates.
 *
 * Detectors are deliberately independent — one that throws must not take the
 * others down with it, because a broken feed query shouldn't cost the farm its
 * calving warnings.
 */

const HORIZON_DAYS = 7;

type Detector = (farmId: string, today: string) => Promise<AlertInput[]>;

/* --------------------------- upcoming calvings ---------------------------- */

const calvingDue: Detector = async (farmId, today) => {
  const horizon = addDays(today, HORIZON_DAYS);
  const snap = await db
    .collection(`${farmPath(farmId)}/animals`)
    .where("reproStatus", "==", "pregnant")
    .where("expectedCalvingDate", ">=", today)
    .where("expectedCalvingDate", "<=", horizon)
    .get();

  return snap.docs.map((doc) => {
    const a = doc.data();
    const days = daysBetween(today, a.expectedCalvingDate);
    return {
      id: `calving_${doc.id}_${a.expectedCalvingDate}`,
      kind: "calving_due",
      // Day-of and overdue are a different kind of urgent from "next week".
      severity: days <= 1 ? "critical" : days <= 3 ? "warning" : "info",
      subjectId: doc.id,
      href: `/animals/${doc.id}`,
      title: days === 0 ? `${a.tag} is due today` : `${a.tag} calving in ${days}d`,
      titleAr: days === 0 ? `${a.tag} الولادة اليوم` : `${a.tag} الولادة خلال ${days} يوم`,
      body: `${a.name} · pen ${a.penId ?? "—"} · lactation ${a.lactationNumber ?? 1}`,
      bodyAr: `${a.nameAr ?? a.name} · حظيرة ${a.penId ?? "—"}`,
    } satisfies AlertInput;
  });
};

/* -------------------------- vaccinations due ------------------------------ */

const vaccinationDue: Detector = async (farmId, today) => {
  const horizon = addDays(today, HORIZON_DAYS);
  const snap = await db
    .collection(`${farmPath(farmId)}/health`)
    .where("type", "==", "vaccination")
    .where("nextDueDate", ">=", today)
    .where("nextDueDate", "<=", horizon)
    .get();

  // One alert per vaccine per date, not per animal. Twenty-four separate
  // "vaccinate EG-1043" cards is noise; "24 animals due for FMD" is a job.
  const groups = new Map<string, { vaccine: string; date: string; animals: string[] }>();
  for (const doc of snap.docs) {
    const h = doc.data();
    const key = `${h.vaccine}_${h.nextDueDate}`;
    if (!groups.has(key)) {
      groups.set(key, { vaccine: h.vaccine, date: h.nextDueDate, animals: [] });
    }
    groups.get(key)!.animals.push(h.animalId);
  }

  return [...groups.entries()].map(([key, g]) => ({
    id: `vaccination_${key}`,
    kind: "vaccination_due",
    severity: daysBetween(today, g.date) <= 2 ? "warning" : "info",
    href: "/health",
    title: `${g.animals.length} due for ${g.vaccine}`,
    titleAr: `${g.animals.length} رأس يحتاجون ${g.vaccine}`,
    body: `Scheduled ${g.date}`,
    bodyAr: `الموعد ${g.date}`,
  }));
};

/* ------------------------------ low stock --------------------------------- */

const lowStock: Detector = async (farmId) => {
  const [feed, inventory] = await Promise.all([
    db.collection(`${farmPath(farmId)}/feedItems`).get(),
    db.collection(`${farmPath(farmId)}/inventory`).get(),
  ]);

  const alerts: AlertInput[] = [];
  const sources = [
    { docs: feed.docs, href: "/feed" },
    { docs: inventory.docs, href: "/inventory" },
  ];

  for (const { docs, href } of sources) {
    for (const doc of docs) {
    const item = doc.data();
    // feedItems carry stockKg, inventory carries stock. Same idea, different unit.
    const qty = item.stock ?? item.stockKg ?? 0;
    const reorder = item.reorderLevel ?? 0;
    if (!reorder || qty > reorder) continue;

    alerts.push({
      id: `lowstock_${doc.id}`,
      kind: "low_stock",
      severity: qty <= reorder * 0.4 ? "critical" : "warning",
      subjectId: doc.id,
      href,
      title: `${item.name} low — ${round(qty)} ${item.unit ?? ""}`.trim(),
      titleAr: `${item.nameAr ?? item.name} منخفض — ${round(qty)} ${item.unit ?? ""}`.trim(),
      body: `Reorder level is ${reorder} ${item.unit ?? ""}`.trim(),
      bodyAr: `حد إعادة الطلب ${reorder}`,
    });
    }
  }

  return alerts;
};

/* ---------------------------- expiring medicine --------------------------- */

const expiringStock: Detector = async (farmId, today) => {
  const horizon = addDays(today, 30);
  const snap = await db
    .collection(`${farmPath(farmId)}/inventory`)
    .where("expiresAt", ">=", today)
    .where("expiresAt", "<=", horizon)
    .get();

  return snap.docs.map((doc) => {
    const item = doc.data();
    const days = daysBetween(today, item.expiresAt);
    return {
      id: `expiring_${doc.id}_${item.expiresAt}`,
      kind: "expiring_stock",
      severity: days <= 7 ? "warning" : "info",
      subjectId: doc.id,
      href: "/inventory",
      title: `${item.name} expires in ${days}d`,
      titleAr: `${item.nameAr ?? item.name} ينتهي خلال ${days} يوم`,
      body: `${round(item.stock ?? 0)} ${item.unit ?? ""} on hand`.trim(),
      bodyAr: `المتوفر ${round(item.stock ?? 0)}`,
    } satisfies AlertInput;
  });
};

/* ---------------------------- milk yield drop ----------------------------- */

/**
 * Compares each cow's last two days against her own rolling baseline.
 *
 * A sustained drop is the earliest cheap signal of mastitis, lameness or heat
 * stress — usually a day or two before anything is visible in the parlor. The
 * baseline is an exponentially-weighted average maintained here rather than
 * recomputed, so this reads two days of records instead of ninety.
 *
 * Cost scales with milking herd, not total herd: ~2 reads per lactating cow per
 * day. At 50,000 head that's 100k reads/day, a few cents.
 */
const milkDrop: Detector = async (farmId, today) => {
  const since = addDays(today, -2);
  const snap = await db
    .collection(`${farmPath(farmId)}/milkRecords`)
    .where("date", ">=", since)
    .get();

  if (snap.empty) return [];

  const byAnimal = new Map<string, number[]>();
  for (const doc of snap.docs) {
    const r = doc.data();
    if (!byAnimal.has(r.animalId)) byAnimal.set(r.animalId, []);
    byAnimal.get(r.animalId)!.push(r.volumeL ?? 0);
  }

  const alerts: AlertInput[] = [];
  const updates: { id: string; baseline: number }[] = [];

  // getAll takes every ref in one request. At 600 head that's fine; at 50,000
  // it exceeds the gRPC message limit, so chunk it.
  const ids = [...byAnimal.keys()];
  const animalDocs: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const refs = ids.slice(i, i + 300).map((id) => db.doc(`${farmPath(farmId)}/animals/${id}`));
    animalDocs.push(...(await db.getAll(...refs)));
  }

  for (const doc of animalDocs) {
    const a = doc.data();
    if (!a || a.milkStatus !== "lactating") continue;

    const volumes = byAnimal.get(doc.id)!;
    const daily = volumes.reduce((s, v) => s + v, 0) / 2; // two days of sessions
    const baseline = a.milkBaselineL ?? a.avgDailyMilkL ?? daily;

    if (baseline > 0) {
      const dropPct = ((baseline - daily) / baseline) * 100;
      if (dropPct >= 15) {
        alerts.push({
          id: `milkdrop_${doc.id}_${today}`,
          kind: "milk_drop",
          severity: dropPct >= 30 ? "critical" : "warning",
          subjectId: doc.id,
          href: `/animals/${doc.id}`,
          title: `${a.tag} down ${Math.round(dropPct)}%`,
          titleAr: `${a.tag} انخفاض ${Math.round(dropPct)}%`,
          body: `${round(daily)} L vs ${round(baseline)} L baseline. Check udder and gait.`,
          bodyAr: `${round(daily)} لتر مقابل ${round(baseline)} لتر. افحص الضرع والمشية.`,
        });
      }
    }

    // EWMA: 20% weight on the newest reading. Slow enough that one bad day
    // doesn't reset the baseline and mask a genuine multi-day decline.
    updates.push({ id: doc.id, baseline: round(baseline * 0.8 + daily * 0.2, 2) });
  }

  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    for (const u of updates.slice(i, i + 400)) {
      batch.set(
        db.doc(`${farmPath(farmId)}/animals/${u.id}`),
        { milkBaselineL: u.baseline },
        { merge: true },
      );
    }
    await batch.commit();
  }

  return alerts;
};

/* ----------------------------- missed milking ----------------------------- */

const missedMilking: Detector = async (farmId, today) => {
  const yesterday = addDays(today, -1);
  const [daily, farm] = await Promise.all([
    db.doc(`${farmPath(farmId)}/milkDaily/${yesterday}`).get(),
    db.doc(farmPath(farmId)).get(),
  ]);

  const expected = farm.data()?.counts?.lactating ?? 0;
  if (!expected) return [];

  const d = daily.data();
  if (!d) {
    return [
      {
        id: `missedmilking_${yesterday}`,
        kind: "missed_milking",
        severity: "critical",
        href: "/milk",
        title: `No milk recorded for ${yesterday}`,
        titleAr: `لم يُسجَّل حليب ليوم ${yesterday}`,
        body: `${expected} lactating animals and no session logged.`,
        bodyAr: `${expected} رأس حلوب بدون تسجيل.`,
      },
    ];
  }

  const missing: string[] = [];
  if (!d.morningL) missing.push("morning");
  if (!d.eveningL) missing.push("evening");
  if (!missing.length) return [];

  return [
    {
      id: `missedmilking_${yesterday}`,
      kind: "missed_milking",
      severity: "warning",
      href: "/milk",
      title: `${missing.join(" and ")} session missing for ${yesterday}`,
      titleAr: `جلسة ${yesterday} غير مكتملة`,
      body: `Recorded ${round(d.totalL ?? 0)} L from ${d.milkingCows ?? 0} animals.`,
      bodyAr: `المسجل ${round(d.totalL ?? 0)} لتر.`,
    },
  ];
};

/* ------------------------------ overdue tasks ----------------------------- */

const overdueTasks: Detector = async (farmId, today) => {
  const snap = await db
    .collection(`${farmPath(farmId)}/tasks`)
    .where("status", "in", ["pending", "in_progress"])
    .where("dueAt", "<", today)
    .limit(200)
    .get();

  if (snap.empty) return [];

  return [
    {
      id: `overdue_tasks_${today}`,
      kind: "overdue_tasks",
      severity: snap.size >= 10 ? "warning" : "info",
      href: "/tasks",
      title: `${snap.size} overdue task${snap.size === 1 ? "" : "s"}`,
      titleAr: `${snap.size} مهمة متأخرة`,
      body: snap.docs
        .slice(0, 3)
        .map((d) => d.data().title)
        .join(" · "),
      bodyAr: snap.docs
        .slice(0, 3)
        .map((d) => d.data().titleAr ?? d.data().title)
        .join(" · "),
    },
  ];
};

/* ------------------------------ quarantine -------------------------------- */

const quarantined: Detector = async (farmId, today) => {
  const snap = await db
    .collection(`${farmPath(farmId)}/animals`)
    .where("status", "==", "quarantine")
    .get();

  if (snap.empty) return [];

  return [
    {
      id: `quarantine_${today}`,
      kind: "quarantine",
      severity: snap.size >= 5 ? "critical" : "warning",
      href: "/health",
      title: `${snap.size} animal${snap.size === 1 ? "" : "s"} in isolation`,
      titleAr: `${snap.size} رأس في العزل`,
      body: snap.docs
        .slice(0, 5)
        .map((d) => d.data().tag)
        .join(", "),
      bodyAr: snap.docs
        .slice(0, 5)
        .map((d) => d.data().tag)
        .join("، "),
    },
  ];
};

/* -------------------------------- runner ---------------------------------- */

const DETECTORS: Record<string, Detector> = {
  calvingDue,
  vaccinationDue,
  lowStock,
  expiringStock,
  milkDrop,
  missedMilking,
  overdueTasks,
  quarantined,
};

export async function runDetectors(farmId: string, today = localDate()) {
  const results = await Promise.allSettled(
    Object.entries(DETECTORS).map(async ([name, fn]) => {
      try {
        return await fn(farmId, today);
      } catch (err) {
        // Named so the log says which detector broke, not just "something did".
        logger.error(`detector ${name} failed`, { farmId, err });
        throw err;
      }
    }),
  );

  const alerts = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const failed = results.filter((r) => r.status === "rejected").length;

  await writeAlerts(farmId, alerts);

  logger.info("alerts generated", { farmId, today, count: alerts.length, failed });
  return { count: alerts.length, failed };
}

/** 04:30 Cairo — before the morning milking, after the overnight data settles. */
export const dailyAlerts = onSchedule(
  { schedule: "30 4 * * *", timeZone: "Africa/Cairo", region: REGION, timeoutSeconds: 540 },
  async () => {
    for (const farmId of await allFarmIds()) {
      await runDetectors(farmId);
    }
  },
);
