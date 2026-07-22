"use client";

/**
 * Sample-data tutorial.
 *
 * A brand-new farm is seeded with a compact, internally-consistent slice of the
 * demo herd so every screen shows realistic content while the owner learns the
 * app. When they're ready, `clearFarmData` wipes it back to an empty farm (with
 * the default pens) for their real herd. The farm doc carries `isSample` so the
 * UI can show the "you're exploring sample data" banner and run the tour once.
 */

import {
  collection,
  doc,
  getDocs,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { getDataset, TODAY } from "@/core/data/seed";
import { getFirebase } from "@/infrastructure/firebase/client";
import { paths, animalSearchFields } from "@/infrastructure/firebase/paths";
import { diffDays } from "@/lib/date";

const SAMPLE_ANIMALS = 24;
const RECENT_DAYS = 45;

type Row = { col: string; id: string; data: Record<string, unknown> };

async function commitRows(db: Firestore, rows: Row[]) {
  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db);
    for (const r of rows.slice(i, i + 400)) batch.set(doc(db, r.col, r.id), r.data);
    await batch.commit();
  }
}

/** Seed a compact tutorial dataset into a farm and mark it as sample. */
export async function seedSampleFarm(farmId: string): Promise<void> {
  const { db } = getFirebase();
  const d = getDataset();
  const recent = (date: string) => diffDays(TODAY, date) <= RECENT_DAYS && diffDays(TODAY, date) >= 0;

  const animals = d.animals.slice(0, SAMPLE_ANIMALS);
  const ids = new Set(animals.map((a) => a.id));
  const rows: Row[] = [];
  const add = (col: string, id: string, data: object) =>
    rows.push({ col, id, data: { ...data, farmId } });

  // Zones the sample animals live in (replaces the default pens with a fuller
  // realistic layout for the tour).
  d.zones.forEach((z) => add(paths.zones(farmId), z.id, z));
  animals.forEach((a) => add(paths.animals(farmId), a.id, { ...a, ...animalSearchFields(a) }));

  d.milkDaily.slice(-RECENT_DAYS).forEach((m) => add(paths.milkDaily(farmId), m.date, m));
  d.health.filter((h) => ids.has(h.animalId) && recent(h.date)).forEach((h) => add(paths.health(farmId), h.id, h));
  d.breeding.filter((b) => ids.has(b.animalId) && recent(b.date)).forEach((b) => add(paths.breeding(farmId), b.id, b));
  d.feedItems.forEach((f) => add(paths.feedItems(farmId), f.id, f));
  d.rations.forEach((r) => add(paths.rations(farmId), r.id, r));
  d.feedConsumption.filter((c) => recent(c.date)).forEach((c) => add(paths.feedConsumption(farmId), c.id, c));
  d.inventory.forEach((i) => add(paths.inventory(farmId), i.id, i));
  d.transactions.filter((t) => recent(t.date)).forEach((t) => add(paths.transactions(farmId), t.id, t));
  d.invoices.slice(0, 8).forEach((v) => add(paths.invoices(farmId), v.id, v));
  d.partners.forEach((p) => add(paths.partners(farmId), p.id, p));
  d.assets.forEach((a) => add(paths.assets(farmId), a.id, a));
  d.tasks.filter((t) => diffDays(t.dueAt.slice(0, 10), TODAY) <= 14).slice(0, 12).forEach((t) => add(paths.tasks(farmId), t.id, t));
  d.utilities.slice(-30).forEach((u) => add(paths.utilities(farmId), u.date, u));
  add(paths.telemetry(farmId), "weather", d.weather);

  await commitRows(db, rows);

  // Mark the farm as a sample so the UI shows the banner + runs the tour.
  const flag = writeBatch(db);
  flag.set(doc(db, paths.farm(farmId)), { isSample: true }, { merge: true });
  await flag.commit();
}

const DEFAULT_PENS = [
  { id: "pen_a1", name: "Pen A1", nameAr: "حظيرة أ1", kind: "pen", x: 8, y: 10, w: 26, h: 30 },
  { id: "pen_a2", name: "Pen A2", nameAr: "حظيرة أ2", kind: "pen", x: 40, y: 10, w: 26, h: 30 },
  { id: "calf_barn", name: "Calf Barn", nameAr: "حظيرة العجول", kind: "barn", x: 8, y: 46, w: 26, h: 26 },
  { id: "parlor", name: "Milking Parlor", nameAr: "صالة الحلابة", kind: "milking_parlor", x: 40, y: 46, w: 26, h: 26 },
  { id: "quarantine", name: "Quarantine", nameAr: "الحجر الصحي", kind: "quarantine", x: 72, y: 46, w: 20, h: 26 },
];

async function deleteAll(db: Firestore, col: string) {
  for (;;) {
    const snap = await getDocs(collection(db, col));
    if (snap.empty) break;
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    if (snap.size < 400) break;
  }
}

/** Wipe a farm's herd data back to empty (keeps members) and restore default
 *  pens — used when the owner clears the sample data to add their real herd. */
export async function clearFarmData(farmId: string): Promise<void> {
  const { db } = getFirebase();
  const cols = [
    paths.animals, paths.zones, paths.milkRecords, paths.milkDaily, paths.breeding,
    paths.health, paths.semen, paths.feedItems, paths.rations, paths.feedConsumption,
    paths.inventory, paths.stockMovements, paths.tasks, paths.transactions,
    paths.invoices, paths.partners, paths.assets, paths.alerts, paths.utilities, paths.telemetry,
    paths.employees, paths.attendance,
  ];
  for (const colFn of cols) await deleteAll(db, colFn(farmId));

  const batch = writeBatch(db);
  DEFAULT_PENS.forEach((p) =>
    batch.set(doc(db, paths.zones(farmId), p.id), {
      farmId, ...p, capacity: 80, shadeCoverPct: 60, hasFans: true,
    }),
  );
  batch.set(doc(db, paths.farm(farmId)), { isSample: false, counts: { total: 0 } }, { merge: true });
  await batch.commit();
}
