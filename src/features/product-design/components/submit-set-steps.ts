import type { QueryClient } from "@tanstack/react-query";

import type { FontRegistry, PreflightReport } from "../engine";
import { designPrintConfigQuery } from "../queries";
import type { DesignUploadInput } from "../round-mutations";
import type { Design, DesignFileRole } from "../types";
import { newRunNonce } from "../upload-key";
import type { ExportRenderer } from "./studio/export-renderer";
import { loadDesignSession, type DesignSession } from "./studio/load-design-session";
import { buildSessionBundle, checkSession, type BundleProgress } from "./studio/run-submission";
import type { SubmissionBundle } from "./studio/submission-bundle";
import { DocumentChangedError, recordFailure, storedVersionOf } from "./studio/submission-checks";

// The work on one design of a set (spec 2026-11-12 §8), on the design loaded by itself
// (`loadDesignSession`): check it, draw its files, upload them as a single submission does (each
// file bound to the saved layout's checksum), then read the version the uploads left. Each load is
// released before the next design is loaded, so the images and canvases of one design at most are
// held at a time.

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
  /**
   * Part of each file's idempotency key, made with the drawing: the retries of these files send the
   * same keys, while files drawn again (a repair, another run) have another nonce, so equal bytes
   * are not a replay the BE never makes current.
   */
  runNonce: string;
};

/** A design of the round as the BE wants it named: its id and the version its files left it at. */
export type RoundDesign = { id: string; version: number };

export type UploadFiles = (input: DesignUploadInput) => Promise<void>;

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
    return { drawn: { bundle, checksum, report, runNonce: newRunNonce() } };
  });
}

/**
 * Step 3, second half: uploads the drawn files while the stored document is still the one they
 * were drawn from (else `DocumentChangedError`: draw them again), then reads the design's version,
 * which every upload moved on: the round names that one. The upload keys cover each file, so a
 * retry of the same files stores nothing twice.
 */
export async function uploadDrawn(
  deps: StepDeps,
  design: Design,
  drawn: DrawnFiles,
  upload: UploadFiles,
  readVersion: (designId: string) => Promise<number>,
): Promise<RoundDesign> {
  await storedVersionOf({ client: deps.client, design }, drawn.checksum);
  deps.signal.throwIfAborted();
  await upload({
    designId: design.id,
    files: drawn.bundle,
    documentChecksum: drawn.checksum,
    runNonce: drawn.runNonce,
  });
  deps.signal.throwIfAborted();
  return { id: design.id, version: await readVersion(design.id) };
}

/**
 * The BE said these files of a design are outdated (a file missing, drawn from another layout, or
 * a template edited since): the design's template is read again, so a template changed on the
 * server is drawn with its new values, then the design is checked and drawn anew and the named
 * files are uploaded. A design that now fails its check answers its report instead.
 */
export async function repairFiles(
  deps: StepDeps,
  design: Design,
  roles: readonly DesignFileRole[],
  upload: UploadFiles,
  readVersion: (designId: string) => Promise<number>,
  onStep: BundleProgress,
): Promise<{ repaired: RoundDesign } | { failed: PreflightReport }> {
  await deps.client.fetchQuery({ ...designPrintConfigQuery(design), staleTime: 0 });
  deps.signal.throwIfAborted();
  const outcome = await drawDesign(deps, design.id, onStep);
  if ("failed" in outcome) return outcome;
  const { drawn } = outcome;
  await storedVersionOf({ client: deps.client, design }, drawn.checksum);
  deps.signal.throwIfAborted();
  await upload({
    designId: design.id,
    files: drawn.bundle,
    documentChecksum: drawn.checksum,
    runNonce: drawn.runNonce,
    roles,
  });
  deps.signal.throwIfAborted();
  return { repaired: { id: design.id, version: await readVersion(design.id) } };
}
