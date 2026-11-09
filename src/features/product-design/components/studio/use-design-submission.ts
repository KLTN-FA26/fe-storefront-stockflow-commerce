"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { recordPreflightFailure, submitDesign } from "../../api";
import { documentChecksum, runPreflight, VARIANT_OK, type PreflightIssue } from "../../engine";
import type { PreflightReport } from "../../engine";
import { isDesignConflict, isDesignStateChanged, preflightIssuesOf } from "../../errors";
import { invalidateDesign } from "../../mutations";
import { designDocumentQuery, designKeys, designQuery } from "../../queries";
import type { Design } from "../../types";
import { ExportError } from "./export-renderer";
import { buildSubmissionBundle, type BundleStep, type SubmissionBundle } from "./submission-bundle";
import { useStudio } from "./studio-context";
import { isStored } from "./use-autosave";

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
  issues: PreflightIssue[] | null;
};
const IDLE: State = { step: "idle", fraction: 0, issues: null };

/**
 * "Gửi duyệt" (spec §6.4): saves what is pending, runs the preflight on exactly what is stored,
 * records a client-side Fail (no files are made), else draws the bundle, checks the stored
 * document is still the drawn one and submits. A failed upload is retried with the same bundle.
 */
export function useDesignSubmission(design: Design) {
  const services = useStudio();
  const { editor, template, surfaces, autosave, exportRenderer: renderer } = services;
  const client = useQueryClient();
  const work = useRef<Work | null>(null);
  const busy = useRef(false);
  const [state, setState] = useState<State>(IDLE);

  const freshVersion = async () =>
    (await client.fetchQuery({ ...designQuery(design.id), staleTime: 0 })).version;
  /** Refuses to go on unless the stored document is still the drawn one (same checksum). */
  const assertStoredIs = async (checksum: string) => {
    const stored = await client.fetchQuery({ ...designDocumentQuery(design.id), staleTime: 0 });
    if (stored.checksum !== checksum) throw new DocumentChangedError(MESSAGES.changed);
  };

  /** Flush, preflight, and (when it passes) draw the bundle. Null when the preflight failed. */
  async function prepare(): Promise<Work | null> {
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
      variant: VARIANT_OK, // Task 9 replaces it with the variant's print configuration
    });
    if (report.result === "Fail") {
      await recordPreflightFailure(design.id, {
        version: await freshVersion(),
        issues: report.issues,
      });
      setState({ step: "error", fraction: 0, issues: report.issues });
      return null;
    }
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
    if (busy.current) return;
    busy.current = true;
    try {
      work.current ??= await prepare();
      const w = work.current;
      if (!w) return; // the preflight failed: `prepare` set the issues
      setState({ step: "upload", fraction: 0, issues: null });
      await assertStoredIs(w.checksum);
      const submitted = await submitDesign(design.id, {
        version: await freshVersion(),
        preflight: w.report,
        files: w.bundle,
      });
      client.setQueryData(designKeys.detail(design.id), submitted);
      autosave.setVersion(submitted.version); // the next save sends the version the submit left
      await invalidateDesign(client, design.id);
      work.current = null;
      setState({ step: "done", fraction: 1, issues: null });
    } catch (error) {
      const issues = preflightIssuesOf(error);
      if (error instanceof DocumentChangedError) {
        // The editor is behind a document saved elsewhere: autosave stops and the conflict
        // dialog offers the reload. The next run draws anew.
        work.current = null;
        autosave.conflict();
      } else if (issues || isDesignConflict(error) || isDesignStateChanged(error)) {
        // The server judged otherwise (or the design moved on): what was drawn is stale.
        work.current = null;
        void invalidateDesign(client, design.id);
      }
      setState({ step: "error", fraction: 0, error, issues });
    } finally {
      busy.current = false;
    }
  }

  return {
    ...state,
    run: () => {
      work.current = null;
      return execute();
    },
    retry: execute,
  };
}
