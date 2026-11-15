import type { QueryClient } from "@tanstack/react-query";

import type { FontRegistry, PreflightReport } from "../engine";
import type { SubmissionUploadInput } from "../round-mutations";
import type { Design, ReviewRoundItem, SubmissionUpload } from "../types";
import type { ExportRenderer } from "./studio/export-renderer";
import { loadDesignSession, type DesignSession } from "./studio/load-design-session";
import { buildSessionBundle, checkSession, type BundleProgress } from "./studio/run-submission";
import type { SubmissionBundle } from "./studio/submission-bundle";
import { DocumentChangedError, recordFailure, storedVersionOf } from "./studio/submission-checks";

// The work on one design of a set (spec 2026-11-12 §8), on the design loaded by itself
// (`loadDesignSession`): check it, draw its files, upload them. Each load is released before the
// next design is loaded, so the images and canvases of one design at most are held at a time.

/** How many times a design saved elsewhere while it is checked or drawn is loaded again. */
const LOADS = 3;

export type StepDeps = {
  client: QueryClient;
  /** The studio's fonts (`STUDIO_FONTS`): the check and the files need the real faces. */
  fonts: FontRegistry;
  /** "Hủy": a load stops at once, the other steps at their next turn. */
  signal: AbortSignal;
  /** Test seam: a renderer of the review files for each design loaded (jsdom has no canvas). */
  newRenderer?: (() => ExportRenderer) | undefined;
};

/** A design's files, drawn from what passed its check, waiting to be uploaded. */
export type DrawnFiles = {
  bundle: SubmissionBundle;
  /** The stored document's checksum the files were drawn from. */
  checksum: string;
  report: PreflightReport;
  /** The upload's `Idempotency-Key`: one per drawing, so every retry of it is stored once. */
  key: string;
};

/**
 * Loads the design, runs `work` on it and lets it go. A design saved elsewhere meanwhile
 * (`DocumentChangedError`) is loaded again, so what is checked and drawn is what is stored now.
 */
async function withSession<T>(
  deps: StepDeps,
  designId: string,
  work: (session: DesignSession) => Promise<T>,
): Promise<T> {
  for (let load = 1; ; load += 1) {
    const session = await loadDesignSession(deps.client, designId, deps.fonts, {
      signal: deps.signal,
      ...(deps.newRenderer ? { exportRenderer: deps.newRenderer() } : {}),
    });
    try {
      return await work(session);
    } catch (error) {
      if (!(error instanceof DocumentChangedError) || load >= LOADS) throw error;
    } finally {
      session.release();
    }
  }
}

/** A Fail is written to the design's history (docs 12 §5.3); the customer sees it either way. */
async function recorded(session: DesignSession, report: PreflightReport) {
  if (report.result === "Fail") await recordFailure(session, report.issues);
  return report;
}

/** Step 1: the preflight of the stored design (BR-05). */
export function checkDesign(deps: StepDeps, designId: string): Promise<PreflightReport> {
  return withSession(deps, designId, async (session) => {
    const { report } = await checkSession(session);
    deps.signal.throwIfAborted();
    return recorded(session, report);
  });
}

/**
 * Step 3, first half: checks the stored design again (it may have changed since step 1) and draws
 * its three files; a design that fails now answers its report instead.
 */
export function drawDesign(
  deps: StepDeps,
  designId: string,
  onStep: BundleProgress,
): Promise<{ drawn: DrawnFiles } | { failed: PreflightReport }> {
  return withSession(deps, designId, async (session) => {
    const checked = await checkSession(session);
    deps.signal.throwIfAborted();
    if (checked.report.result === "Fail")
      return { failed: await recorded(session, checked.report) };
    const bundle = await buildSessionBundle(session, checked, onStep, deps.signal);
    deps.signal.throwIfAborted();
    const { checksum, report } = checked;
    return { drawn: { bundle, checksum, report, key: crypto.randomUUID() } };
  });
}

/**
 * Step 3, second half: uploads the drawn files while the stored document is still the one they
 * were drawn from (else `DocumentChangedError`: draw them again), and answers the design's item of
 * the round, with the version of that very read.
 */
export async function uploadDrawn(
  deps: StepDeps,
  design: Design,
  drawn: DrawnFiles,
  upload: (input: SubmissionUploadInput) => Promise<SubmissionUpload>,
): Promise<ReviewRoundItem> {
  const version = await storedVersionOf({ client: deps.client, design }, drawn.checksum);
  deps.signal.throwIfAborted();
  const { uploadToken, checksums } = await upload({
    designId: design.id,
    files: drawn.bundle,
    idempotencyKey: drawn.key,
  });
  deps.signal.throwIfAborted();
  return {
    designId: design.id,
    version,
    uploadToken,
    preflight: { result: "Pass", issues: drawn.report.issues },
    checksums,
  };
}
