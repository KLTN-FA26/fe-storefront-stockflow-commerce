"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import {
  isDesignConflict,
  isDesignGone,
  isDesignStateChanged,
  isPreflightRefusal,
  outdatedRolesOf,
  preflightIssuesOf,
} from "../../errors";
import { invalidateDesign } from "../../mutations";
import { sendDesign } from "../../submission-flow";
import { designKeys, designPrintConfigQuery } from "../../queries";
import type { Design, QuoteRequestInput, ReportedPreflightIssue } from "../../types";
import { newRunNonce } from "../../upload-key";
import { failsOf } from "../submit-set-state";
import { drawDesign } from "../submit-set-steps";
import { ExportError } from "./export-renderer";
import { checkDocument, drawBundle, type Checked, type SubmissionSubject } from "./run-submission";
import type { BundleStep, SubmissionBundle } from "./submission-bundle";
import {
  assertStoredIs,
  DocumentChangedError,
  DocumentEditedError,
  recordFailure,
  storedDocument,
  type SubmissionContext,
} from "./submission-checks";
import { useStudio } from "./studio-context";

/** The template changed on the server and the design no longer passes its checks drawn on it. */
const TEMPLATE_CHANGED =
  "Khuôn in của quy cách này vừa thay đổi và thiết kế chưa còn đạt kiểm tra. Hãy kiểm tra lại thiết kế rồi gửi lại.";

/**
 * The template changed on the server and the design fails its browser checks drawn on it: the work
 * made on the old template is stale, and the findings are the new template's.
 */
class TemplateChangedError extends ExportError {
  constructor(readonly issues: ReportedPreflightIssue[]) {
    super(TEMPLATE_CHANGED);
  }
}

export type SubmitStep = "idle" | "checking" | BundleStep | "send" | "upload" | "done" | "error";

/**
 * What a run has made, kept so a retry does not repeat it. The check comes first; the files are
 * drawn only when the BE says some are outdated (`bundle` stays null until then). `runNonce` is
 * part of every file's idempotency key: the run keeps it for its retries, and a redraw replaces it.
 */
type Work = Checked & { bundle: SubmissionBundle | null; runNonce: string | null };

type State = {
  step: SubmitStep;
  fraction: number;
  error?: unknown;
  /** The failing checks: the browser's preflight, or the server's (`422 PREFLIGHT_FAILED`). */
  issues: ReportedPreflightIssue[] | null;
};
const IDLE: State = { step: "idle", fraction: 0, issues: null };

/**
 * "Gửi duyệt" (spec §6.4): saves what is pending, runs the preflight on exactly what is stored,
 * records a client-side Fail (no files are made), else asks the BE to take the design at once; only
 * when it says files are outdated is the bundle drawn and the named files uploaded (`sendDesign`).
 * A failed upload is retried with the same bundle.
 * `check()` is the first half alone, for the dialog to confirm before anything is drawn. The check
 * and the drawing are the runner's (`run-submission.ts`), run on the open design.
 */
export function useDesignSubmission(design: Design) {
  const services = useStudio();
  const { autosave } = services;
  const client = useQueryClient();
  const ctx: SubmissionContext = { services, client, design };
  const subject: SubmissionSubject = { ...services, design };
  const work = useRef<Work | null>(null);
  const busy = useRef(false);
  /** The attempt succeeded: `retry()` resumes a failed attempt only, so it must not submit again. */
  const isDone = useRef(false);
  /** "Gửi duyệt và yêu cầu báo giá": the request the attempt sends with the design (A-2), or none. */
  const quote = useRef<QuoteRequestInput | null>(null);
  const [state, setState] = useState<State>(IDLE);

  /**
   * Flush and run the preflight on what is then stored. A Fail is recorded (docs 12 §5.3
   * PREFLIGHT_FAILED) and its issues set: null then.
   */
  async function inspect(): Promise<Checked | null> {
    setState({ step: "checking", fraction: 0, issues: null });
    const checked = await checkDocument(subject, await storedDocument(ctx));
    if (checked.report.result === "Pass") return checked;
    // The issues are shown at once; the attempt is recorded after (docs 12 §5.3). A record that
    // fails does not hide them.
    const { issues } = checked.report;
    setState({ step: "error", fraction: 0, issues });
    const error = await recordFailure(ctx, issues);
    if (error !== undefined) setState({ step: "error", fraction: 0, error, issues });
    return null;
  }

  /** Flush and preflight; nothing is drawn yet. Null when the preflight failed. */
  async function prepare(): Promise<Work | null> {
    const checked = await inspect();
    if (!checked) return null;
    // Saved, yet not what is stored (another tab or device saved since this one loaded it), or
    // already edited again: nothing is sent.
    await assertStoredIs(ctx, checked);
    return { ...checked, bundle: null, runNonce: null };
  }

  async function execute() {
    if (busy.current || isDone.current) return;
    busy.current = true;
    try {
      work.current ??= await prepare();
      const w = work.current;
      if (!w) return; // the preflight failed: `prepare` set the issues
      // The BE is asked first; files are drawn and uploaded only if it says so.
      setState({ step: "send", fraction: 0, issues: null });
      await assertStoredIs(ctx, w); // the stored layout is still the drawn one
      const submitted = await sendDesign(design.id, {
        documentChecksum: w.checksum,
        files: w.bundle ?? undefined,
        runNonce: w.runNonce ?? undefined,
        quoteRequest: quote.current ?? undefined,
        // The BE named files to draw (none sent yet, or outdated). The design's template is read afresh first, so a
        // template edited on the server is drawn with its new values: when it differs from the
        // studio's, a session of its own is loaded on it (as a set's designs are); otherwise the
        // same checked document is drawn again here.
        redraw: async (roles) => {
          // Outdated because a second tab saved meanwhile? Then the stored layout is not the
          // drawn one: the conflict dialog, not three more uploads of the old document.
          await assertStoredIs(ctx, w);
          setState({ step: "preview", fraction: 0, issues: null });
          const progress = (step: BundleStep, fraction: number) =>
            setState({ step, fraction, issues: null });
          const config = await client.fetchQuery({
            ...designPrintConfigQuery(design),
            staleTime: 0,
          });
          const changed =
            config !== null &&
            JSON.stringify(config.template) !== JSON.stringify(services.printConfig.template);
          if (changed) {
            const outcome = await drawDesign(
              { client, fonts: services.fonts, signal: new AbortController().signal },
              design.id,
              progress,
              roles,
            );
            // Its findings are on the history (`drawDesign` records them); the stale work goes.
            if ("failed" in outcome) throw new TemplateChangedError(failsOf(outcome.failed));
            w.bundle = outcome.drawn.bundle;
          } else {
            w.bundle = await drawBundle(subject, w, progress, undefined, roles);
          }
          // Drawn while this tab edited or another saved? Then these files are not the stored
          // layout's: nothing is uploaded (the next run checks and draws the new one).
          await assertStoredIs(ctx, w);
          // New files, new upload: another nonce, so a bundle equal to an earlier one is not a replay.
          w.runNonce = newRunNonce();
          setState({ step: "upload", fraction: 0, issues: null });
          return { files: w.bundle, runNonce: w.runNonce };
        },
      });
      // Announced to the status follow: the re-read below covers the move, so it does not read the
      // same queries a second time.
      services.ownStatusMove(submitted.status);
      client.setQueryData(designKeys.detail(design.id), submitted);
      autosave.setVersion(submitted.version); // the next save sends the version the submit left
      work.current = null;
      isDone.current = true;
      setState({ step: "done", fraction: 1, issues: null });
      // Re-reading is best effort: the design is submitted whatever it answers. The answer has no
      // quote request in it: it is read back (A-3).
      invalidateDesign(client, design.id).catch(() => undefined);
      if (quote.current) {
        void client.invalidateQueries({ queryKey: designKeys.quoteRequests(design.id) });
      }
    } catch (error) {
      fail(error);
    } finally {
      busy.current = false;
    }
  }

  function fail(error: unknown) {
    const issues =
      preflightIssuesOf(error) ?? (error instanceof TemplateChangedError ? error.issues : null);
    if (error instanceof TemplateChangedError) {
      // The retry must not resend files drawn on the old template: the next run checks the design
      // on the new one again (the findings are shown, as for any failed check).
      work.current = null;
    } else if (error instanceof DocumentChangedError) {
      // The editor is behind a document saved elsewhere: autosave stops and the conflict dialog
      // offers the reload. The next run draws anew.
      work.current = null;
      autosave.conflict();
    } else if (error instanceof DocumentEditedError) {
      // This tab changed the design meanwhile: no conflict, sending again draws the latest.
      work.current = null;
    } else if (
      isPreflightRefusal(error) ||
      outdatedRolesOf(error) !== null ||
      isDesignConflict(error) ||
      isDesignStateChanged(error) ||
      isDesignGone(error)
    ) {
      // The server judged otherwise — even with issues it could not list, sending the same bundle
      // again meets the same 422 — or the design moved on, or is gone: what was drawn is stale.
      work.current = null;
      void invalidateDesign(client, design.id);
    }
    setState({ step: "error", fraction: 0, error, issues });
  }

  /**
   * Saves what is pending and runs the preflight on what is stored, drawing nothing: a Fail is
   * recorded and its issues set (step `error`). Answers whether it passed (the step is `idle`
   * again), so the customer confirms before `run()` draws and sends the files.
   */
  async function check(): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    work.current = null;
    isDone.current = false;
    try {
      const passed = (await inspect()) !== null;
      if (passed) setState(IDLE);
      return passed;
    } catch (error) {
      fail(error);
      return false;
    } finally {
      busy.current = false;
    }
  }

  return {
    ...state,
    /** A new attempt, with the quote request to send along (none: a plain submission). */
    run: (quoteRequest?: QuoteRequestInput) => {
      // A new attempt (also of a design that came back as a draft): forget the last one.
      if (busy.current) return Promise.resolve();
      work.current = null;
      isDone.current = false;
      quote.current = quoteRequest ?? null;
      setState(IDLE);
      return execute();
    },
    retry: execute,
    /**
     * The attempt again with another quote request (or none), after the BE refused the one sent
     * (400 on `quoteRequest.*`): the files already drawn and uploaded are sent again as they are.
     */
    resume: (quoteRequest: QuoteRequestInput | null) => {
      quote.current = quoteRequest;
      return execute();
    },
    check,
  };
}
