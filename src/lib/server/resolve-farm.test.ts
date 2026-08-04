import { describe, it, expect } from "vitest";

import { resolveUserFarmId } from "./resolve-farm";

describe("resolveUserFarmId", () => {
  it("reads an invited user's scalar farmId", () => {
    expect(resolveUserFarmId({ farmId: "f_invite", role: "worker" })).toBe("f_invite");
  });

  it("reads a self-serve owner's defaultFarmId (the bug that blocked checkout)", () => {
    expect(resolveUserFarmId({ farmIds: ["f_own"], defaultFarmId: "f_own", role: "owner" })).toBe(
      "f_own",
    );
  });

  it("falls back to the first of farmIds when there's no default", () => {
    expect(resolveUserFarmId({ farmIds: ["f_a", "f_b"] })).toBe("f_a");
  });

  it("prefers the scalar, then default, then the array", () => {
    expect(
      resolveUserFarmId({ farmId: "f_scalar", defaultFarmId: "f_def", farmIds: ["f_arr"] }),
    ).toBe("f_scalar");
  });

  it("returns null for an empty or malformed mapping", () => {
    expect(resolveUserFarmId(undefined)).toBeNull();
    expect(resolveUserFarmId(null)).toBeNull();
    expect(resolveUserFarmId({})).toBeNull();
    expect(resolveUserFarmId({ farmIds: [] })).toBeNull();
    expect(resolveUserFarmId({ farmIds: [123] })).toBeNull();
  });
});
