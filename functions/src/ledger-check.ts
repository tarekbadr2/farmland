/**
 * Pure ledger-balance check — no Firebase imports on purpose.
 *
 * The Cloud Function trigger (ledger.ts) can't be imported by the app's build:
 * it pulls in `firebase-functions`, which isn't a dependency of the web
 * project. But the app's test suite needs to verify this rule so the client and
 * server can't drift. Keeping the rule in a dependency-free file lets the test
 * import it without dragging the trigger — and its firebase-functions import —
 * into `next build`.
 */

export interface JournalLineDoc {
  accountId?: string;
  debit?: number;
  credit?: number;
}

export interface JournalEntryDoc {
  number?: string;
  status?: string;
  description?: string;
  lines?: JournalLineDoc[];
  /** Set by the trigger so it never re-processes its own correction. */
  integrityVoidedAt?: string;
}

export interface LedgerCheck {
  balanced: boolean;
  debit: number;
  credit: number;
  difference: number;
  reason?: "unbalanced" | "no-lines" | "bad-line" | "empty";
}

/** Local round — deliberately no import, to keep this module firebase-free. */
function round(n: number, dp = 2): number {
  return Number(n.toFixed(dp));
}

/**
 * The same rule the client applies, restated where it can't be bypassed:
 * debits must equal credits, every line sits on exactly one side, and an entry
 * with nothing in it is not an entry.
 */
export function checkEntry(entry: JournalEntryDoc): LedgerCheck {
  const lines = entry.lines ?? [];
  if (lines.length === 0) {
    return { balanced: false, debit: 0, credit: 0, difference: 0, reason: "no-lines" };
  }

  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    const d = Number(line.debit ?? 0);
    const c = Number(line.credit ?? 0);
    // A line on both sides (or neither, or negative) is malformed even if the
    // totals happen to come out equal.
    if (!Number.isFinite(d) || !Number.isFinite(c) || d < 0 || c < 0 || (d > 0 && c > 0)) {
      return { balanced: false, debit, credit, difference: 0, reason: "bad-line" };
    }
    debit += d;
    credit += c;
  }

  debit = round(debit);
  credit = round(credit);
  const difference = round(debit - credit);
  if (debit === 0 && credit === 0) {
    return { balanced: false, debit, credit, difference, reason: "empty" };
  }
  return {
    balanced: difference === 0,
    debit,
    credit,
    difference,
    reason: difference === 0 ? undefined : "unbalanced",
  };
}
