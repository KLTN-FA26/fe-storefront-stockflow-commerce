import { ApiError } from "@/lib/api/error";

import type { DesignDocument } from "./engine/document/schema";
import { isDesignConflict } from "./errors";

export type AutosaveState =
  "idle" | "pending" | "saving" | "saved" | "error" | "conflict" | "offline";

export type AutosaveChange = {
  state: AutosaveState;
  /** When the last successful save landed (the BE's `updatedAt`); absent before the first. */
  savedAt?: string;
  /** The latest version the BE confirmed: the next save sends it back. */
  version: number;
  /** What made the state `error`, `offline` or `conflict` (e.g. the local oversize refusal). */
  error?: unknown;
};

export type AutosaveOptions = {
  save: (doc: DesignDocument, version: number) => Promise<{ version: number; savedAt: string }>;
  initialVersion: number;
  /** Quiet time after the last change before saving. Spec §7.4: 1500 ms. */
  delayMs?: number;
  isOnline?: () => boolean;
  onChange: (change: AutosaveChange) => void;
};

export type Autosaver = {
  /** The document changed: save it after a quiet period (later calls replace earlier ones). */
  schedule(doc: DesignDocument): void;
  /** Saves what is pending now (route leave, `visibilitychange`); settles when it is stored or failed. */
  flush(): Promise<void>;
  /** The user's "Thử lại" after an error, or an immediate attempt while offline. */
  retry(): void;
  /**
   * Adopts a newer version of the design that another write produced (artifact upload,
   * `PUT /specification`, a review request all bump the shared version): the next save sends it.
   * A version that is not newer than the one held is ignored.
   */
  setVersion(version: number): void;
  /**
   * Saving starts over after a conflict was resolved by reloading: the editor holds the stored
   * document of `version` again, so nothing pending is sent and the state is `idle`.
   */
  resume(version: number): void;
  /**
   * Another writer changed the stored document (found without a save of ours failing, R69):
   * saving stops as on a 409 — what is pending is dropped and later changes are ignored until
   * `resume`.
   */
  conflict(error?: unknown): void;
  dispose(): void;
};

export const AUTOSAVE_DELAY_MS = 1500;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 30_000;

/** Wait before offline attempt `attempt` (0-based): 2 s, 4 s, 8 s, … never more than 30 s. */
export const offlineBackoffMs = (attempt: number) =>
  Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);

const defaultIsOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;
const isNetworkFailure = (error: unknown) => error instanceof ApiError && error.status === 0;

/**
 * Debounced, single-flight autosave of the design document (spec §7.4). Documents are whole
 * snapshots, so the newest pending one always replaces an older one. The state machine:
 * a change → `pending`; the save → `saving` → `saved`; a 409 → `conflict` (terminal: later
 * changes are ignored); no network → `offline` (retried with backoff and when `online` fires);
 * any other failure → `error`: `retry()` saves at once, and a later change is saved after the
 * quiet period like any other (an oversize refusal clears once the design is simpler).
 */
export function createAutosaver(options: AutosaveOptions): Autosaver {
  const { save, onChange, delayMs = AUTOSAVE_DELAY_MS, isOnline = defaultIsOnline } = options;

  let version = options.initialVersion;
  let savedAt: string | undefined;
  let state: AutosaveState = "idle";
  let pending: DesignDocument | null = null;
  let inFlight: Promise<void> | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let backoff: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let disposed = false;

  const emit = (next: AutosaveState, failure?: { error: unknown }) => {
    state = next;
    onChange({ state, version, ...(savedAt ? { savedAt } : {}), ...failure });
  };
  const stopped = () => disposed || state === "conflict";
  const clearDebounce = () => {
    if (debounce) clearTimeout(debounce);
    debounce = null;
  };
  const clearBackoff = () => {
    if (backoff) clearTimeout(backoff);
    backoff = null;
  };

  function goOffline(error?: unknown) {
    clearDebounce();
    clearBackoff();
    backoff = setTimeout(() => {
      backoff = null;
      void startDrain();
    }, offlineBackoffMs(attempt));
    attempt += 1;
    emit("offline", error === undefined ? undefined : { error });
  }

  function fail(error: unknown) {
    if (isDesignConflict(error)) {
      clearDebounce();
      clearBackoff();
      pending = null;
      emit("conflict", { error });
    } else if (isNetworkFailure(error) || !isOnline()) {
      goOffline(error);
    } else {
      emit("error", { error });
    }
  }

  /** Saves `pending` until nothing is left to save, one request at a time. */
  async function drain() {
    clearBackoff();
    while (pending !== null && !stopped()) {
      if (!isOnline()) return goOffline();
      const doc = pending;
      pending = null;
      emit("saving");
      try {
        const saved = await save(doc, version);
        if (stopped()) return; // disposed, or a conflict was declared while this save was open
        // Not `saved.version` alone: `setVersion` may have adopted a newer one while this was open.
        version = Math.max(version, saved.version);
        savedAt = saved.savedAt;
        attempt = 0;
      } catch (error) {
        if (stopped()) return;
        pending ??= doc; // a document scheduled meanwhile is newer: it wins
        return fail(error);
      }
      if (pending === null) return emit("saved");
      // Changes made while saving wait for their own quiet period, unless it already elapsed.
      if (debounce) return emit("pending");
    }
  }

  /** `inFlight` is set before `drain` runs, so a re-entrant call cannot start a second save. */
  function startDrain() {
    if (!inFlight) {
      let release!: () => void;
      inFlight = new Promise<void>((resolve) => {
        release = resolve;
      });
      void drain().finally(() => {
        inFlight = null;
        release();
      });
    }
    return inFlight;
  }

  function schedule(doc: DesignDocument) {
    if (stopped()) return;
    pending = doc;
    // Offline, the newest document waits for the backoff or the network (an `error` does not).
    if (state === "offline") return;
    clearDebounce();
    debounce = setTimeout(() => {
      debounce = null;
      void startDrain();
    }, delayMs);
    if (state !== "pending" && state !== "saving") emit("pending");
  }

  async function flush() {
    clearDebounce();
    do {
      await startDrain();
    } while (pending !== null && !stopped() && state !== "error" && state !== "offline");
  }

  function retry() {
    if (stopped()) return;
    attempt = 0;
    clearDebounce();
    void startDrain();
  }

  function setVersion(next: number) {
    if (next > version) version = next;
  }

  function resume(next: number) {
    if (disposed) return;
    clearDebounce();
    clearBackoff();
    pending = null;
    attempt = 0;
    version = next;
    emit("idle");
  }

  function conflict(error?: unknown) {
    if (stopped()) return;
    clearDebounce();
    clearBackoff();
    pending = null;
    emit("conflict", error === undefined ? undefined : { error });
  }

  const handleOnline = () => {
    if (state !== "offline" || stopped()) return;
    attempt = 0;
    void startDrain();
  };
  if (typeof window !== "undefined") window.addEventListener("online", handleOnline);

  function dispose() {
    disposed = true;
    pending = null;
    clearDebounce();
    clearBackoff();
    if (typeof window !== "undefined") window.removeEventListener("online", handleOnline);
  }

  return { schedule, flush, retry, setVersion, resume, conflict, dispose };
}
