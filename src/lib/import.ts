/**
 * Bulk herd import — parse and validate spreadsheet rows into animal drafts.
 *
 * Kept free of any file-format dependency: the dialog reads the .csv/.xlsx into
 * plain row objects (via SheetJS, loaded on demand) and hands them here. This
 * layer is pure, so the mapping rules — which columns, which enum spellings, how
 * a pen name resolves to an id — are testable and identical for every format.
 */

import { diffDays } from "@/lib/date";
import type { Animal, Breed, Sex } from "@/core/domain/types";

export interface PenRef {
  id: string;
  name: string;
  nameAr: string;
}

export interface AnimalDraft {
  tag: string;
  name: string;
  nameAr: string;
  sex: Sex;
  breed: Breed;
  dateOfBirth: string;
  penId: string;
  weightKg: number;
  bodyConditionScore: number;
  rfid: string;
  valuation: number;
  notes: string;
}

export interface ParsedRow {
  /** 1-based row number as it appears in the sheet (after the header). */
  row: number;
  tag: string; // echoed for the preview even when the row is invalid
  draft?: AnimalDraft;
  errors: string[];
  warnings: string[];
}

/** The template columns, in order. The first row of any import file. */
export const TEMPLATE_HEADERS = [
  "tag",
  "name",
  "name_ar",
  "sex",
  "breed",
  "date_of_birth",
  "pen",
  "weight_kg",
  "bcs",
  "valuation",
  "rfid",
  "notes",
] as const;

/** One example row, shown in the downloadable template. */
export const TEMPLATE_SAMPLE: Record<string, string> = {
  tag: "EG-2001",
  name: "Zahra",
  name_ar: "زهرة",
  sex: "female",
  breed: "murrah",
  date_of_birth: "2021-03-14",
  pen: "Pen A1",
  weight_kg: "540",
  bcs: "3.25",
  valuation: "42000",
  rfid: "",
  notes: "",
};

// Accept a few header spellings for the same column so a farmer's own sheet
// doesn't have to match ours exactly.
const HEADER_ALIASES: Record<string, string> = {
  tag: "tag", tag_number: "tag", id: "tag",
  name: "name", name_en: "name",
  name_ar: "name_ar", namear: "name_ar", arabic_name: "name_ar",
  sex: "sex", gender: "sex",
  breed: "breed",
  date_of_birth: "date_of_birth", dob: "date_of_birth", birth_date: "date_of_birth", dateofbirth: "date_of_birth",
  pen: "pen", pen_name: "pen", location: "pen", penid: "pen",
  weight_kg: "weight_kg", weight: "weight_kg", weightkg: "weight_kg",
  bcs: "bcs", body_condition: "bcs", bodyconditionscore: "bcs",
  valuation: "valuation", value: "valuation",
  rfid: "rfid",
  notes: "notes", note: "notes", comment: "notes",
};

const BREED_ALIASES: Record<string, Breed> = {
  egyptian_baladi: "egyptian_baladi", baladi: "egyptian_baladi", egyptian: "egyptian_baladi",
  murrah: "murrah",
  nili_ravi: "nili_ravi", niliravi: "nili_ravi",
  jafarabadi: "jafarabadi",
  crossbreed: "crossbreed", cross: "crossbreed", mixed: "crossbreed",
};

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

/** Map arbitrary sheet headers to our canonical keys. */
export function canonicalizeHeaders(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const key = HEADER_ALIASES[norm(h)];
    if (key) map[h] = key;
  }
  return map;
}

function parseDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Validate one raw row (already keyed by canonical column names) into a draft.
 * Blocking problems land in `errors` (the row won't import); recoverable ones in
 * `warnings` (imported with a sensible default).
 */
export function validateRow(
  raw: Record<string, unknown>,
  rowNumber: number,
  pens: PenRef[],
): ParsedRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const get = (k: string) => String(raw[k] ?? "").trim();

  const tag = get("tag");
  if (!tag) errors.push("Tag is required");
  else if (!/^[A-Za-z0-9-]+$/.test(tag)) errors.push("Tag: letters, numbers and dashes only");

  const name = get("name");
  if (!name) errors.push("Name is required");

  const sexRaw = norm(raw["sex"]);
  const sex: Sex | null =
    sexRaw === "female" || sexRaw === "f" || sexRaw === "cow"
      ? "female"
      : sexRaw === "male" || sexRaw === "m" || sexRaw === "bull"
        ? "male"
        : null;
  if (!sex) errors.push(`Sex must be female or male (got "${get("sex")}")`);

  const breed = BREED_ALIASES[norm(raw["breed"])] ?? null;
  if (!breed) errors.push(`Breed unknown (got "${get("breed")}"); use one of: ${Object.keys(BREED_ALIASES).slice(0, 5).join(", ")}`);

  const dob = parseDate(raw["date_of_birth"]);
  if (!dob) errors.push(`Date of birth unreadable (use YYYY-MM-DD, got "${get("date_of_birth")}")`);

  // Pen: match by name (either language); empty falls back to the first pen.
  let penId = "";
  const penRaw = get("pen");
  if (!penRaw) {
    if (pens[0]) { penId = pens[0].id; warnings.push(`No pen given — placed in "${pens[0].name}"`); }
    else errors.push("No pen given and no pens exist yet");
  } else {
    const match = pens.find((p) => norm(p.name) === norm(penRaw) || norm(p.nameAr) === norm(penRaw) || p.id === penRaw);
    if (match) penId = match.id;
    else errors.push(`Pen "${penRaw}" not found. Existing pens: ${pens.map((p) => p.name).join(", ") || "none"}`);
  }

  const num = (k: string, fallback: number, min: number, max: number): number => {
    const s = get(k);
    if (!s) return fallback;
    const n = Number(s);
    if (isNaN(n)) { warnings.push(`${k} "${s}" isn't a number — using ${fallback}`); return fallback; }
    return Math.min(max, Math.max(min, n));
  };

  const ageDays = dob ? diffDays(new Date().toISOString().slice(0, 10), dob) : 9999;
  const weightKg = num("weight_kg", ageDays < 365 ? 45 : 450, 0, 1500);
  const bodyConditionScore = num("bcs", 3, 1, 5);
  const valuation = num("valuation", 0, 0, 100_000_000);

  const draft: AnimalDraft | undefined =
    errors.length === 0 && sex && breed && dob
      ? {
          tag,
          name,
          nameAr: get("name_ar") || name,
          sex,
          breed,
          dateOfBirth: dob,
          penId,
          weightKg,
          bodyConditionScore,
          rfid: get("rfid"),
          valuation,
          notes: get("notes"),
        }
      : undefined;

  return { row: rowNumber, tag: tag || `(row ${rowNumber})`, draft, errors, warnings };
}

/**
 * Turn a validated draft into the animal record to persist — mirroring the
 * single-animal form: calf status is derived from age, and the state that only
 * events should ever set (health, milk, reproduction) is seeded to sane starts.
 */
export function draftToPatch(d: AnimalDraft, today: string): Partial<Animal> & { id?: string } {
  const isCalf = diffDays(today, d.dateOfBirth) < 365;
  return {
    tag: d.tag,
    rfid: d.rfid,
    name: d.name,
    nameAr: d.nameAr,
    sex: d.sex,
    breed: d.breed,
    dateOfBirth: d.dateOfBirth,
    weightKg: d.weightKg,
    bodyConditionScore: d.bodyConditionScore,
    hornStatus: "horned",
    color: "",
    temperament: "calm",
    penId: d.penId,
    acquiredFrom: "purchased",
    acquiredAt: today,
    valuation: d.valuation,
    notes: d.notes,
    isCalf,
    status: "active",
    healthScore: 100,
    lactationNumber: 0,
    milkStatus: isCalf ? "heifer" : d.sex === "male" ? "not_applicable" : "dry",
    reproStatus: isCalf || d.sex === "male" ? "not_applicable" : "open",
    avgDailyMilkL: 0,
    lifetimeMilkL: 0,
  };
}
