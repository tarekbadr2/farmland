import { describe, it, expect } from "vitest";

import { checkEntry } from "../../../functions/src/ledger";

/**
 * The server-side guard mirrors the client's balance rule. It's tested from the
 * app's suite so the two can't drift apart unnoticed — if the client ever
 * accepts something the function would quarantine, that's a bug worth failing.
 */
describe("checkEntry (Cloud Function ledger guard)", () => {
  const line = (debit: number, credit: number) => ({ accountId: "a", debit, credit });

  it("accepts a balanced entry", () => {
    const r = checkEntry({ lines: [line(100, 0), line(0, 100)] });
    expect(r).toMatchObject({ balanced: true, debit: 100, credit: 100, difference: 0 });
  });

  it("rejects one where the sides don't match", () => {
    const r = checkEntry({ lines: [line(100, 0), line(0, 60)] });
    expect(r.balanced).toBe(false);
    expect(r.reason).toBe("unbalanced");
    expect(r.difference).toBe(40);
  });

  it("rejects a line sitting on both sides even if the totals tie out", () => {
    // 50/50 on one line and 50/50 on another sums equal, but each line is junk.
    const r = checkEntry({ lines: [line(50, 50), line(50, 50)] });
    expect(r.balanced).toBe(false);
    expect(r.reason).toBe("bad-line");
  });

  it("rejects negative and non-finite amounts", () => {
    expect(checkEntry({ lines: [line(-100, 0), line(0, -100)] }).reason).toBe("bad-line");
    expect(checkEntry({ lines: [line(Number.NaN, 0)] }).reason).toBe("bad-line");
  });

  it("rejects an entry with no lines, or only zeroes", () => {
    expect(checkEntry({ lines: [] }).reason).toBe("no-lines");
    expect(checkEntry({}).reason).toBe("no-lines");
    expect(checkEntry({ lines: [line(0, 0)] }).reason).toBe("empty");
  });

  it("tolerates floating-point noise that rounds to a match", () => {
    const r = checkEntry({ lines: [line(0.1 + 0.2, 0), line(0, 0.3)] });
    expect(r.balanced).toBe(true);
  });
});
