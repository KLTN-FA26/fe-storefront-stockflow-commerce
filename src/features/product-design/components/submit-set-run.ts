import type { QueryClient } from "@tanstack/react-query";

import type { FontRegistry } from "../engine";
import { roundRefusalOf, type RoundRefusal } from "../errors";
import type { SubmissionUploadInput } from "../round-mutations";
import type {
  Design,
  OpenReviewRoundInput,
  ReviewRound,
  ReviewRoundItem,
  SetPreflightFailureInput,
  SubmissionUpload,
} from "../types";
import type { ExportRenderer } from "./studio/export-renderer";
import { DocumentChangedError } from "./studio/submission-checks";
import {
  ANNOUNCE,
  DRAW_AGAIN,
  REFUSED_ROW,
  describeStop,
  failsOf,
  isFinal,
  notesOf,
  type RowState,
  type SetState,
} from "./submit-set-state";
import {
  checkDesign,
  drawDesign,
  uploadDrawn,
  type DrawnFiles,
  type StepDeps,
} from "./submit-set-steps";

// "Gửi duyệt cả bộ" (spec 2026-11-12 §8, docs 12 §4.10, BR-19), outside React: 1. check each
// design; 2. the customer confirms; 3. draw and upload each design in turn; 4. open the round.
// Nothing is sent for review before step 4, which takes every design or none. A stop keeps what
// is done: "Thử lại" goes on from the design that stopped, without drawing or uploading again what
// was (the upload's key is kept with the files). "Hủy" aborts the run.

export type { RowState, SetPhase, SetState } from "./submit-set-state";

type Failures = SetPreflightFailureInput["items"];

export type SetRunDeps = {
  client: QueryClient;
  fonts: FontRegistry;
  newRenderer?: (() => ExportRenderer) | undefined;
  /** The drafts sent, in order: fixed for the whole run. */
  designs: readonly Design[];
  upload: (input: SubmissionUploadInput) => Promise<SubmissionUpload>;
  open: (input: OpenReviewRoundInput) => Promise<ReviewRound>;
  /** BATCH_PREFLIGHT_FAILED in the project's history (docs 12 §5.4); a failure is let go. */
  recordSetFailure: (items: Failures) => Promise<unknown>;
  /** Whether the round of these designs is open, read afresh (an answer lost on the way). */
  roundIsOpen: () => Promise<boolean>;
};

/** How many times files drawn of a design saved elsewhere before their upload are drawn again. */
const DRAWS = 3;

export function createSetRun(deps: SetRunDeps) {
  const { designs } = deps;
  const count = designs.length;
  let state: SetState = {
    phase: "checking",
    step: 1,
    rows: Object.fromEntries(designs.map((design) => [design.id, { kind: "waiting" }])),
    error: null,
    canRetry: false,
    roundUnknown: false,
    announcement: null,
  };
  const listeners = new Set<() => void>();
  let controller: AbortController | null = null;
  /** What "Thử lại" runs (`stalled`). */
  let resume: (() => Promise<void>) | null = null;
  /** Kept across stops: passed step 1, drawn not uploaded yet, uploaded. */
  const passed = new Set<string>();
  const drawn = new Map<string, DrawnFiles>();
  const sent = new Map<string, ReviewRoundItem>();

  /** A change of a run that was not called off ("Hủy", or the page left). */
  function set(signal: AbortSignal, patch: Partial<SetState>) {
    if (signal.aborted) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }
  const setRow = (signal: AbortSignal, id: string, row: RowState) =>
    set(signal, { rows: { ...state.rows, [id]: row } });
  const announce = (signal: AbortSignal, text: string) =>
    set(signal, { announcement: { text, id: (state.announcement?.id ?? 0) + 1 } });
  const steps = (signal: AbortSignal): StepDeps => ({ ...deps, signal });

  function stall(
    signal: AbortSignal,
    error: unknown,
    retry: (() => Promise<void>) | null,
    roundUnknown = false,
  ) {
    if (signal.aborted) return;
    resume = retry;
    set(signal, { phase: "stalled", error, canRetry: retry !== null, roundUnknown });
  }

  /** Runs one stretch; an error (other than the abort) stalls the run, for "Thử lại" to run it again. */
  async function go(work: (signal: AbortSignal) => Promise<void>): Promise<void> {
    const signal = controller?.signal;
    if (!signal || signal.aborted) return;
    try {
      await work(signal);
    } catch (error) {
      stall(signal, error, isFinal(error) ? null : () => go(work));
    }
  }

  /** `work` on one design; an error stops the run with the reason on that design's row. */
  async function onRow<T>(signal: AbortSignal, id: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (!signal.aborted) setRow(signal, id, { kind: "stopped", message: describeStop(error) });
      throw error;
    }
  }

  /** The set did not pass: nothing is sent; the project's history says what failed. */
  async function failSet(signal: AbortSignal, failures: Failures) {
    set(signal, { phase: "failed" });
    if (!signal.aborted) await deps.recordSetFailure(failures);
  }

  /** Step 1: every design is checked; one Fail (or more) stops the set (BR-19). */
  async function checkAll(signal: AbortSignal) {
    set(signal, { phase: "checking", step: 1 });
    const failures: Failures = [];
    for (const [i, { id, name }] of designs.entries()) {
      if (passed.has(id)) continue;
      setRow(signal, id, { kind: "checking" });
      announce(signal, ANNOUNCE.checking(name, i + 1, count));
      const report = await onRow(signal, id, () => checkDesign(steps(signal), id));
      if (signal.aborted) return;
      const fails = failsOf(report);
      if (report.result === "Fail") {
        failures.push({ designId: id, issues: fails });
        setRow(signal, id, { kind: "failed", issues: fails });
      } else {
        passed.add(id);
        setRow(signal, id, { kind: "passed", notes: notesOf(report) });
      }
      announce(signal, ANNOUNCE.checked(name, report.result === "Pass"));
    }
    if (failures.length) await failSet(signal, failures);
    else set(signal, { phase: "confirm", step: 2 });
  }

  /** Step 3, one design: its files drawn (unless they are already), then uploaded. */
  async function sendOne(signal: AbortSignal, design: Design): Promise<ReviewRoundItem | null> {
    const { id } = design;
    for (let draw = 1; ; draw += 1) {
      let files = drawn.get(id);
      if (!files) {
        setRow(signal, id, { kind: "drawing", step: "preview", fraction: 0 });
        const outcome = await drawDesign(steps(signal), id, (step, fraction) => {
          signal.throwIfAborted(); // "Hủy" stops the drawing at its next file or surface
          setRow(signal, id, { kind: "drawing", step, fraction });
        });
        if (signal.aborted) return null;
        if ("failed" in outcome) {
          passed.delete(id);
          const fails = failsOf(outcome.failed);
          setRow(signal, id, { kind: "failed", issues: fails });
          await failSet(signal, [{ designId: id, issues: fails }]);
          return null;
        }
        files = outcome.drawn;
        drawn.set(id, files);
      }
      setRow(signal, id, { kind: "uploading" });
      try {
        const item = await uploadDrawn(steps(signal), design, files, deps.upload);
        if (signal.aborted) return null;
        drawn.delete(id); // the server holds the bytes now
        return item;
      } catch (error) {
        // Saved elsewhere since drawn: these files are stale, draw them again.
        if (!(error instanceof DocumentChangedError) || draw >= DRAWS) throw error;
        drawn.delete(id);
      }
    }
  }

  /** Step 3: each design in turn, from the first not uploaded; then step 4. */
  async function sendAll(signal: AbortSignal) {
    set(signal, { phase: "sending", step: 3 });
    for (const [i, design] of designs.entries()) {
      if (sent.has(design.id)) {
        setRow(signal, design.id, { kind: "uploaded" });
        continue;
      }
      announce(signal, ANNOUNCE.drawing(design.name, i + 1, count));
      const item = await onRow(signal, design.id, () => sendOne(signal, design));
      if (!item || signal.aborted) return; // stopped: aborted, or the design fails its check now
      sent.set(design.id, item);
      setRow(signal, design.id, { kind: "uploaded" });
      announce(signal, ANNOUNCE.uploaded(sent.size, count));
    }
    await openRound(signal);
  }

  /** Step 4: one call puts every design in the round, or none (BR-19). */
  async function openRound(signal: AbortSignal) {
    set(signal, { phase: "opening", step: 4 });
    announce(signal, ANNOUNCE.opening);
    try {
      await deps.open({ items: designs.map((design) => sent.get(design.id)!) });
    } catch (error) {
      const refusal = roundRefusalOf(error);
      if (refusal) return refused(signal, error, refusal);
      if (isFinal(error)) throw error; // a closed project, a set too small: `go` stalls for good
      // The network, the server: the round may have opened all the same. The project says.
      const opened = await deps.roundIsOpen().catch(() => null);
      if (signal.aborted) return;
      if (opened !== true) return stall(signal, error, () => go(sendAll), opened === null);
    }
    set(signal, { phase: "done" });
  }

  /** The round named the designs in its way; their rows say why. */
  function refused(signal: AbortSignal, error: unknown, refusal: RoundRefusal) {
    if (signal.aborted) return;
    for (const id of refusal.designIds) {
      sent.delete(id);
      drawn.delete(id);
      if (refusal.code === "PREFLIGHT_FAILED") {
        passed.delete(id);
        const failure = refusal.failures.find((f) => f.designId === id);
        setRow(signal, id, { kind: "failed", issues: failure?.issues ?? [] });
      } else {
        const message = REFUSED_ROW[refusal.code] ?? describeStop(error);
        setRow(signal, id, { kind: "stopped", message });
      }
    }
    // The server recorded the failed check itself (BATCH_PREFLIGHT_FAILED).
    if (refusal.code === "PREFLIGHT_FAILED") set(signal, { phase: "failed" });
    else stall(signal, error, DRAW_AGAIN.has(refusal.code) ? () => go(sendAll) : null);
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Starts (or, after `stop`, starts again) step 1, the page being on screen. */
    start() {
      controller?.abort();
      controller = new AbortController();
      if (state.phase === "checking") void go(checkAll);
    },
    /** "Hủy", or the page left: nothing more is done; a round not opened yet never is. */
    stop() {
      controller?.abort();
    },
    /** Step 2: the customer sends the set. */
    confirm() {
      if (state.phase === "confirm") void go(sendAll);
    },
    /** Goes on from where the run stalled. */
    retry() {
      if (state.phase !== "stalled" || !resume) return;
      const next = resume;
      resume = null;
      void next();
    },
    /** After a Fail: checks every design again (one may have been fixed meanwhile). */
    recheck() {
      if (state.phase !== "failed") return;
      passed.clear();
      void go(checkAll);
    },
  };
}
