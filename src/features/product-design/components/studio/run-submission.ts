import { documentChecksum, runPreflight } from "../../engine";
import type { DesignDocument, PreflightReport } from "../../engine";
import type { DesignSession } from "./load-design-session";
import type { StudioServices } from "./studio-context";
import {
  buildSubmissionBundle,
  type BundleRole,
  type BundleStep,
  type SubmissionBundle,
} from "./submission-bundle";
import { storedVersionOf } from "./submission-checks";
import { preflightVariant } from "./use-preflight";

// The steps of "Gửi duyệt" before anything is sent, shared by its two users (spec §8): the
// studio's button, on the design it has open (`useDesignSubmission`), and a submission of a set,
// on designs it loads itself (`loadDesignSession`). Check: the preflight on the stored document.
// Draw: the three files of the bundle.

/** What the check and the drawing read of one design: the studio's services, or a session. */
export type SubmissionSubject = Pick<
  StudioServices,
  | "design"
  | "template"
  | "surfaces"
  | "sizer"
  | "fonts"
  | "printConfig"
  | "assetStatus"
  | "fontStatus"
  | "exportRenderer"
> &
  // The studio has the BE's font list; a set submission's session does not, and the BE checks fonts again.
  Partial<Pick<StudioServices, "servedFontCodes">>;

/** What a preflight was run on, its report, and the checksum the files are verified against. */
export type Checked = { document: DesignDocument; report: PreflightReport; checksum: string };

/** Where the drawing is: the step and the fraction (0–1) done within it. */
export type BundleProgress = (step: BundleStep, fraction: number) => void;

/**
 * The preflight of `document`, which the caller knows to be the stored one: the template, the
 * surfaces, the load state of its images and fonts, and the variant as its print configuration
 * says (ruling R6).
 */
export async function checkDocument(
  subject: SubmissionSubject,
  document: DesignDocument,
): Promise<Checked> {
  const report = runPreflight({
    document,
    template: subject.template,
    surfaces: subject.surfaces,
    sizer: subject.sizer,
    assets: subject.assetStatus,
    fontStatus: subject.fontStatus,
    servedFontCodes: subject.servedFontCodes ?? null,
    variant: preflightVariant(subject.printConfig),
  });
  return { document, report, checksum: await documentChecksum(document) };
}

/** The three files of the checked document (`buildSubmissionBundle`), by the subject's renderer. */
export function drawBundle(
  subject: SubmissionSubject,
  checked: Checked,
  onStep?: BundleProgress,
  signal?: AbortSignal,
  roles?: readonly BundleRole[],
): Promise<SubmissionBundle> {
  return buildSubmissionBundle({
    name: subject.design.name,
    version: subject.design.version,
    document: checked.document,
    template: subject.template,
    surfaces: subject.surfaces,
    sizer: subject.sizer,
    fonts: subject.fonts,
    report: checked.report,
    checksum: checked.checksum,
    renderer: subject.exportRenderer,
    ...(onStep ? { onStep } : {}),
    ...(signal ? { signal } : {}),
    ...(roles ? { uploading: roles } : {}),
  });
}

/** A released session has let go of its images: its preview would show placeholders. */
function assertOpen(session: DesignSession) {
  if (session.released) throw new Error("This design session was released: load the design again");
}

/**
 * The preflight of a session's design on exactly what is stored: the stored document, read fresh,
 * must still be the one the session loaded. One stored since is a `DocumentChangedError`: a
 * session loaded anew checks it. A released session does not check.
 */
export async function checkSession(session: DesignSession): Promise<Checked> {
  assertOpen(session);
  await storedVersionOf(session, session.record.checksum);
  assertOpen(session);
  return checkDocument(session, session.editor.store.getState().document);
}

/**
 * The files of a session's design, from its own check (`checkSession`): the preview is painted
 * from the session's editor. Nothing is drawn once the stored document is no longer the checked
 * one (`DocumentChangedError`), nor by a released session.
 */
export async function buildSessionBundle(
  session: DesignSession,
  checked: Checked,
  onStep?: BundleProgress,
  signal?: AbortSignal,
  roles?: readonly BundleRole[],
): Promise<SubmissionBundle> {
  assertOpen(session);
  if (session.editor.store.getState().document !== checked.document) {
    throw new Error("A session draws only what its own check ran on");
  }
  await storedVersionOf(session, checked.checksum);
  assertOpen(session);
  return drawBundle(session, checked, onStep, signal, roles);
}
