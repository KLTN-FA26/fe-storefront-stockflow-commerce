import type { QueryClient } from "@tanstack/react-query";

import { recordPreflightFailure } from "../../api";
import { runPreflight } from "../../engine";
import type { DesignDocument, PreflightIssue, PreflightReport } from "../../engine";
import { isDesignGone, isDesignStateChanged } from "../../errors";
import { invalidateDesign } from "../../mutations";
import { designDocumentQuery, designKeys } from "../../queries";
import type { Design } from "../../types";
import { ExportError } from "./export-renderer";
import type { StudioServices } from "./studio-context";
import { isStored } from "./use-autosave";
import { preflightVariant } from "./use-preflight";

// The checks a submission ("Gửi duyệt", `useDesignSubmission`) makes against the stored document
// before anything is drawn or sent.

const MESSAGES = {
  notSaved: "Thiết kế chưa lưu được nên chưa thể gửi duyệt. Hãy lưu lại rồi thử lại.",
  changed: "Thiết kế vừa thay đổi ở nơi khác. Hãy kiểm tra lại rồi gửi lại.",
  edited: "Thiết kế vừa được sửa trong lúc gửi nên chưa gửi đi. Hãy gửi lại để gửi bản mới nhất.",
} as const;

/**
 * The stored document is no longer the one the files were made from, and this tab did not store
 * it (another tab or device saved): nothing more is sent, autosave goes into conflict and the next
 * run exports anew.
 */
export class DocumentChangedError extends ExportError {}

/**
 * This tab's own editor changed the design while it was being sent (an edit still pending, or one
 * its autosave stored meanwhile): nothing is sent, and sending again draws the latest document.
 * Not a conflict.
 */
export class DocumentEditedError extends ExportError {}

/** What a submission works with. */
export type SubmissionContext = { services: StudioServices; client: QueryClient; design: Design };

/** What a preflight was run on, and its report. */
export type Checked = { document: DesignDocument; report: PreflightReport };

/** The document the files are drawn from, and its checksum. */
export type Drawn = { document: DesignDocument; checksum: string };

/** The stored document, read fresh: it carries the design's version counter and the checksum. */
export const readStored = ({ client, design }: SubmissionContext) =>
  client.fetchQuery({ ...designDocumentQuery(design.id), staleTime: 0 });

/**
 * Saves what is pending, then runs the preflight on the editor's document, which is then the stored
 * one; refuses to go on when autosave could not store it.
 */
export async function preflightStored({ services }: SubmissionContext): Promise<Checked> {
  const { editor, template, surfaces, autosave } = services;
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
  return { document, report };
}

/**
 * Refuses to go on unless the editor still holds `drawn` and the stored document is still it (the
 * same checksum); answers the version of that very read, so the version sent is the one of the
 * document verified. A change of this tab's own — still in its editor, or stored by its autosave
 * (the checksum this tab last saved) — asks to send again. A stored checksum that is neither the
 * drawn one nor this tab's was saved elsewhere: a conflict, even when this tab edited too. Only
 * while this tab's own save of an edit is under way can it not tell (that save may have stored
 * it, its checksum not known yet): it asks to send again, and the next run finds out.
 */
export async function assertStoredIs(ctx: SubmissionContext, drawn: Drawn): Promise<number> {
  const stored = await readStored(ctx);
  const { editor, autosave } = ctx.services;
  const edited = editor.store.getState().document !== drawn.document;
  if (stored.checksum === drawn.checksum) {
    if (edited) throw new DocumentEditedError(MESSAGES.edited);
    return stored.version;
  }
  const ownSave =
    stored.checksum === autosave.storedChecksum() ||
    (edited && autosave.latestState() === "saving");
  if (ownSave) throw new DocumentEditedError(MESSAGES.edited);
  throw new DocumentChangedError(MESSAGES.changed);
}

/**
 * Records a submit the browser's preflight failed (docs 12 §5.3 PREFLIGHT_FAILED) and re-reads the
 * history that lists it. Answers the failure when the record could not be made (a design that
 * moved on or is gone is re-read), `undefined` once it is recorded.
 */
export async function recordFailure(
  ctx: SubmissionContext,
  issues: PreflightIssue[],
): Promise<unknown> {
  const { client, design } = ctx;
  try {
    const { version } = await readStored(ctx);
    await recordPreflightFailure(design.id, { version, issues });
    void client.invalidateQueries({ queryKey: designKeys.history(design.id) });
    return undefined;
  } catch (error) {
    if (isDesignStateChanged(error) || isDesignGone(error))
      void invalidateDesign(client, design.id);
    return error;
  }
}
