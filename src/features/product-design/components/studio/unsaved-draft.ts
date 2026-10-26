import { z } from "zod";

import { signedInStorageKey } from "@/lib/auth/signed-in-storage";

import { canonicalJson, designDocumentSchema } from "../../engine";
import type { DesignDocumentRecord } from "../../types";

/**
 * Edits not stored yet, kept per viewer in `localStorage` (an unsent draft, as the state rules
 * allow) while autosave is pending, saving, offline or failed: leaving the studio inside the app
 * fires no `beforeunload`, and a save that cannot go through would otherwise drop them.
 * `baseVersion` and `baseChecksum` name the stored document the edits were made on; the draft is
 * offered back only over that same stored document. `savedAt` (epoch ms) ages it out (N3).
 */
const unsavedDraftSchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  baseChecksum: z.string(),
  document: designDocumentSchema,
  savedAt: z.number().int().nonnegative(),
});
export type UnsavedDraft = z.infer<typeof unsavedDraftSchema>;
/** What the studio keeps; `writeUnsavedDraft` stamps `savedAt`. */
export type UnsavedDraftInput = Omit<UnsavedDraft, "savedAt">;

/** Quiet time after the latest edit before the draft is written (a drag edits every frame). */
export const DRAFT_WRITE_DELAY_MS = 400;

/** A draft older than this is dropped rather than offered: a week of not coming back (N3). */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One draft per design: a newer one replaces it, so old ones never pile up in storage. Under the
 * signed-in prefix, so signing out removes it (N3): the next person on a shared device must not
 * read a customer's unsent text.
 */
export const unsavedDraftKey = (designId: string) => signedInStorageKey(`design-draft:${designId}`);

/** `localStorage`, or `null` where there is none or it is blocked (server, private mode). */
function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The kept draft of `designId`, or `null`; an unreadable or expired one is forgotten. */
export function readUnsavedDraft(designId: string, now: number = Date.now()): UnsavedDraft | null {
  try {
    const raw = storage()?.getItem(unsavedDraftKey(designId));
    if (!raw) return null;
    const parsed = unsavedDraftSchema.safeParse(JSON.parse(raw));
    if (parsed.success && now - parsed.data.savedAt <= DRAFT_TTL_MS) return parsed.data;
    forgetUnsavedDraft(designId);
    return null;
  } catch {
    return null;
  }
}

export function writeUnsavedDraft(designId: string, draft: UnsavedDraftInput): void {
  try {
    const kept: UnsavedDraft = { ...draft, savedAt: Date.now() };
    storage()?.setItem(unsavedDraftKey(designId), JSON.stringify(kept));
  } catch {
    // Storage full or blocked: the page-leave prompt and the back-link guard still ask.
  }
}

export function forgetUnsavedDraft(designId: string): void {
  try {
    storage()?.removeItem(unsavedDraftKey(designId));
  } catch {
    // Nothing that can be forgotten.
  }
}

/**
 * The draft to offer over the loaded `record`, or `null`. It is offered when it was made on this
 * stored document (the same base version, or the same checksum after a non-document write moved
 * the version on) and differs from it; a draft made on another stored document is stale and is
 * forgotten.
 */
export function restorableDraft(
  designId: string,
  record: Pick<DesignDocumentRecord, "version" | "checksum" | "document">,
): UnsavedDraft | null {
  const draft = readUnsavedDraft(designId);
  if (!draft) return null;
  const sameBase = draft.baseVersion === record.version || draft.baseChecksum === record.checksum;
  if (sameBase && canonicalJson(draft.document) !== canonicalJson(record.document)) return draft;
  forgetUnsavedDraft(designId);
  return null;
}

export type DraftKeeper = {
  /** An edit: write the draft once the edits pause. */
  schedule(): void;
  /** Write it now (the studio is left, the tab hidden). */
  keepNow(): void;
  /** Everything is stored: drop the draft and any write still waiting. */
  forget(): void;
  dispose(): void;
};

/** Keeps the draft `current()` describes for `designId` in storage until autosave stores it. */
export function createDraftKeeper(designId: string, current: () => UnsavedDraftInput): DraftKeeper {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return {
    schedule() {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        writeUnsavedDraft(designId, current());
      }, DRAFT_WRITE_DELAY_MS);
    },
    keepNow() {
      cancel();
      writeUnsavedDraft(designId, current());
    },
    forget() {
      cancel();
      forgetUnsavedDraft(designId);
    },
    dispose: cancel,
  };
}
