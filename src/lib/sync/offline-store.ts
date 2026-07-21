/**
 * Sync state for offline-first writes.
 *
 * Firestore's persistent cache already makes writes durable and syncs them when
 * the connection returns — the mutation queue survives a reload and drains
 * itself. What it does *not* give us is a UI story: the milker in a dead-signal
 * parlor needs to see that their session is safe and waiting, not a spinner that
 * never resolves.
 *
 * This module supplies that story — an online flag and a live count of writes
 * that have been applied locally but not yet acknowledged by the server —
 * exposed through useSyncExternalStore.
 */

type Listener = () => void;

interface SyncState {
  online: boolean;
  /** Writes applied to the local cache but not yet server-acknowledged. */
  pending: number;
  /** True from the first queued write until the queue next fully drains. */
  everQueued: boolean;
  /**
   * Writes from a *previous* page load are still draining. The in-memory
   * `pending` count can't see these — it resets on reload — so this flag,
   * derived from Firestore's own persisted queue, keeps the indicator honest
   * after a refresh mid-outage.
   */
  reloadSyncing: boolean;
}

let state: SyncState = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  pending: 0,
  everQueued: false,
  reloadSyncing: false,
};

const listeners = new Set<Listener>();

function emit(next: Partial<SyncState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): SyncState {
  return state;
}

/** Stable server snapshot for SSR — the store is client-only. */
const SERVER_SNAPSHOT: SyncState = {
  online: true,
  pending: 0,
  everQueued: false,
  reloadSyncing: false,
};
export function getServerSnapshot(): SyncState {
  return SERVER_SNAPSHOT;
}

export function setReloadSyncing(v: boolean) {
  if (state.reloadSyncing !== v) emit({ reloadSyncing: v, everQueued: v || state.everQueued });
}

/**
 * How long to wait for a server acknowledgement before treating a write as
 * queued and letting the caller proceed. The point is that the UI never blocks
 * on the network: a good connection acks in well under this, and a dead one
 * simply reports "queued" instead of hanging.
 */
const ACK_TIMEOUT_MS = 6000;

/**
 * Wraps a fired write so the UI can move on immediately when the network is
 * slow or absent, while the write itself keeps trying in the background.
 *
 * Returns `"acked"` if the server confirmed within the window, or `"queued"` if
 * it didn't — in which case Firestore will finish syncing on its own and the
 * pending counter drops when it does. A genuine rejection (permission denied,
 * say) is surfaced to `onError` rather than swallowed.
 */
export function trackWrite<T>(
  commit: Promise<T>,
  onError?: (err: unknown) => void,
): Promise<"acked" | "queued"> {
  emit({ pending: state.pending + 1, everQueued: true });

  let settled = false;
  const done = () => {
    if (settled) return;
    settled = true;
    emit({ pending: Math.max(0, state.pending - 1) });
  };

  commit.then(done, (err) => {
    done();
    onError?.(err);
  });

  // Known-offline: don't make the milker wait out the ack window for a server
  // that isn't there. The write is already durable; report "queued" at once and
  // let it sync in the background.
  const knownOffline = typeof navigator !== "undefined" && navigator.onLine === false;

  return new Promise((resolve) => {
    commit.then(
      () => resolve("acked"),
      () => resolve("acked"), // error already routed to onError; unblock the UI
    );
    setTimeout(() => resolve("queued"), knownOffline ? 0 : ACK_TIMEOUT_MS);
  });
}

/** Wire browser connectivity events into the store. Returns a cleanup fn. */
export function initConnectivityWatch(): () => void {
  if (typeof window === "undefined") return () => {};
  const set = () => emit({ online: navigator.onLine });
  window.addEventListener("online", set);
  window.addEventListener("offline", set);
  set();
  return () => {
    window.removeEventListener("online", set);
    window.removeEventListener("offline", set);
  };
}
