import { describe, expect, it } from "vitest";

import { classifyAnimal, herdStructure } from "./metrics";
import type { Animal } from "@/core/domain/types";

// Minimal animal factory — only the fields the classifier reads matter.
const animal = (over: Partial<Animal>): Animal =>
  ({
    id: "a",
    sex: "female",
    isCalf: false,
    status: "active",
    milkStatus: "dry",
    reproStatus: "open",
    ...over,
  } as Animal);

describe("classifyAnimal", () => {
  it("buckets calves by sex, regardless of other fields", () => {
    expect(classifyAnimal(animal({ isCalf: true, sex: "female", milkStatus: "lactating" }))).toEqual({
      sex: "female",
      sub: "calf",
    });
    expect(classifyAnimal(animal({ isCalf: true, sex: "male" }))).toEqual({ sex: "male", sub: "calf" });
  });

  it("puts every grown male in fattening", () => {
    expect(classifyAnimal(animal({ sex: "male", isCalf: false }))).toEqual({
      sex: "male",
      sub: "fattening",
    });
  });

  it("counts a milking cow as lactating even when she's also pregnant", () => {
    expect(
      classifyAnimal(animal({ sex: "female", milkStatus: "lactating", reproStatus: "pregnant" })),
    ).toEqual({ sex: "female", sub: "lactating" });
  });

  it("counts a non-milking in-calf female as pregnant (springing / dry-pregnant)", () => {
    expect(
      classifyAnimal(animal({ sex: "female", milkStatus: "dry", reproStatus: "pregnant" })),
    ).toEqual({ sex: "female", sub: "pregnant" });
  });

  it("counts a dry, open female as dry", () => {
    expect(
      classifyAnimal(animal({ sex: "female", milkStatus: "dry", reproStatus: "open" })),
    ).toEqual({ sex: "female", sub: "dry" });
  });

  it("counts a never-calved female (heifer milk status) as a heifer", () => {
    expect(
      classifyAnimal(animal({ sex: "female", milkStatus: "heifer", reproStatus: "open" })),
    ).toEqual({ sex: "female", sub: "heifer" });
  });
});

describe("herdStructure", () => {
  it("tallies live animals by sex and subcategory, excluding disposed head", () => {
    const s = herdStructure([
      animal({ sex: "female", milkStatus: "lactating" }),
      animal({ sex: "female", milkStatus: "lactating", reproStatus: "pregnant" }),
      animal({ sex: "female", milkStatus: "dry", reproStatus: "pregnant" }),
      animal({ sex: "female", milkStatus: "dry", reproStatus: "open" }),
      animal({ sex: "female", milkStatus: "heifer" }),
      animal({ sex: "female", isCalf: true }),
      animal({ sex: "male", isCalf: true }),
      animal({ sex: "male" }),
      animal({ sex: "male", status: "sold" }), // disposed — excluded
    ]);
    expect(s.female).toEqual({ total: 6, lactating: 2, pregnant: 1, dry: 1, heifer: 1, calf: 1 });
    expect(s.male).toEqual({ total: 2, fattening: 1, calf: 1 });
    expect(s.total).toBe(8);
    expect(s.calves).toBe(2);
  });
});
