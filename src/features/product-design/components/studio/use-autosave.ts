"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
  createAutosaver,
  type AutosaveChange,
  type Autosaver,
  type AutosaveState,
} from "../../autosave";
import { ApiError } from "@/lib/api/error";

import type { DesignDocument, EditorController } from "../../engine";
import { isDesignConflict } from "../../errors";
import { DESIGN_STATUS_META } from "../../lifecycle";
import { useSaveDesignDocument } from "../../mutations";
import { designDocumentQuery, designQuery } from "../../queries";
import type { Design, DesignDocumentRecord } from "../../types";
import type { AutosaveControls } from "./studio-context";
import { createDraftKeeper, type DraftKeeper } from "./unsaved-draft";

/** The latest edit is not stored yet in these states: leaving the page would lose it. */
const UNSAVED: ReadonlySet<AutosaveState> = new Set(["pending", "saving", "offline", "error"]);

/** Whether an edit waits to be stored (or failed to be) in `state`. */
export const isUnsaved = (state: AutosaveState) => UNSAVED.has(state);

/**
 * Whether the stored document is the editor's in `state`: nothing waits to be saved and no save
 * failed or lost to a newer version. The submission ("Gửi duyệt") checks it after `flush()`.
 */
export const isStored = (state: AutosaveState) => !UNSAVED.has(state) && state !== "conflict";

export type AutosaveStatus = AutosaveChange & AutosaveControls & { retry(): void };

/** Wait before the stored document is read again after a failed read (R69). */
export const ADOPT_RETRY_MS = 2000;

/**
 * Saves the editor's document 1.5 s after the last edit (`createAutosaver` over P3); flushes when
 * the tab is hidden and when the studio unmounts, and asks before leaving the page while an edit
 * is unsaved. The save mutation writes the stored record into the query cache.
 *
 * Versions (R48 as amended by R69): every write to a design bumps its shared version. Saving
 * starts from `stored`, the document record the editor was loaded from (not the design, which may
 * have been read after another device saved). A newer version read with the design is adopted
 * only when the stored document (P3) still has the checksum of the one this tab last loaded or
 * saved: the version moved for a write that left the document alone — a rename, or a review that
 * returned the design (docs 12 BR-11: one version for the design and its document). A save
 * refused with a 409 asks P3 the same question and, for such a write (a rename in another tab, a
 * return answered between two polls), is sent once more with the record's version. A document
 * saved elsewhere puts autosave into `conflict` instead, so it is never overwritten without a word.
 *
 * A read-only design (`readOnly`: it is not a DRAFT) is never saved. When the design leaves DRAFT
 * while it is open (another tab submitted it, a save was refused), what was not stored stays in
 * this browser (the offline draft), nothing more is sent, and the editor shows the stored document.
 * A refusal while the design read since still says DRAFT is asked again on "Thử lại": still a
 * DRAFT, saving goes on.
 */
export function useAutosave(
  design: Design,
  editor: EditorController,
  {
    stored,
    onSaved,
    readOnly,
  }: {
    stored: Pick<DesignDocumentRecord, "version" | "checksum">;
    onSaved?: () => void;
    /** The design cannot be saved (`!DESIGN_STATUS_META[status].editable`). */
    readOnly: boolean;
  },
): AutosaveStatus {
  const client = useQueryClient();
  const designId = design.id;
  const { mutateAsync } = useSaveDesignDocument(designId);
  const [change, setChange] = useState<AutosaveChange>({ state: "idle", version: stored.version });
  const saverRef = useRef<Autosaver | null>(null);
  const keeperRef = useRef<DraftKeeper | null>(null);
  const latest = useRef<AutosaveState>("idle");
  /** The newest version known to leave the stored document as this tab last loaded or saved it. */
  const knownRef = useRef(stored.version);
  /** The checksum of the document this tab last loaded or saved. */
  const storedRef = useRef(stored.checksum);

  /** P3 now; whether it still holds the document this tab last loaded or saved. */
  const readStored = useEffectEvent(async () => {
    const record = await client.fetchQuery({ ...designDocumentQuery(design.id), staleTime: 0 });
    return { record, unchanged: record.checksum === storedRef.current };
  });

  const save = useEffectEvent(async (document: DesignDocument, version: number) => {
    const send = async (at: number) => {
      const record = await mutateAsync({ version: at, document });
      knownRef.current = Math.max(knownRef.current, record.version);
      storedRef.current = record.checksum;
      return { version: record.version, savedAt: record.updatedAt };
    };
    try {
      return await send(version);
    } catch (error) {
      if (!isDesignConflict(error)) throw error;
      // The BE checks the version before the status, so a design submitted or answered elsewhere
      // is a CONFLICT too: read it, and when it is no longer a DRAFT take the status path (the
      // studio follows the status, nothing more is sent) instead of the reload dialog.
      const fresh = await client
        .fetchQuery({ ...designQuery(designId), staleTime: 0 })
        .catch(() => null);
      if (fresh && !DESIGN_STATUS_META[fresh.status].editable) {
        throw new ApiError(409, "DESIGN_NOT_DRAFT", "The design is no longer a draft");
      }
      // R69: refused for a version a non-document write moved on? Then send it once more.
      const read = await readStored().catch(() => null);
      if (!read?.unchanged || read.record.version <= version) throw error;
      knownRef.current = Math.max(knownRef.current, read.record.version);
      return send(read.record.version);
    }
  });
  /**
   * "Thử lại" after a refusal: the design read again; the editor's document when it is a DRAFT
   * still (the refusal raced a status that came back), else `null` and the studio follows it.
   */
  const recheck = useEffectEvent(async () => {
    const fresh = await client.fetchQuery({ ...designQuery(designId), staleTime: 0 });
    return DESIGN_STATUS_META[fresh.status].editable ? editor.store.getState().document : null;
  });
  const isReadOnly = useEffectEvent(() => readOnly);
  const report = useEffectEvent((next: AutosaveChange) => {
    latest.current = next.state;
    setChange(next);
    if (next.state === "saved") onSaved?.();
  });

  useEffect(() => {
    // Until autosave stores them, the edits are also kept in this browser (lost otherwise when the
    // studio is left inside the app while offline or after a failed save).
    const keeper = createDraftKeeper(designId, () => ({
      baseVersion: knownRef.current,
      baseChecksum: storedRef.current,
      document: editor.store.getState().document,
    }));
    const keepIfUnsaved = () => {
      if (UNSAVED.has(latest.current)) keeper.keepNow();
    };
    const saver = createAutosaver({
      save: (document, version) => save(document, version),
      recheck: () => recheck(),
      initialVersion: knownRef.current,
      onChange: (next) => {
        if (next.state === "saved" || next.state === "idle") keeper.forget();
        report(next);
      },
    });
    saverRef.current = saver;
    keeperRef.current = keeper;
    const offEdit = editor.onDocumentChange((document) => {
      if (isReadOnly()) return; // the stored document shown again, or nothing that can be saved
      saver.schedule(document);
      keeper.schedule();
    });
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      keepIfUnsaved();
      void saver.flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      offEdit();
      document.removeEventListener("visibilitychange", onVisibility);
      saverRef.current = null;
      keeperRef.current = null;
      // Leaving the studio: keep the draft, send what is pending (which forgets it), then stop.
      keepIfUnsaved();
      void saver.flush().finally(() => {
        saver.dispose();
        keeper.dispose();
      });
    };
  }, [editor, designId]);

  /** Shows the stored document: what the design is now, once it cannot be edited any more. */
  const showStored = useEffectEvent(async () => {
    let record: DesignDocumentRecord;
    try {
      ({ record } = await readStored());
    } catch {
      return; // nothing is saved anyway; the edit stays on screen until the next visit
    }
    if (!isReadOnly()) return; // editable again meanwhile: the editor keeps what it holds
    editor.replaceDocument(record.document);
    knownRef.current = Math.max(knownRef.current, record.version);
    storedRef.current = record.checksum;
    saverRef.current?.setVersion(record.version);
  });
  const followReadOnly = useEffectEvent((locked: boolean) => {
    const saver = saverRef.current;
    if (!saver) return;
    saver.lock(locked);
    if (!locked || latest.current === "idle" || latest.current === "saved") return;
    // What was not stored stays in this browser (the offline draft) and is shown no more.
    if (UNSAVED.has(latest.current)) keeperRef.current?.keepNow();
    latest.current = "idle";
    setChange((now) => ({
      state: "idle",
      version: now.version,
      ...(now.savedAt ? { savedAt: now.savedAt } : {}),
    }));
    void showStored();
  });
  useEffect(() => followReadOnly(readOnly), [readOnly, editor, designId]);

  // R69: whose write moved the version on? Only a non-document one is adopted, and only the
  // version P3 answered with (a newer one may hold a document write P3 did not see).
  const [retryAt, setRetryAt] = useState(0);
  const adopt = useEffectEvent(async (version: number) => {
    if (version <= knownRef.current) return;
    let read: Awaited<ReturnType<typeof readStored>>;
    try {
      read = await readStored();
    } catch {
      // Cannot tell yet: ask again shortly (or at the next version), the old version stays.
      return "retry" as const;
    }
    const saver = saverRef.current;
    if (!saver || version <= knownRef.current) return; // a save of ours landed meanwhile
    if (latest.current === "saving") return; // asked again once that save is answered
    if (read.unchanged) {
      knownRef.current = Math.max(knownRef.current, read.record.version);
      saver.setVersion(read.record.version);
    } else {
      saver.conflict();
    }
  });
  // Not while a save of ours is open: its answer changes the checksum this tab holds.
  const saving = change.state === "saving";
  useEffect(() => {
    if (saving) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let live = true;
    void adopt(design.version).then((outcome) => {
      if (live && outcome === "retry") {
        retry = setTimeout(() => setRetryAt(Date.now()), ADOPT_RETRY_MS);
      }
    });
    return () => {
      live = false;
      clearTimeout(retry);
    };
  }, [design.version, saving, retryAt]);

  const unsaved = UNSAVED.has(change.state);
  useEffect(() => {
    if (!unsaved) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true; // older Safari (and Chromium before 119) ask only when this is set
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [unsaved]);

  const [controls] = useState(() => ({
    flush: () => saverRef.current?.flush() ?? Promise.resolve(),
    setVersion: (version: number) => {
      knownRef.current = Math.max(knownRef.current, version);
      saverRef.current?.setVersion(version);
    },
    resume: (version: number, checksum: string) => {
      knownRef.current = version;
      storedRef.current = checksum;
      saverRef.current?.resume(version);
    },
    conflict: () => saverRef.current?.conflict(),
    latestState: () => latest.current,
    storedChecksum: () => storedRef.current,
    retry: () => saverRef.current?.retry(),
  }));
  return { ...change, ...controls };
}
