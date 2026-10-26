"use client";

import { useCallback, useEffect, type RefObject } from "react";

import { resolveShortcut, type ShortcutKeyEvent } from "../../engine";
import {
  duplicateSelection,
  nudgeSelection,
  removeSelection,
  restackSelection,
} from "./element-actions";
import { useStudio } from "./studio-context";
import { useTextEditing } from "./text-editing";

export type StudioKeyEvent = ShortcutKeyEvent & { altKey: boolean };

/**
 * Controls that use the keys themselves (typing, arrows, Delete): a key pressed there is theirs,
 * never a studio shortcut (spec §6.2).
 */
const OWNS_KEYS = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  ...[
    "textbox",
    "slider",
    "spinbutton",
    "combobox",
    "listbox",
    "menu",
    "tablist",
    "radiogroup",
  ].map((role) => `[role='${role}']`),
].join(", ");

const ownsKeys = (target: EventTarget | null) =>
  target instanceof Element && target.closest(OWNS_KEYS) !== null;

/** Buttons and links of the stage (zoom, …) are activated by Enter: it is theirs, not a shortcut. */
const ACTIVATED_BY_ENTER = "button, a[href], [role='button']";

const isPlainEnter = (event: KeyboardEvent) =>
  event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

/**
 * Runs the studio shortcut a key press stands for (undo/redo, delete, duplicate, raise/lower,
 * nudge, tool keys, Escape to drop the selection) and says whether it did, so the caller can
 * `preventDefault`. While read-only only the select tool and the selection respond.
 */
export function useShortcutRunner(): (event: StudioKeyEvent) => boolean {
  const services = useStudio();
  return useCallback(
    (event) => {
      const { editor } = services;
      if (event.key === "Escape" && !event.ctrlKey && !event.metaKey) {
        if (editor.store.getState().selectedId === null) return false;
        editor.select(null);
        return true;
      }
      const shortcut = event.altKey ? null : resolveShortcut(event);
      switch (shortcut?.action) {
        case "undo":
          editor.undo();
          return true;
        case "redo":
          editor.redo();
          return true;
        case "delete":
          return removeSelection(services);
        case "duplicate":
          return duplicateSelection(services);
        case "raise":
          return restackSelection(services, 1);
        case "lower":
          return restackSelection(services, -1);
        case "nudge":
          return nudgeSelection(services, shortcut.dx ?? 0, shortcut.dy ?? 0);
        case "tool": {
          const tool = shortcut.tool ?? "select";
          if (editor.store.getState().readOnly && tool !== "select") return false;
          editor.setTool(tool);
          return true;
        }
        default:
          return false;
      }
    },
    [services],
  );
}

/**
 * The studio's keyboard shortcuts, active while focus is inside `stageRef` (the stage) and not in
 * a control that uses the keys itself. One key press is one undo step. Enter opens the selected
 * text for inline editing (`useTextEditing`; the Layers list does the same for itself), only for
 * an editable text and never on a button or link, which Enter activates.
 */
export function useStudioShortcuts(stageRef: RefObject<HTMLElement | null>) {
  const run = useShortcutRunner();
  const { editor } = useStudio();
  const { start: editText } = useTextEditing();
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || ownsKeys(event.target)) return;
      if (isPlainEnter(event)) {
        const { selectedId } = editor.store.getState();
        const onButton =
          event.target instanceof Element && event.target.closest(ACTIVATED_BY_ENTER) !== null;
        // preventDefault: the Enter must not reach the field that opens, as a line break.
        if (!onButton && selectedId !== null && editText(selectedId)) event.preventDefault();
        return;
      }
      if (run(event)) event.preventDefault();
    };
    stage.addEventListener("keydown", onKeyDown);
    return () => stage.removeEventListener("keydown", onKeyDown);
  }, [stageRef, run, editor, editText]);
}
