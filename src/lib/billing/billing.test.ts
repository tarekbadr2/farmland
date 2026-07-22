import { describe, it, expect } from "vitest";

import { changeKind, unusedCredit, proratedCharge } from "./proration";
import { resolveEntitlement, isoMonth } from "./status";
import { getPlan, formatEgp, PLANS } from "./plans";
import type { Farm } from "@/core/domain/types";

const farm = (sub?: Farm["subscription"], aiUsage?: Farm["aiUsage"]): Farm =>
  ({ id: "f1", subscription: sub, aiUsage } as Farm);

describe("plans", () => {
  it("formats piastres as EGP", () => {
    expect(formatEgp(149900, "en")).toBe("EGP 1,499");
  });
  it("falls back to starter for an unknown tier", () => {
    expect(getPlan(undefined).tier).toBe("starter");
    expect(getPlan("growth").aiQuota).toBe(PLANS.growth.aiQuota);
  });
});

describe("proration", () => {
  it("classifies plan changes", () => {
    expect(changeKind(null, "starter")).toBe("new");
    expect(changeKind("starter", "starter")).toBe("same");
    expect(changeKind("starter", "growth")).toBe("upgrade");
    expect(changeKind("growth", "starter")).toBe("downgrade");
  });

  it("credits unused time and charges the difference", () => {
    const now = new Date("2025-06-01T00:00:00Z");
    const periodEnd = "2025-06-16T00:00:00Z"; // ~15 days left of a 30-day period
    const growth = getPlan("growth"); // 399,900
    const credit = unusedCredit(growth, periodEnd, now);
    // ~half the period remains → ~half the plan credited
    expect(credit).toBeGreaterThan(190_000);
    expect(credit).toBeLessThan(210_000);

    // upgrading to enterprise: charge new price minus credit
    const charge = proratedCharge(growth, getPlan("enterprise"), periodEnd, now);
    expect(charge).toBe(Math.max(0, getPlan("enterprise").amount - credit));

    // a downgrade covered by credit costs nothing
    expect(proratedCharge(growth, getPlan("starter"), periodEnd, now)).toBe(0);
  });

  it("gives no credit once the period has ended", () => {
    const now = new Date("2025-07-01T00:00:00Z");
    expect(unusedCredit(getPlan("growth"), "2025-06-01T00:00:00Z", now)).toBe(0);
  });
});

describe("resolveEntitlement", () => {
  const now = new Date("2025-06-15T00:00:00Z");

  it("grandfathers a farm with no subscription", () => {
    const e = resolveEntitlement(farm(undefined), now);
    expect(e.status).toBe("legacy");
    expect(e.blocked).toBe(false);
  });

  it("allows an active trial and blocks an expired one", () => {
    const live = resolveEntitlement(
      farm({ status: "trialing", tier: "starter", trialEndsAt: "2025-06-20T00:00:00Z" }),
      now,
    );
    expect(live.trialing).toBe(true);
    expect(live.blocked).toBe(false);
    expect(live.trialDaysLeft).toBe(5);

    const dead = resolveEntitlement(
      farm({ status: "trialing", tier: "starter", trialEndsAt: "2025-06-01T00:00:00Z" }),
      now,
    );
    expect(dead.trialing).toBe(false);
    expect(dead.blocked).toBe(true);
  });

  it("treats an active paid plan as entitled", () => {
    const e = resolveEntitlement(
      farm({ status: "active", tier: "growth", currentPeriodEnd: "2025-07-15T00:00:00Z" }),
      now,
    );
    expect(e.paidActive).toBe(true);
    expect(e.blocked).toBe(false);
  });

  it("keeps a canceled plan alive until the period ends, then blocks", () => {
    const grace = resolveEntitlement(
      farm({ status: "canceled", tier: "growth", currentPeriodEnd: "2025-07-15T00:00:00Z" }),
      now,
    );
    expect(grace.canceledGrace).toBe(true);
    expect(grace.blocked).toBe(false);

    const ended = resolveEntitlement(
      farm({ status: "canceled", tier: "growth", currentPeriodEnd: "2025-05-15T00:00:00Z" }),
      now,
    );
    expect(ended.blocked).toBe(true);
  });

  it("flags an exhausted AI quota for the current month", () => {
    const month = isoMonth(now);
    const e = resolveEntitlement(
      farm({ status: "active", tier: "starter", currentPeriodEnd: "2025-07-15T00:00:00Z" }, { month, count: 100 }),
      now,
    );
    expect(e.aiQuota).toBe(PLANS.starter.aiQuota);
    expect(e.aiExhausted).toBe(true);
    expect(e.aiRemaining).toBe(0);
  });

  it("ignores AI usage from a previous month", () => {
    const e = resolveEntitlement(
      farm({ status: "active", tier: "starter", currentPeriodEnd: "2025-07-15T00:00:00Z" }, { month: "2020-01", count: 999 }),
      now,
    );
    expect(e.aiUsed).toBe(0);
    expect(e.aiExhausted).toBe(false);
  });
});
