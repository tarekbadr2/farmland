import { describe, it, expect } from "vitest";

import {
  checkTransfer,
  commonOrigin,
  housesAnimals,
  isMovable,
  transferNumber,
  transferableZones,
  zoneOccupancy,
} from "./livestock";
import type { Animal, Zone } from "@/core/domain/types";

const zone = (id: string, kind: Zone["kind"], capacity = 10): Zone =>
  ({ id, farmId: "f1", name: id, nameAr: id, kind, capacity, x: 0, y: 0, w: 1, h: 1 }) as Zone;

const animal = (id: string, penId: string, status: Animal["status"] = "active"): Animal =>
  ({ id, farmId: "f1", tag: id, name: id, nameAr: id, penId, status }) as Animal;

const ZONES: Zone[] = [
  zone("pen_a", "pen", 3),
  zone("pen_b", "pen", 10),
  zone("quar", "quarantine", 5),
  zone("store", "feed_store", 100),
  zone("office", "office", 4),
];

const ANIMALS: Animal[] = [
  animal("a1", "pen_a"),
  animal("a2", "pen_a"),
  animal("a3", "pen_b"),
  animal("dead1", "pen_b", "dead"),
  animal("sold1", "pen_b", "sold"),
];

describe("zone kinds", () => {
  it("only pens, barns and quarantine hold livestock", () => {
    expect(housesAnimals("pen")).toBe(true);
    expect(housesAnimals("barn")).toBe(true);
    expect(housesAnimals("quarantine")).toBe(true);
    expect(housesAnimals("feed_store")).toBe(false);
    expect(housesAnimals("office")).toBe(false);
    expect(housesAnimals("water")).toBe(false);
  });

  it("offers only animal-housing zones as destinations", () => {
    expect(transferableZones(ZONES).map((z) => z.id)).toEqual(["pen_a", "pen_b", "quar"]);
  });
});

describe("zoneOccupancy", () => {
  it("counts only animals still in the herd", () => {
    expect(zoneOccupancy("pen_a", ANIMALS)).toBe(2);
    // pen_b holds a3 plus a dead and a sold animal, which don't occupy space.
    expect(zoneOccupancy("pen_b", ANIMALS)).toBe(1);
  });
});

describe("isMovable", () => {
  it("lets active and quarantined animals move, but not those that left", () => {
    expect(isMovable(animal("x", "pen_a", "active"))).toBe(true);
    expect(isMovable(animal("x", "pen_a", "quarantine"))).toBe(true);
    expect(isMovable(animal("x", "pen_a", "dead"))).toBe(false);
    expect(isMovable(animal("x", "pen_a", "sold"))).toBe(false);
  });
});

describe("checkTransfer", () => {
  it("accepts a straightforward move", () => {
    const r = checkTransfer({ toZoneId: "pen_b", animalIds: ["a1", "a2"] }, ANIMALS, ZONES);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.occupancyBefore).toBe(1);
    expect(r.occupancyAfter).toBe(3);
  });

  it("refuses an empty selection", () => {
    const r = checkTransfer({ toZoneId: "pen_b", animalIds: [] }, ANIMALS, ZONES);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("no-animals");
  });

  it("refuses a destination that doesn't house animals", () => {
    const r = checkTransfer({ toZoneId: "store", animalIds: ["a1"] }, ANIMALS, ZONES);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("zone-not-for-animals");
  });

  it("refuses an unknown destination or animal", () => {
    expect(checkTransfer({ toZoneId: "nope", animalIds: ["a1"] }, ANIMALS, ZONES).errors).toContain(
      "unknown-zone",
    );
    expect(
      checkTransfer({ toZoneId: "pen_b", animalIds: ["ghost"] }, ANIMALS, ZONES).errors,
    ).toContain("unknown-animal");
  });

  it("refuses to move an animal that has left the herd", () => {
    const r = checkTransfer({ toZoneId: "pen_a", animalIds: ["dead1"] }, ANIMALS, ZONES);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("animal-not-movable");
  });

  it("refuses a move where every animal is already there", () => {
    const r = checkTransfer({ toZoneId: "pen_a", animalIds: ["a1", "a2"] }, ANIMALS, ZONES);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("already-in-zone");
  });

  it("warns — but allows — when only some are already there", () => {
    const r = checkTransfer({ toZoneId: "pen_a", animalIds: ["a1", "a3"] }, ANIMALS, ZONES);
    expect(r.ok).toBe(true);
    expect(r.warnings).toContain("some-already-in-zone");
    // Only a3 is actually arriving.
    expect(r.occupancyAfter).toBe(3);
  });

  it("warns but still allows going over capacity — isolating a group must not be blocked", () => {
    // pen_a holds 2 of 3; moving a3 in makes 3, moving more would exceed it.
    const r = checkTransfer({ toZoneId: "pen_a", animalIds: ["a3", "a1"] }, ANIMALS, ZONES);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    const over = checkTransfer(
      { toZoneId: "pen_a", animalIds: ["a3"] },
      [...ANIMALS, animal("a4", "pen_b"), animal("a5", "pen_b")],
      ZONES,
    );
    expect(over.ok).toBe(true);
  });

  it("flags over-capacity in the result so the UI can say so", () => {
    const crowded = [
      ...ANIMALS,
      animal("b1", "pen_b"),
      animal("b2", "pen_b"),
      animal("b3", "pen_b"),
    ];
    const r = checkTransfer(
      { toZoneId: "pen_a", animalIds: ["a3", "b1", "b2"] },
      crowded,
      ZONES,
    );
    // pen_a capacity 3, already 2, plus 3 arriving = 5.
    expect(r.occupancyAfter).toBe(5);
    expect(r.overCapacity).toBe(true);
    expect(r.warnings).toContain("over-capacity");
    expect(r.ok).toBe(true);
  });
});

describe("commonOrigin", () => {
  it("records a shared origin pen", () => {
    expect(commonOrigin(["a1", "a2"], ANIMALS)).toBe("pen_a");
  });

  it("leaves it blank for a mixed selection rather than guessing", () => {
    expect(commonOrigin(["a1", "a3"], ANIMALS)).toBeUndefined();
  });
});

describe("transferNumber", () => {
  it("numbers documents by year", () => {
    expect(transferNumber("2026-03-04", 7)).toBe("LT-2026-0007");
  });
});
