"use client";

import { Redo2, Undo2 } from "lucide-react";
import type { ReactNode } from "react";

import { DESIGN_UI_STATE_META } from "../../lifecycle";
import { DesignStatusBadge } from "../design-status-badge";
import { DesignNameField } from "./design-name-field";
import { SaveState } from "./save-state";
import { StudioBackLink } from "./studio-back-link";
import { useEditorState, useStudio } from "./studio-context";
import { StudioIconButton } from "./studio-icon-button";
import { isUnsaved, type AutosaveStatus } from "./use-autosave";

/**
 * The studio's compact header: back to the design list (asking first while an edit is unsaved),
 * the name (renamed in place), the save state, undo/redo, the lifecycle badge and `action`, the
 * slot for the primary lifecycle action.
 */
export function StudioHeader({
  autosave,
  action,
}: {
  autosave: Pick<AutosaveStatus, "state" | "savedAt" | "error" | "retry">;
  action?: ReactNode;
}) {
  const { editor, design, uiState } = useStudio();
  const canUndo = useEditorState((s) => s.canUndo);
  const canRedo = useEditorState((s) => s.canRedo);

  return (
    <header className="bg-bg-surface border-border-default flex h-14 shrink-0 items-center gap-1 border-b px-2 sm:gap-2 sm:px-3">
      <StudioBackLink unsaved={isUnsaved(autosave.state)} />
      <span aria-hidden className="bg-border-default hidden h-6 w-px shrink-0 sm:block" />
      <DesignNameField name={design.name} editable={DESIGN_UI_STATE_META[uiState].editable} />
      <SaveState
        state={autosave.state}
        savedAt={autosave.savedAt}
        error={autosave.error}
        onRetry={autosave.retry}
      />
      <div className="ml-auto flex shrink-0 items-center gap-1">
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
        <DesignStatusBadge state={uiState} className="ml-1 hidden sm:inline-flex" />
        {action}
      </div>
    </header>
  );
}
