/**
 * Moving head between pens (اذن تحويل رؤوس).
 *
 * Pure checks over animals and zones. Capacity is treated as advisory, not a
 * hard stop: a real farm does temporarily overfill a pen to isolate a sick
 * group, and refusing the move would only push the user to edit records by
 * hand — which is exactly the untracked change this document exists to replace.
 */

import type { Animal, ID, LivestockTransfer, Zone, ZoneKind } from "@/core/domain/types";

/** Only these zones hold livestock — a feed store or office never receives head. */
export const ANIMAL_ZONES: ZoneKind[] = ["pen", "barn", "quarantine"];

export function housesAnimals(kind: ZoneKind): boolean {
  return ANIMAL_ZONES.includes(kind);
}

/** Zones an animal can actually be moved into. */
export function transferableZones(zones: Zone[]): Zone[] {
  return zones.filter((z) => housesAnimals(z.kind));
}

/** How many head are in a zone right now. */
export function zoneOccupancy(zoneId: ID, animals: Animal[]): number {
  return animals.filter(
    (a) => a.penId === zoneId && (a.status === "active" || a.status === "quarantine"),
  ).length;
}

/** An animal that has left the herd can't be moved between pens. */
export function isMovable(animal: Animal): boolean {
  return animal.status === "active" || animal.status === "quarantine";
}

export interface TransferCheck {
  ok: boolean;
  /** Blocking problems — the transfer must not be recorded. */
  errors: string[];
  /** Worth showing, but the move is still allowed. */
  warnings: string[];
  occupancyBefore: number;
  occupancyAfter: number;
  capacity: number;
  /** True when the move pushes the destination past its capacity. */
  overCapacity: boolean;
}

/**
 * Validates a proposed transfer.
 *
 * Errors: no animals, unknown destination, a destination that doesn't house
 * livestock, animals that have left the herd, or animals already in the
 * destination. Over-capacity is only a warning (see the note at the top).
 */
export function checkTransfer(
  input: { toZoneId: ID; animalIds: ID[] },
  animals: Animal[],
  zones: Zone[],
): TransferCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  const destination = zones.find((z) => z.id === input.toZoneId);
  const selected = input.animalIds
    .map((id) => animals.find((a) => a.id === id))
    .filter((a): a is Animal => Boolean(a));

  if (input.animalIds.length === 0) errors.push("no-animals");
  if (!destination) errors.push("unknown-zone");
  else if (!housesAnimals(destination.kind)) errors.push("zone-not-for-animals");

  if (selected.length !== input.animalIds.length) errors.push("unknown-animal");
  if (selected.some((a) => !isMovable(a))) errors.push("animal-not-movable");

  // Moving an animal to the pen it's already in is a no-op, not a document.
  const alreadyThere = selected.filter((a) => a.penId === input.toZoneId);
  if (alreadyThere.length === selected.length && selected.length > 0) {
    errors.push("already-in-zone");
  } else if (alreadyThere.length > 0) {
    warnings.push("some-already-in-zone");
  }

  const occupancyBefore = destination ? zoneOccupancy(destination.id, animals) : 0;
  const incoming = selected.filter((a) => a.penId !== input.toZoneId).length;
  const occupancyAfter = occupancyBefore + incoming;
  const capacity = destination?.capacity ?? 0;
  const overCapacity = capacity > 0 && occupancyAfter > capacity;
  if (overCapacity) warnings.push("over-capacity");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    occupancyBefore,
    occupancyAfter,
    capacity,
    overCapacity,
  };
}

/** Sequential document number, e.g. LT-2026-0004. */
export function transferNumber(date: string, seq: number): string {
  return `LT-${date.slice(0, 4)}-${String(seq).padStart(4, "0")}`;
}

/**
 * Where the animals came from. A single shared origin is recorded on the
 * document; a mixed selection leaves it blank rather than picking one
 * arbitrarily and misreporting the rest.
 */
export function commonOrigin(animalIds: ID[], animals: Animal[]): ID | undefined {
  const origins = new Set(
    animalIds.map((id) => animals.find((a) => a.id === id)?.penId).filter(Boolean) as ID[],
  );
  return origins.size === 1 ? [...origins][0] : undefined;
}

/** Head moved by a transfer, for the document list. */
export function transferSize(transfer: LivestockTransfer): number {
  return transfer.animalIds.length;
}
