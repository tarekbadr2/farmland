import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSnapshot, trackWrite } from "./offline-store";

/**
 * `trackWrite` is the offline-first write wrapper: it bumps a live pending
 * counter, lets the UI proceed once the server acks OR a timeout elapses
 * (whichever first), and routes genuine rejections to `onError` without ever
 * hanging the caller. The counter and the acked/queued decision are what the
 * sync indicator renders, so they're pinned here.
 */

const ACK_TIMEOUT_MS = 6000;

// A promise we control, so a "commit" can be left pending or settled on cue.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const origNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
function setOnline(online: boolean | undefined) {
  if (online === undefined) {
    if (origNavigator) Object.defineProperty(globalThis, "navigator", origNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
    return;
  }
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: online },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  setOnline(undefined);
});

describe("trackWrite", () => {
  it("increments pending immediately and decrements once the commit acks", async () => {
    const base = getSnapshot().pending;
    const d = deferred<string>();

    const p = trackWrite(d.promise);
    expect(getSnapshot().pending).toBe(base + 1);
    expect(getSnapshot().everQueued).toBe(true);

    d.resolve("ok");
    await expect(p).resolves.toBe("acked");
    expect(getSnapshot().pending).toBe(base); // returned to baseline
  });

  it("reports 'queued' when the ack window elapses first, then still settles", async () => {
    const base = getSnapshot().pending;
    const d = deferred<string>();

    const p = trackWrite(d.promise);
    // Not yet resolved and inside the window → still pending, promise unsettled.
    await vi.advanceTimersByTimeAsync(ACK_TIMEOUT_MS - 1);
    expect(getSnapshot().pending).toBe(base + 1);

    await vi.advanceTimersByTimeAsync(1); // crosses ACK_TIMEOUT_MS
    await expect(p).resolves.toBe("queued");
    // The write is still in flight, so it's still counted as pending.
    expect(getSnapshot().pending).toBe(base + 1);

    // When Firestore finally syncs, the counter drops.
    d.resolve("late");
    await Promise.resolve();
    expect(getSnapshot().pending).toBe(base);
  });

  it("routes a rejection to onError, unblocks the UI, and clears pending", async () => {
    const base = getSnapshot().pending;
    const d = deferred<string>();
    const onError = vi.fn();

    const p = trackWrite(d.promise, onError);
    const err = new Error("permission-denied");
    d.reject(err);

    // Resolves rather than rejecting — the UI must never hang on a failed write.
    await expect(p).resolves.toBe("acked");
    expect(onError).toHaveBeenCalledWith(err);
    expect(getSnapshot().pending).toBe(base);
  });

  it("reports 'queued' at once when the browser is known-offline", async () => {
    setOnline(false);
    const base = getSnapshot().pending;
    const d = deferred<string>();

    const p = trackWrite(d.promise);
    // knownOffline → timeout of 0; no need to wait out the 6s window.
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBe("queued");
    expect(getSnapshot().pending).toBe(base + 1); // still durable, still pending

    d.resolve("synced");
    await Promise.resolve();
    expect(getSnapshot().pending).toBe(base);
  });
});
