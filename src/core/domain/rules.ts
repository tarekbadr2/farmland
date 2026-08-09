/**
 * Herd rules.
 *
 * The consequences an event has for the animal it happened to. Both adapters
 * apply these, so the demo and Firestore can't drift into disagreeing about
 * what a positive pregnancy check means.
 *
 * Kept as pure functions on purpose: this is the part a vet would want to argue
 * with, and it should be readable and testable without a database.
 */

import type { Animal, BreedingEvent, HealthEvent } from "./types";
import { addDays, toISODate } from "@/lib/date";

/** Water buffalo gestation. Bubalus bubalis runs ~10 days longer than cattle. */
export const GESTATION_DAYS = 310;

/** Voluntary waiting period before a fresh cow is bred again. */
export const VOLUNTARY_WAIT_DAYS = 60;

/** Typical oestrous cycle — used to schedule the next heat check. */
export const HEAT_CYCLE_DAYS = 21;

/** Statuses that mean the animal has left the herd. */
const TERMINAL_STATUSES: Animal["status"][] = ["sold", "culled", "dead"];

/**
 * Guard herd events against business-impossible states. The dialogs already
 * prevent these, but the write layer must too — a breeding/health event on a
 * male, or on an animal that has left the herd, is nonsense that would corrupt
 * KPIs (e.g. a "pregnant" bull). Throws a stable code the callers surface.
 * (Firestore rules can't express sex/status predicates cheaply, so this pure
 * guard, called by both repository adapters, is the enforcement point.)
 */
export function assertBreedingAllowed(animal: Animal): void {
  if (TERMINAL_STATUSES.includes(animal.status)) throw new Error("animal-not-on-farm");
  if (animal.sex !== "female") throw new Error("breeding-female-only");
}

/** Health/clinical events may target any live animal (recording a death is how
 *  an animal becomes 'dead', so that transition is allowed); once terminal, no
 *  further clinical events. */
export function assertHealthAllowed(animal: Animal): void {
  if (TERMINAL_STATUSES.includes(animal.status)) throw new Error("animal-not-on-farm");
}

/**
 * How a breeding event changes the animal.
 *
 * Returns only the fields that change, so callers can merge without clobbering.
 */
export function applyBreedingEvent(
  animal: Animal,
  event: Pick<BreedingEvent, "type" | "date" | "result" | "outcome">,
): Partial<Animal> {
  switch (event.type) {
    case "heat":
      return { reproStatus: "open", lastHeatDate: event.date };

    case "ai":
    case "natural_mating":
      // Inseminated, not yet pregnant. The distinction matters: it's what makes
      // a repeat breeder visible instead of quietly counting as bred.
      return {
        reproStatus: "inseminated",
        lastServiceDate: event.date,
        servicesThisLactation: (animal.servicesThisLactation ?? 0) + 1,
      };

    case "pregnancy_check":
      if (event.result === "pregnant") {
        return {
          reproStatus: "pregnant",
          // Dated from the service, not the check — the check only confirms
          // what a service started weeks earlier.
          expectedCalvingDate: addDays(
            animal.lastServiceDate ?? event.date,
            GESTATION_DAYS,
          ),
        };
      }
      if (event.result === "open") {
        return { reproStatus: "open", expectedCalvingDate: undefined };
      }
      return {};

    case "calving": {
      const died = event.outcome === "stillbirth" || event.outcome === "died_24h";
      return {
        reproStatus: "fresh",
        milkStatus: "lactating",
        lactationNumber: (animal.lactationNumber ?? 0) + 1,
        lastCalvingDate: event.date,
        expectedCalvingDate: undefined,
        dryDate: undefined,
        servicesThisLactation: 0,
        // A cow that lost her calf still freshens and still milks.
        calvesBorn: (animal.calvesBorn ?? 0) + (died ? 0 : 1),
      };
    }

    case "abortion":
      return {
        reproStatus: "open",
        expectedCalvingDate: undefined,
        servicesThisLactation: 0,
      };

    case "dry_off":
      return { milkStatus: "dry", dryDate: event.date };

    default:
      return {};
  }
}

/**
 * How a health event changes the animal.
 *
 * Health score is a decay-and-recover model rather than a computed average:
 * a sick animal drops immediately and climbs back slowly, which is how a
 * stockman actually reads an animal.
 */
export function applyHealthEvent(
  animal: Animal,
  event: Pick<HealthEvent, "type" | "date" | "outcome" | "isolation" | "withdrawalUntil">,
): Partial<Animal> {
  const patch: Partial<Animal> = {};
  const score = animal.healthScore ?? 100;

  switch (event.type) {
    case "diagnosis":
      patch.healthScore = clamp(score - 25);
      if (event.isolation) patch.status = "quarantine";
      break;

    case "treatment":
      patch.healthScore = clamp(score + 5);
      break;

    case "vaccination":
      // Vaccination is routine, not evidence of health. Don't reward it.
      break;

    case "vet_visit":
    case "lab_result":
      break;

    default:
      break;
  }

  if (event.outcome === "recovered") {
    patch.healthScore = clamp(Math.max(score, 82));
    // Coming out of isolation is the point of recovering.
    if (animal.status === "quarantine") patch.status = "active";
  }

  if (event.outcome === "died") {
    patch.status = "dead";
    patch.milkStatus = "not_applicable";
    patch.reproStatus = "not_applicable";
    patch.healthScore = 0;
  }

  if (event.outcome === "chronic") patch.healthScore = clamp(Math.min(score, 55));

  return patch;
}

/**
 * Milk that must not enter the tank.
 *
 * Withdrawal periods are a food-safety and legal matter, not a suggestion —
 * one treated cow milked into the bulk tank can condemn the whole collection.
 */
export function isUnderWithdrawal(animal: Animal, on = toISODate(new Date())): boolean {
  return Boolean(animal.withdrawalUntil && animal.withdrawalUntil >= on);
}

/** Days until a cow may be bred again. Negative once she's eligible. */
export function daysUntilBreedable(animal: Animal, on = toISODate(new Date())): number | null {
  if (!animal.lastCalvingDate) return null;
  const eligible = addDays(animal.lastCalvingDate, VOLUNTARY_WAIT_DAYS);
  return Math.round(
    (Date.parse(`${eligible}T00:00:00Z`) - Date.parse(`${on}T00:00:00Z`)) / 86_400_000,
  );
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** A standard shift before overtime begins. */
export const STANDARD_SHIFT_HOURS = 8;

/**
 * Derives an attendance row from a clock event.
 *
 * Hours come from the clock times, never the caller: worked hours are the gap
 * between in and out, and anything past a standard shift is overtime. Present
 * with no clock-out yet reports zero rather than guessing — the hours land when
 * the person clocks out. Absent or on leave is always zero regardless of any
 * stray times.
 */
export function attendanceFromClock(
  input: {
    employeeId: string;
    date: string;
    status: "present" | "absent" | "leave" | "late";
    clockIn?: string;
    clockOut?: string;
  },
  farmId: string,
  id: string,
) {
  let hours = 0;
  let overtimeHours = 0;

  if ((input.status === "present" || input.status === "late") && input.clockIn && input.clockOut) {
    const worked = clockGapHours(input.clockIn, input.clockOut);
    hours = Math.max(0, round(worked, 2));
    overtimeHours = Math.max(0, round(worked - STANDARD_SHIFT_HOURS, 2));
  }

  return {
    id,
    farmId,
    employeeId: input.employeeId,
    date: input.date,
    status: input.status,
    clockIn: input.clockIn,
    clockOut: input.clockOut,
    hours,
    overtimeHours,
  };
}

/** Hours between two "HH:mm" clock times, wrapping past midnight for night shifts. */
function clockGapHours(inHHmm: string, outHHmm: string): number {
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  let mins = toMin(outHHmm) - toMin(inHHmm);
  // A night-shift clock-out reads earlier than clock-in; it's the next day.
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

const round = (n: number, dp = 1) => Number(n.toFixed(dp));

/**
 * Kilograms in one unit of a feed item.
 *
 * Feed stock and cost are denominated per `unit` (a ton of berseem, a bale of
 * hay), but rations are always specified in kg/head. Every conversion between
 * the two — drawing stock, costing a feeding — must go through here, or a
 * feeding of 1.7 tonnes gets costed as if it were 1.7 tonnes of *tonnes*.
 */
export function kgPerUnit(unit: "kg" | "ton" | "bale"): number {
  switch (unit) {
    case "ton":
      return 1000;
    case "bale":
      return 25; // a standard berseem/straw bale on an Egyptian farm
    default:
      return 1;
  }
}
