import type { QueryClient } from "@tanstack/react-query";

import { hasErrorCode } from "@/lib/api/describe-error";

import type { FontRegistry } from "../engine";
import {
  batchRefusalOf,
  goneDesignIdsOf,
  isDesignGone,
  isDesignStateChanged,
  refusedDesignIdsOf,
  type BatchFailure,
} from "../errors";
import type { Design, OpenReviewRoundInput, ReviewRound, SetPreflightFailureInput } from "../types";
import type { ExportRenderer } from "./studio/export-renderer";
import { DocumentChangedError } from "./studio/submission-checks";
import {
  ANNOUNCE,
  ROW_TEXT,
  STOP_TEXT,
  SetStopError,
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
  repairFiles,
  uploadDrawn,
  type DrawnFiles,
  type RoundDesign,
  type StepDeps,
  type UploadFiles,
} from "./submit-set-steps";

// "Gửi duyệt cả bộ" (docs 12 §4.10, BR-19), outside React: 1. check each design; 2. the customer
// confirms; 3. draw each design in turn and upload its files as a single submission does, then read
// its version; 4. one request opens the round over every `{ id, version }`. Nothing is sent for
// review before step 4, which takes every design or none. A stop keeps what is done: "Thử lại"
// goes on from the design that stopped, without drawing or uploading again what was. "Hủy"
// aborts the run.

export type { RowState, SetPhase, SetState } from "./submit-set-state";

type Failures = SetPreflightFailureInput["items"];

export type SetRunDeps = {
  client: QueryClient;
  /** The project the set is sent from: a design read afresh outside it is no longer of the set. */
  projectId: string;
  fonts: FontRegistry;
  newRenderer?: (() => ExportRenderer) | undefined;
  /** The drafts sent, in order: fixed for the whole run. */
  designs: readonly Design[];
  /** A design's files, bound to the saved layout's checksum (`roles`: only these). */
  upload: UploadFiles;
  /** The design's version as it is now: each upload moved it on. */
  readVersion: (designId: string) => Promise<number>;
  open: (input: OpenReviewRoundInput) => Promise<ReviewRound>;
  /** BATCH_PREFLIGHT_FAILED in the project's history (docs 12 §5.4); a failure is let go. */
  recordSetFailure: (items: Failures) => Promise<unknown>;
  /** Whether the round of these designs is open, read afresh (an answer lost on the way). */
  roundIsOpen: () => Promise<boolean>;
  /**
   * These designs read afresh, in the order of `ids`: `null` for one that is gone (404). Says why
   * the BE refused a design (its code alone does not), and refreshes what the pages show.
   */
  readDesigns: (ids: readonly string[]) => Promise<ReadonlyArray<Design | null>>;
  /**
   * Why a design still a draft at the version sent was refused with `CONFLICT`: the BE's planning
   * also answers it for a design not started on a template, or one with no layout
   * (`DesignSubmissionService.plan`). Null when neither read says so.
   */
  diagnose: (design: Design) => Promise<"noTemplate" | "noLayout" | null>;
};

/** What a design read afresh says of a refused round (`whyRefused`). */
type Outcome =
  | { kind: "unchanged" }
  | { kind: "changed"; message: string; reopen: boolean }
  | { kind: "final"; message: string; reopen: boolean; notDraft: boolean };

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
  /** Kept across stops: passed step 1, drawn not uploaded yet, uploaded (with its version). */
  const passed = new Set<string>();
  const drawn = new Map<string, DrawnFiles>();
  const sent = new Map<string, RoundDesign>();
  /** The BE's "files outdated" is repaired once per run (the files drawn again from a fresh template). */
  let repairedOnce = false;

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

  /** Step 3, one design: its files drawn (unless they are already), uploaded, its version read. */
  async function sendOne(signal: AbortSignal, design: Design): Promise<RoundDesign | null> {
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
        const item = await uploadDrawn(steps(signal), design, files, deps.upload, deps.readVersion);
        if (signal.aborted) return null;
        drawn.delete(id); // the server holds the files now
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
      await deps.open({ designs: designs.map((design) => sent.get(design.id)!) });
    } catch (error) {
      if (hasErrorCode(error, "DESIGN_BATCH_PREFLIGHT_FAILED")) {
        const failures = batchRefusalOf(error);
        return failures ? refusedBatch(signal, error, failures) : unreadableRefusal(signal);
      }
      // A stale version or a design that is no longer a draft (409, naming the designs, BE-4).
      if (hasErrorCode(error, "CONFLICT") || isDesignStateChanged(error)) {
        // A lost answer then "Thử lại": the first request opened the round, and this one meets
        // designs already in review. The project says whether that is so.
        const opened = await deps.roundIsOpen().catch(() => false);
        if (signal.aborted) return;
        if (!opened) return explainConflict(signal, error);
      } else if (isDesignGone(error)) {
        return explainGone(signal, error);
      } else {
        return stopOrAsk(signal, error);
      }
    }
    set(signal, { phase: "done" });
  }

  /** Any other refusal: final ones stall for good; for the network or the server the project says. */
  async function stopOrAsk(signal: AbortSignal, error: unknown) {
    if (isFinal(error)) throw error; // a closed project, a bad request: `go` stalls for good
    // The round may have opened all the same.
    const opened = await deps.roundIsOpen().catch(() => null);
    if (signal.aborted) return;
    if (opened !== true) return stall(signal, error, () => go(sendAll), opened === null);
    set(signal, { phase: "done" });
  }

  /** Forgets what was drawn and sent of a design: it is drawn and uploaded again on the next try. */
  function forget(id: string) {
    sent.delete(id);
    drawn.delete(id);
  }

  /**
   * `422 DESIGN_BATCH_PREFLIGHT_FAILED`: none was sent, and the BE recorded it. A design with
   * findings fails the set (its row lists them); one whose files are outdated has them drawn again
   * from its template read afresh and uploaded, once, and the round is asked for again.
   */
  async function refusedBatch(signal: AbortSignal, error: unknown, failures: BatchFailure[]) {
    if (signal.aborted) return;
    const failed = failures.filter((failure) => failure.issues.length > 0);
    const outdated = failures.filter((failure) => failure.issues.length === 0);
    for (const { designId, issues } of failed) {
      forget(designId);
      passed.delete(designId);
      setRow(signal, designId, { kind: "failed", issues });
    }
    if (failed.length > 0) {
      for (const { designId } of outdated) {
        forget(designId);
        setRow(signal, designId, { kind: "stopped", message: ROW_TEXT.outdated });
      }
      set(signal, { phase: "failed" }); // the BE recorded the failed check itself
      return;
    }
    if (repairedOnce) {
      // Outdated again after the repair: ask the customer to try again, drawing everything anew.
      for (const { designId } of outdated) {
        forget(designId);
        setRow(signal, designId, { kind: "stopped", message: ROW_TEXT.outdated });
      }
      return stall(signal, error, () => go(sendAll));
    }
    repairedOnce = true;
    for (const { designId, roles } of outdated) {
      const design = designs.find((candidate) => candidate.id === designId);
      if (!design) continue;
      setRow(signal, designId, { kind: "drawing", step: "preview", fraction: 0 });
      const outcome = await onRow(signal, designId, () =>
        repairFiles(
          steps(signal),
          design,
          roles,
          deps.upload,
          deps.readVersion,
          (step, fraction) => {
            signal.throwIfAborted();
            setRow(signal, designId, { kind: "drawing", step, fraction });
          },
        ),
      );
      if (signal.aborted) return;
      if ("failed" in outcome) {
        forget(designId);
        passed.delete(designId);
        const fails = failsOf(outcome.failed);
        setRow(signal, designId, { kind: "failed", issues: fails });
        await failSet(signal, [{ designId, issues: fails }]);
        return;
      }
      sent.set(designId, outcome.repaired);
      setRow(signal, designId, { kind: "uploaded" });
    }
    await openRound(signal);
  }

  /**
   * `422 DESIGN_BATCH_PREFLIGHT_FAILED` whose `details` cannot be read or name no design: none was
   * sent, and nothing says what to fix. The run stops; "Thử lại" draws and uploads every design
   * anew (sending the same files would meet the same refusal), once per click, never by itself.
   */
  function unreadableRefusal(signal: AbortSignal) {
    for (const design of designs) forget(design.id);
    stall(signal, new SetStopError(STOP_TEXT.unreadable), () => go(sendAll));
  }

  /**
   * 409 `CONFLICT` / `DESIGN_NOT_DRAFT`. The BE names every design of the batch with that refusal
   * (`details.designIds`, BE-4), but not why: it checks the version before the status, so a design
   * sent, approved or returned elsewhere is a `CONFLICT` too. The named designs are read again and
   * each row says what the read shows (`whyRefused`). When the BE names none of the set (an older
   * BE, or a refusal met after its planning step), every design of the set is read instead.
   */
  async function explainConflict(signal: AbortSignal, error: unknown): Promise<void> {
    const named = (refusedDesignIdsOf(error) ?? []).filter((id) =>
      designs.some((design) => design.id === id),
    );
    const listed = named.length > 0;
    const asked = listed ? designs.filter((design) => named.includes(design.id)) : designs;
    let fresh: ReadonlyArray<Design | null>;
    try {
      fresh = await deps.readDesigns(asked.map((design) => design.id));
    } catch (readError) {
      if (signal.aborted) return;
      // Not known why: "Thử lại" reads them again before anything is drawn.
      return stall(signal, readError, () => go((next) => explainConflict(next, error)));
    }
    if (signal.aborted) return;
    const outcomes: Outcome[] = [];
    for (const [i, design] of asked.entries()) {
      const outcome = await whyRefused(design, fresh[i], listed);
      if (signal.aborted) return;
      if (outcome.kind === "unchanged") continue;
      outcomes.push(outcome);
      if (outcome.kind === "changed") forget(design.id); // drawn and uploaded again on "Thử lại"
      setRow(signal, design.id, {
        kind: "stopped",
        message: outcome.message,
        ...(outcome.reopen ? { reopen: true as const } : {}),
      });
    }
    const final = outcomes.filter((outcome) => outcome.kind === "final");
    if (final.length > 0) {
      // A design that cannot go with the set: the set must be chosen anew, without a redraw.
      const allNotDraft = final.every((outcome) => outcome.notDraft);
      const text = allNotDraft ? STOP_TEXT.notDraft(final.length) : STOP_TEXT.cannotSend;
      return stall(signal, new SetStopError(text), null);
    }
    if (outcomes.length > 0) {
      return stall(signal, new SetStopError(STOP_TEXT.changed(outcomes.length)), () => go(sendAll));
    }
    // Nothing shows which one: every design is drawn and uploaded again on "Thử lại".
    for (const design of designs) forget(design.id);
    stall(signal, error, () => go(sendAll));
  }

  /**
   * What a design read afresh says of the round's refusal:
   *  - gone, or out of the project: it is not of the set any more;
   *  - no longer a draft (sent, approved elsewhere): its new status, no redraw;
   *  - a draft again with a new return (returned elsewhere): its reviewer's reason is to be read
   *    first, no redraw;
   *  - a draft at another version: edited elsewhere, drawn again on "Thử lại";
   *  - a draft at the version sent, named by the BE: no template or no layout (`diagnose`), which
   *    no retry fixes; else taken as edited elsewhere.
   */
  async function whyRefused(
    design: Design,
    now: Design | null | undefined,
    named: boolean,
  ): Promise<Outcome> {
    if (now === undefined) return { kind: "unchanged" };
    if (now === null || now.projectId !== deps.projectId) {
      return { kind: "final", message: ROW_TEXT.notInProject, reopen: false, notDraft: false };
    }
    if (now.status !== "DRAFT") {
      return {
        kind: "final",
        message: ROW_TEXT.notDraft(now.status),
        reopen: true,
        notDraft: true,
      };
    }
    const returned =
      now.lastReturn !== null && now.lastReturn.returnedAt !== design.lastReturn?.returnedAt;
    if (returned) {
      return { kind: "final", message: ROW_TEXT.returned, reopen: true, notDraft: false };
    }
    if (now.version !== sent.get(design.id)?.version) {
      return { kind: "changed", message: ROW_TEXT.changed, reopen: true };
    }
    if (!named) return { kind: "unchanged" };
    const cause = await deps.diagnose(now).catch(() => null);
    if (cause === "noTemplate") {
      return { kind: "final", message: ROW_TEXT.noTemplate, reopen: false, notDraft: false };
    }
    if (cause === "noLayout") {
      return { kind: "final", message: ROW_TEXT.noLayout, reopen: false, notDraft: false };
    }
    return { kind: "changed", message: ROW_TEXT.changed, reopen: true };
  }

  /**
   * 404: a design of the set is gone, or left the project, since the page read it
   * (`requireInProject`). The BE sends no `details`: a design it names, or the set read again,
   * says so on its row; otherwise the alert alone says one is. The run stops for good: the set
   * must be chosen anew.
   */
  async function explainGone(signal: AbortSignal, error: unknown) {
    const named = new Set(goneDesignIdsOf(error) ?? []);
    const fresh = await deps.readDesigns(designs.map((design) => design.id)).catch(() => null);
    if (signal.aborted) return;
    for (const [i, design] of designs.entries()) {
      const now = fresh?.[i];
      const gone = now === null || (now !== undefined && now.projectId !== deps.projectId);
      if (named.has(design.id) || gone) {
        setRow(signal, design.id, { kind: "stopped", message: ROW_TEXT.notInProject });
      }
    }
    stall(signal, new SetStopError(STOP_TEXT.gone), null);
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
