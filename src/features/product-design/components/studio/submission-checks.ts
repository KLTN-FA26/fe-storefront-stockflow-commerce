import type { QueryClient } from "@tanstack/react-query";

import { recordPreflightFailure } from "../../api";
import type { DesignDocument, PreflightIssue } from "../../engine";
import { isDesignGone, isDesignStateChanged } from "../../errors";
import { invalidateDesign } from "../../mutations";
import { designDocumentQuery, designKeys } from "../../queries";
import type { Design } from "../../types";
import { ExportError } from "./export-renderer";
import type { StudioServices } from "./studio-context";
import { isStored } from "./use-autosave";

// The checks a submission makes against the stored document before anything is drawn or sent:
// the studio's "Gửi duyệt" (`useDesignSubmission`) and a design loaded without the studio
// (`run-submission.ts`).

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

/** The design whose stored document is read, and the cache it is read through. */
export type StoredDesign = Pick<SubmissionContext, "client" | "design">;

/** The document the files are drawn from, and its checksum. */
export type Drawn = { document: DesignDocument; checksum: string };

/** The stored document, read fresh: it carries the design's version counter and the checksum. */
export const readStored = ({ client, design }: StoredDesign) =>
  client.fetchQuery({ ...designDocumentQuery(design.id), staleTime: 0 });

/**
 * Saves what is pending, then answers the editor's document, which is then the stored one;
 * refuses to go on when autosave could not store it.
 */
export async function storedDocument({ services }: SubmissionContext): Promise<DesignDocument> {
  const { editor, autosave } = services;
  await autosave.flush();
  if (!isStored(autosave.latestState())) throw new ExportError(MESSAGES.notSaved);
  return editor.store.getState().document;
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
 * For a design no editor of this tab holds: reads the stored document fresh and answers its
 * version while it is still the one of `checksum`; any other was saved elsewhere
 * (`DocumentChangedError`).
 */
export async function storedVersionOf(ref: StoredDesign, checksum: string): Promise<number> {
  const stored = await readStored(ref);
  if (stored.checksum !== checksum) throw new DocumentChangedError(MESSAGES.changed);
  return stored.version;
}

/**
 * Records a submit the browser's preflight failed (docs 12 §5.3 PREFLIGHT_FAILED) and re-reads the
 * history that lists it. Answers the failure when the record could not be made (a design that
 * moved on or is gone is re-read), `undefined` once it is recorded.
 */
export async function recordFailure(ref: StoredDesign, issues: PreflightIssue[]): Promise<unknown> {
  const { client, design } = ref;
  try {
    const { version } = await readStored(ref);
    await recordPreflightFailure(design.id, { version, issues });
    void client.invalidateQueries({ queryKey: designKeys.history(design.id) });
    return undefined;
  } catch (error) {
    if (isDesignStateChanged(error) || isDesignGone(error))
      void invalidateDesign(client, design.id);
    return error;
  }
}
