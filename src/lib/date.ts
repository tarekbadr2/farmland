/**
 * Date helpers. Everything in the domain is stored as an ISO `yyyy-MM-dd`
 * string (or full ISO for timestamps) so records stay JSON-clean across
 * Firestore, IndexedDB offline cache and the wire.
 */

export const DAY_MS = 86_400_000;

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Coerce before adding.
 *
 * These take values straight from form inputs, where a "number" field still
 * hands you a string. `getDate() + "5"` concatenates to "205" and silently
 * moves the date six months — which, on a withdrawal period, is the difference
 * between safe milk and condemned milk. Number() makes that impossible.
 */
export function addDays(s: string, days: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + Number(days));
  return toISODate(d);
}

export function addMonths(s: string, months: number): string {
  const d = parseISODate(s);
  d.setMonth(d.getMonth() + Number(months));
  return toISODate(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / DAY_MS);
}

export function monthKey(s: string): string {
  return s.slice(0, 7);
}

export function startOfMonth(s: string): string {
  return `${s.slice(0, 7)}-01`;
}

export function rangeDays(endISO: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDays(endISO, -i));
  return out;
}

export function ageFromDOB(dob: string, today: string) {
  const days = diffDays(today, dob);
  const years = Math.floor(days / 365.25);
  const months = Math.floor((days - years * 365.25) / 30.44);
  return { days, years, months };
}

export function isSameMonth(a: string, b: string) {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Locale-aware label for a date string. Numerals stay latin by design. */
export function formatDate(s: string, locale: "en" | "ar", opts?: Intl.DateTimeFormatOptions) {
  const d = parseISODate(s);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(d);
}

export function formatMonth(s: string, locale: "en" | "ar") {
  const d = parseISODate(`${s}-01`);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    month: "short",
    year: "2-digit",
  }).format(d);
}

export function relativeDays(target: string, today: string, locale: "en" | "ar") {
  const d = diffDays(target, today);
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-EG" : "en", {
    numeric: "auto",
  });
  if (Math.abs(d) < 31) return rtf.format(d, "day");
  return rtf.format(Math.round(d / 30), "month");
}
