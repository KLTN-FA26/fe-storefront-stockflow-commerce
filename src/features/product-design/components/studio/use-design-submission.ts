"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { recordPreflightFailure, submitDesign } from "../../api";
import { documentChecksum, runPreflight } from "../../engine";
import type { DesignDocument, PreflightReport } from "../../engine";
import {
  isDesignConflict,
  isDesignGone,
  isDesignStateChanged,
  isPreflightRefusal,
  preflightIssuesOf,
} from "../../errors";
import { invalidateDesign } from "../../mutations";
import { designDocumentQuery, designKeys } from "../../queries";
import type { Design, ReportedPreflightIssue } from "../../types";
import { ExportError } from "./export-renderer";
import { buildSubmissionBundle, type BundleStep, type SubmissionBundle } from "./submission-bundle";
import { useStudio } from "./studio-context";
import { isStored } from "./use-autosave";
import { preflightVariant } from "./use-preflight";

export type SubmitStep = "idle" | "checking" | BundleStep | "upload" | "done" | "error";

const MESSAGES = {
  notSaved: "Thiết kế chưa lưu được nên chưa thể gửi duyệt. Hãy lưu lại rồi thử lại.",
  changed: "Thiết kế vừa thay đổi ở nơi khác. Hãy kiểm tra lại rồi gửi lại.",
} as const;

/**
 * The stored document is no longer the one the files were made from (another tab or device saved
 * it): nothing more is sent, autosave goes into conflict and the next run exports anew.
 */
export class DocumentChangedError extends ExportError {}

/** What a run has made, kept so a retry resumes at the upload without drawing again. */
type Work = { bundle: SubmissionBundle; report: PreflightReport; checksum: string };

type State = {
  step: SubmitStep;
  fraction: number;
  error?: unknown;
  /** The failing checks: the browser's preflight, or the server's (`422 PREFLIGHT_FAILED`). */
  issues: ReportedPreflightIssue[] | null;
};
const IDLE: State = { step: "idle", fraction: 0, issues: null };

/** What a preflight that passed was run on. */
type Checked = { document: DesignDocument; report: PreflightReport };

/**
 * "Gửi duyệt" (spec §6.4): saves what is pending, runs the preflight on exactly what is stored,
 * records a client-side Fail (no files are made), else draws the bundle, checks the stored
 * document is still the drawn one and submits. A failed upload is retried with the same bundle.
 * `check()` is the first half alone, for the dialog to confirm before anything is drawn.
 */
export function useDesignSubmission(design: Design) {
  const services = useStudio();
  const { editor, template, surfaces, autosave, exportRenderer: renderer } = services;
  const client = useQueryClient();
  const work = useRef<Work | null>(null);
  const busy = useRef(false);
  /** The attempt succeeded: `retry()` resumes a failed attempt only, so it must not submit again. */
  const isDone = useRef(false);
  const [state, setState] = useState<State>(IDLE);

  /** The stored document, read fresh: it carries the design's version counter and the checksum. */
  const readStored = () => client.fetchQuery({ ...designDocumentQuery(design.id), staleTime: 0 });
  /**
   * Refuses to go on unless the stored document is still the drawn one (same checksum); answers
   * the version of that very read, so the version sent is the one of the document verified.
   */
  const assertStoredIs = async (checksum: string) => {
    const stored = await readStored();
    if (stored.checksum !== checksum) throw new DocumentChangedError(MESSAGES.changed);
    return stored.version;
  };

  /**
   * Flush and run the preflight on what is then stored. A Fail is recorded (docs 12 §5.3
   * PREFLIGHT_FAILED) and its issues set: null then.
   */
  async function inspect(): Promise<Checked | null> {
    setState({ step: "checking", fraction: 0, issues: null });
    await autosave.flush();
    if (!isStored(autosave.latestState())) throw new ExportError(MESSAGES.notSaved);
    const document = editor.store.getState().document;
    const report = runPreflight({
      document,
      template,
      surfaces,
      sizer: services.sizer,
      assets: services.assetStatus,
      fontStatus: services.fontStatus,
      variant: preflightVariant(services.printConfig),
    });
    if (report.result === "Fail") {
      // The issues are shown at once; the attempt is recorded after (docs 12 §5.3). A record that
      // fails does not hide them.
      setState({ step: "error", fraction: 0, issues: report.issues });
      try {
        const { version } = await readStored();
        await recordPreflightFailure(design.id, { version, issues: report.issues });
        // "Lịch sử" lists the attempt it just recorded.
        void client.invalidateQueries({ queryKey: designKeys.history(design.id) });
      } catch (error) {
        if (isDesignStateChanged(error) || isDesignGone(error)) {
          void invalidateDesign(client, design.id);
        }
        setState({ step: "error", fraction: 0, error, issues: report.issues });
      }
      return null;
    }
    return { document, report };
  }

  /** Flush, preflight, and (when it passes) draw the bundle. Null when the preflight failed. */
  async function prepare(): Promise<Work | null> {
    const checked = await inspect();
    if (!checked) return null;
    const { document, report } = checked;
    const checksum = await documentChecksum(document);
    // Saved, yet not what is stored: another tab or device saved since this one loaded it.
    await assertStoredIs(checksum);
    const bundle = await buildSubmissionBundle({
      name: design.name,
      document,
      template,
      surfaces,
      report,
      checksum,
      renderer,
      onStep: (step, fraction) => setState({ step, fraction, issues: null }),
    });
    return { bundle, report, checksum };
  }

  async function execute() {
    if (busy.current || isDone.current) return;
    busy.current = true;
    try {
      work.current ??= await prepare();
      const w = work.current;
      if (!w) return; // the preflight failed: `prepare` set the issues
      setState({ step: "upload", fraction: 0, issues: null });
      const version = await assertStoredIs(w.checksum);
      const submitted = await submitDesign(design.id, {
        version,
        preflight: w.report,
        files: w.bundle,
      });
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
