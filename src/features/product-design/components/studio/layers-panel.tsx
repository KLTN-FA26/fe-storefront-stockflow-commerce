"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen } from "lucide-react";
import { useId, type KeyboardEvent } from "react";

import { cn } from "@/lib/cn";

import { updateElement, type DesignElement } from "../../engine";
import { restackElement } from "./element-actions";
import { layerLabels, surfaceElements } from "./layer-labels";
import { useEditorState, useStudio } from "./studio-context";
import { StudioIconButton } from "./studio-icon-button";
import { useShortcutRunner } from "./use-studio-shortcuts";

type Row = { element: DesignElement; label: string; index: number };

/**
 * The Layers panel, the accessible view of the stage (spec §6.4): a listbox of the active
 * surface's elements, topmost first. The selected option is the editor's selection; arrows,
 * Home and End move it, Enter starts editing a text (`onEditText`), Delete removes it, and the
 * studio's command shortcuts (Ctrl+Z, Ctrl+D, Ctrl+] / Ctrl+[) work here too. Beside each option,
 * a group named after it holds "Ẩn"/"Hiện", "Khoá"/"Mở khoá", "Đưa lên" and "Đưa xuống" (the
 * keyboard way to reorder). The buttons sit outside the listbox, which may only own options; only
 * the selected row's buttons are tab stops.
 */
export function LayersPanel({ onEditText }: { onEditText?: (id: string) => void }) {
  const { editor } = useStudio();
  const code = useEditorState((s) => s.activeSurface);
  const elements = useEditorState(surfaceElements);
  const selectedId = useEditorState((s) => s.selectedId);
  const readOnly = useEditorState((s) => s.readOnly);
  const run = useShortcutRunner();
  const baseId = useId();

  const labels = layerLabels(elements);
  const rows: Row[] = elements
    .map((element, index) => ({ element, label: labels[index] ?? "", index }))
    .reverse();
  const optionId = (id: string) => `${baseId}-${id}`;
  const position = rows.findIndex((row) => row.element.id === selectedId);

  if (rows.length === 0) {
    return <p className="text-ink-tertiary text-sm">Mặt này chưa có phần tử nào.</p>;
  }

  const selectRow = (at: number) => {
    const row = rows[Math.max(0, Math.min(at, rows.length - 1))];
    if (!row) return;
    editor.select(row.element.id);
    document.getElementById(optionId(row.element.id))?.scrollIntoView?.({ block: "nearest" });
  };
  const toggle = (element: DesignElement, key: "hidden" | "locked") => {
    const patch = key === "hidden" ? { hidden: !element.hidden } : { locked: !element.locked };
    editor.apply((doc) => updateElement(doc, code, element.id, patch));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowDown: position < 0 ? 0 : position + 1,
      ArrowUp: position < 0 ? 0 : position - 1,
      Home: 0,
      End: rows.length - 1,
    };
    const to = moves[event.key];
    if (to !== undefined && !event.ctrlKey && !event.metaKey && !event.altKey) {
      selectRow(to);
    } else if (event.key === "Enter") {
      const selected = rows[position]?.element;
      if (selected?.type === "text" && !readOnly) onEditText?.(selected.id);
    } else if (!run(event)) {
      return;
    }
    event.preventDefault();
  };

  return (
    <div className="flex min-w-0 gap-1">
      <div
        role="listbox"
        aria-label="Lớp"
        tabIndex={0}
        aria-activedescendant={position < 0 ? undefined : optionId(selectedId ?? "")}
        onKeyDown={onKeyDown}
        className="focus-visible:ring-accent min-w-0 flex-1 rounded-[var(--r-md)] outline-none focus-visible:ring-2"
      >
        {rows.map(({ element, label }) => (
          <div
            key={element.id}
            id={optionId(element.id)}
            role="option"
            aria-selected={element.id === selectedId}
            onClick={() => editor.select(element.id)}
            className={cn(
              "text-ink-primary flex h-11 cursor-pointer items-center gap-2 rounded-[var(--r-md)] px-3 text-sm",
              "hover:bg-bg-subtle aria-selected:bg-bg-muted aria-selected:font-medium",
              element.hidden && "text-ink-tertiary",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {element.hidden ? <EyeOff aria-hidden className="size-4 shrink-0" /> : null}
            {element.locked ? <Lock aria-hidden className="size-4 shrink-0" /> : null}
          </div>
        ))}
      </div>
      <div className="flex shrink-0 flex-col">
        {rows.map(({ element, label, index }) => (
          <div
            key={element.id}
            role="group"
            aria-label={label}
            className={cn(
              "flex h-11 items-center",
              element.id === selectedId && "bg-bg-muted rounded-[var(--r-md)]",
            )}
          >
            <StudioIconButton
              label={element.hidden ? "Hiện" : "Ẩn"}
              tabIndex={element.id === selectedId ? 0 : -1}
              disabled={readOnly}
              onClick={() => toggle(element, "hidden")}
            >
              {element.hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
            </StudioIconButton>
            <StudioIconButton
              label={element.locked ? "Mở khoá" : "Khoá"}
              tabIndex={element.id === selectedId ? 0 : -1}
              disabled={readOnly}
              onClick={() => toggle(element, "locked")}
            >
              {element.locked ? <LockOpen aria-hidden /> : <Lock aria-hidden />}
            </StudioIconButton>
            <StudioIconButton
              label="Đưa lên"
              tabIndex={element.id === selectedId ? 0 : -1}
              disabled={readOnly || index === elements.length - 1}
              onClick={() => restackElement(editor, code, element.id, 1)}
            >
              <ArrowUp aria-hidden />
            </StudioIconButton>
            <StudioIconButton
              label="Đưa xuống"
              tabIndex={element.id === selectedId ? 0 : -1}
              disabled={readOnly || index === 0}
              onClick={() => restackElement(editor, code, element.id, -1)}
            >
              <ArrowDown aria-hidden />
            </StudioIconButton>
          </div>
        ))}
      </div>
    </div>
  );
}
