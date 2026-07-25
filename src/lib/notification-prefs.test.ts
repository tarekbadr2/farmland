import { describe, expect, it } from "vitest";

import { inQuietHours, type QuietHours } from "./notification-prefs";

const at = (h: number, m = 0) => h * 60 + m;

describe("inQuietHours", () => {
  it("is off when disabled", () => {
    const q: QuietHours = { enabled: false, start: "22:00", end: "06:00" };
    expect(inQuietHours(q, at(23))).toBe(false);
  });

  it("handles a same-day window (start < end)", () => {
    const q: QuietHours = { enabled: true, start: "13:00", end: "14:00" };
    expect(inQuietHours(q, at(12, 59))).toBe(false);
    expect(inQuietHours(q, at(13))).toBe(true); // inclusive start
    expect(inQuietHours(q, at(13, 30))).toBe(true);
    expect(inQuietHours(q, at(14))).toBe(false); // exclusive end
  });

  it("wraps past midnight (start > end)", () => {
    const q: QuietHours = { enabled: true, start: "22:00", end: "06:00" };
    expect(inQuietHours(q, at(21, 59))).toBe(false);
    expect(inQuietHours(q, at(22))).toBe(true);
    expect(inQuietHours(q, at(2))).toBe(true); // after midnight
    expect(inQuietHours(q, at(5, 59))).toBe(true);
    expect(inQuietHours(q, at(6))).toBe(false); // exclusive end
    expect(inQuietHours(q, at(12))).toBe(false); // midday
  });

  it("treats a zero-length window as off", () => {
    const q: QuietHours = { enabled: true, start: "08:00", end: "08:00" };
    expect(inQuietHours(q, at(8))).toBe(false);
  });

  it("treats an unparseable time as off rather than silencing everything", () => {
    const q: QuietHours = { enabled: true, start: "nope", end: "06:00" };
    expect(inQuietHours(q, at(3))).toBe(false);
  });
});
