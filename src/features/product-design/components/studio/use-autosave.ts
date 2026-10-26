"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
  createAutosaver,
  type AutosaveChange,
  type Autosaver,
  type AutosaveState,
} from "../../autosave";
import type { DesignDocument, EditorController } from "../../engine";
import { isDesignConflict } from "../../errors";
import { useSaveDesignDocument } from "../../mutations";
import { designDocumentQuery } from "../../queries";
import type { DesignDocumentRecord, DesignDraft } from "../../types";
import type { AutosaveControls } from "./studio-context";
import { createDraftKeeper, type DraftKeeper } from "./unsaved-draft";

/** The latest edit is not stored yet in these states: leaving the page would lose it. */
const UNSAVED: ReadonlySet<AutosaveState> = new Set(["pending", "saving", "offline", "error"]);

/** Whether an edit waits to be stored (or failed to be) in `state`. */
export const isUnsaved = (state: AutosaveState) => UNSAVED.has(state);

/**
 * Whether the stored document is the editor's in `state`: nothing waits to be saved and no save
 * failed or lost to a newer version. A workflow step checks it after `flush()`.
 */
export const isStored = (state: AutosaveState) => !UNSAVED.has(state) && state !== "conflict";

export type AutosaveStatus = AutosaveChange &
  AutosaveControls & {
    retry(): void;
    /** Saves the edits `holds` kept back (the customer accepted what saving them does). */
    releaseHeld(): void;
    /** Forgets that edits were held back (they were undone). */
    discardHeld(): void;
  };

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
 * saved: the version moved for an artifact, the specification or a workflow step. A save refused
 * with a 409 asks P3 the same question and, for a non-document write (QC answered between two
 * polls), is sent once more with the record's version. A document saved elsewhere puts autosave
 * into `conflict` instead, so it is never overwritten without a word.
 */
export function useAutosave(
  design: DesignDraft,
  editor: EditorController,
  {
    stored,
    onSaved,
    holds,
  }: {
    stored: Pick<DesignDocumentRecord, "version" | "checksum">;
    onSaved?: () => void;
    /** While true, an edit is held back instead of saved (`releaseHeld` saves it). */
    holds?: () => boolean;
  },
): AutosaveStatus {
  const client = useQueryClient();
  const designId = design.id;
  const { mutateAsync } = useSaveDesignDocument(designId);
  const [change, setChange] = useState<AutosaveChange>({ state: "idle", version: stored.version });
  const saverRef = useRef<Autosaver | null>(null);
  const keeperRef = useRef<DraftKeeper | null>(null);
  /** An edit was held back by `holds` and not saved yet. */
  const heldRef = useRef(false);
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
      // R69: refused for a version a non-document write moved on? Then send it once more.
      const read = await readStored().catch(() => null);
      if (!read?.unchanged || read.record.version <= version) throw error;
      knownRef.current = Math.max(knownRef.current, read.record.version);
      return send(read.record.version);
    }
  });
  const isHolding = useEffectEvent(() => holds?.() ?? false);
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
      initialVersion: knownRef.current,
      onChange: (next) => {
        if (next.state === "saved" || next.state === "idle") keeper.forget();
        report(next);
      },
    });
    saverRef.current = saver;
    keeperRef.current = keeper;
    const offEdit = editor.onDocumentChange((document) => {
      if (isHolding()) {
        heldRef.current = true;
        return;
      }
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
    retry: () => saverRef.current?.retry(),
    releaseHeld: () => {
      if (!heldRef.current) return;
      heldRef.current = false;
      saverRef.current?.schedule(editor.store.getState().document);
      keeperRef.current?.schedule();
    },
    discardHeld: () => {
      heldRef.current = false;
    },
  }));
  return { ...change, ...controls };
}
