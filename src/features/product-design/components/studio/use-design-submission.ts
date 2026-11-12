"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { submitDesign } from "../../api";
import { documentChecksum } from "../../engine";
import type { PreflightReport } from "../../engine";
import {
  isDesignConflict,
  isDesignGone,
  isDesignStateChanged,
  isPreflightRefusal,
  preflightIssuesOf,
} from "../../errors";
import { invalidateDesign } from "../../mutations";
import { designKeys } from "../../queries";
import type { Design, ReportedPreflightIssue } from "../../types";
import { buildSubmissionBundle, type BundleStep, type SubmissionBundle } from "./submission-bundle";
import {
  assertStoredIs,
  DocumentChangedError,
  DocumentEditedError,
  preflightStored,
  recordFailure,
  type Checked,
  type Drawn,
  type SubmissionContext,
} from "./submission-checks";
import { useStudio } from "./studio-context";

export type SubmitStep = "idle" | "checking" | BundleStep | "upload" | "done" | "error";

/** What a run has made, kept so a retry resumes at the upload without drawing again. */
type Work = Drawn & { bundle: SubmissionBundle; report: PreflightReport };

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
 * records a client-side Fail (no files are made), else draws the bundle, checks the stored
 * document is still the drawn one and submits. A failed upload is retried with the same bundle.
 * `check()` is the first half alone, for the dialog to confirm before anything is drawn.
 */
export function useDesignSubmission(design: Design) {
  const services = useStudio();
  const { template, surfaces, autosave, exportRenderer: renderer } = services;
  const client = useQueryClient();
  const ctx: SubmissionContext = { services, client, design };
  const work = useRef<Work | null>(null);
  const busy = useRef(false);
  /** The attempt succeeded: `retry()` resumes a failed attempt only, so it must not submit again. */
  const isDone = useRef(false);
  const [state, setState] = useState<State>(IDLE);

  /**
   * Flush and run the preflight on what is then stored. A Fail is recorded (docs 12 §5.3
   * PREFLIGHT_FAILED) and its issues set: null then.
   */
  async function inspect(): Promise<Checked | null> {
    setState({ step: "checking", fraction: 0, issues: null });
    const checked = await preflightStored(ctx);
    if (checked.report.result === "Pass") return checked;
    // The issues are shown at once; the attempt is recorded after (docs 12 §5.3). A record that
    // fails does not hide them.
    const { issues } = checked.report;
    setState({ step: "error", fraction: 0, issues });
    const error = await recordFailure(ctx, issues);
    if (error !== undefined) setState({ step: "error", fraction: 0, error, issues });
    return null;
  }

  /** Flush, preflight, and (when it passes) draw the bundle. Null when the preflight failed. */
  async function prepare(): Promise<Work | null> {
    const checked = await inspect();
    if (!checked) return null;
    const { document, report } = checked;
    const drawn = { document, checksum: await documentChecksum(document) };
    // Saved, yet not what is stored (another tab or device saved since this one loaded it), or
    // already edited again: nothing is drawn.
    await assertStoredIs(ctx, drawn);
    const bundle = await buildSubmissionBundle({
      name: design.name,
      document,
      template,
      surfaces,
      report,
      checksum: drawn.checksum,
      renderer,
      onStep: (step, fraction) => setState({ step, fraction, issues: null }),
    });
    return { ...drawn, bundle, report };
  }

  async function execute() {
    if (busy.current || isDone.current) return;
    busy.current = true;
    try {
      work.current ??= await prepare();
      const w = work.current;
      if (!w) return; // the preflight failed: `prepare` set the issues
      setState({ step: "upload", fraction: 0, issues: null });
      const version = await assertStoredIs(ctx, w);
      const submitted = await submitDesign(design.id, {
        version,
        preflight: w.report,
        files: w.bundle,
      });
      // Announced to the status follow: the re-read below covers the move, so it does not read the
      // same queries a second time.
      services.ownStatusMove(submitted.status);
      client.setQueryData(designKeys.detail(design.id), submitted);
      autosave.setVersion(submitted.version); // the next save sends the version the submit left
      work.current = null;
      isDone.current = true;
      setState({ step: "done", fraction: 1, issues: null });
      // Re-reading is best effort: the design is submitted whatever it answers.
      invalidateDesign(client, design.id).catch(() => undefined);
    } catch (error) {
      fail(error);
    } finally {
      busy.current = false;
    }
  }

  function fail(error: unknown) {
    const issues = preflightIssuesOf(error);
    if (error instanceof DocumentChangedError) {
      // The editor is behind a document saved elsewhere: autosave stops and the conflict dialog
      // offers the reload. The next run draws anew.
      work.current = null;
      autosave.conflict();
    } else if (error instanceof DocumentEditedError) {
      // This tab changed the design meanwhile: no conflict, sending again draws the latest.
      work.current = null;
    } else if (
      isPreflightRefusal(error) ||
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
    run: () => {
      // A new attempt (also of a design that came back as a draft): forget the last one.
      if (busy.current) return Promise.resolve();
      work.current = null;
      isDone.current = false;
      setState(IDLE);
      return execute();
    },
    retry: execute,
    check,
  };
}
