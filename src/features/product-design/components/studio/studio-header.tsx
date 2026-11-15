"use client";

import { Redo2, Save, Undo2 } from "lucide-react";
import { useEffect, useEffectEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { allowedActions, isReturned } from "../../lifecycle";
import { DesignStatusBadge } from "../design-status-badge";
import { CheckChip } from "./check-chip";
import { DesignNameField } from "./design-name-field";
import { SaveState } from "./save-state";
import { StudioBackLink } from "./studio-back-link";
import { StudioProjectCrumb } from "./studio-project-crumb";
import { useEditorState, useStudio } from "./studio-context";
import { StudioIconButton } from "./studio-icon-button";
import { isUnsaved, type AutosaveStatus } from "./use-autosave";

/** Ctrl+S (⌘S): the browser's "save page" is kept out of the way, and `save` runs while it may. */
function useSaveShortcut(save: () => void, enabled: boolean) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const isSave =
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === "s";
    if (!isSave) return;
    event.preventDefault();
    if (enabled && !event.repeat) save();
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/**
 * The studio's compact header: back to the design list, or to the project page for a design in a
 * project (asking first while an edit is unsaved), the project's name as a link to that page
 * before the design's name ("Dự án X › name"), the name (renamed in place while the design may be
 * renamed), the save state, "Lưu" (Ctrl+S) while it may be saved, undo/redo, the status badge
 * (with "Bị trả lại" for a returned draft) and `action`, the slot for the primary lifecycle
 * action.
 */
export function StudioHeader({
  autosave,
  action,
}: {
  autosave: Pick<AutosaveStatus, "state" | "savedAt" | "error" | "retry" | "flush">;
  action?: ReactNode;
}) {
  const { editor, design, status } = useStudio();
  const canUndo = useEditorState((s) => s.canUndo);
  const canRedo = useEditorState((s) => s.canRedo);
  const actions = allowedActions(design);
  const canSave = actions.includes("save");
  const save = () => void autosave.flush();
  useSaveShortcut(save, canSave);

  return (
    <header className="bg-bg-surface border-border-default flex h-14 shrink-0 items-center gap-1 border-b px-2 sm:gap-2 sm:px-3">
      <StudioBackLink unsaved={canSave && isUnsaved(autosave.state)} />
      <span aria-hidden className="bg-border-default hidden h-6 w-px shrink-0 sm:block" />
      <StudioProjectCrumb unsaved={canSave && isUnsaved(autosave.state)} />
      <DesignNameField editable={actions.includes("rename")} />
      {canSave ? (
        <SaveState
          state={autosave.state}
          savedAt={autosave.savedAt}
          error={autosave.error}
          onRetry={autosave.retry}
        />
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {canSave ? (
          <Button
            type="button"
            variant="ghost"
            aria-keyshortcuts="Control+S"
            title="Lưu (Ctrl+S)"
            disabled={autosave.state === "conflict"}
            onClick={save}
            className="min-h-11 rounded-[var(--r-md)] px-3"
          >
            <Save aria-hidden className="size-4" />
            <span className="ml-1.5">Lưu</span>
          </Button>
        ) : null}
        <StudioIconButton
          label="Hoàn tác (Ctrl+Z)"
          onClick={() => editor.undo()}
          disabled={!canUndo}
        >
          <Undo2 aria-hidden />
        </StudioIconButton>
        <StudioIconButton
          label="Làm lại (Ctrl+Shift+Z)"
          onClick={() => editor.redo()}
          disabled={!canRedo}
        >
          <Redo2 aria-hidden />
        </StudioIconButton>
        <DesignStatusBadge
          status={status}
          returned={isReturned(design)}
          className="ml-1 hidden sm:inline-flex"
        />
        <CheckChip />
        {action}
      </div>
    </header>
  );
}
