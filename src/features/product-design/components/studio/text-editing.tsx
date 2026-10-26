"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { EditorController } from "../../engine";
import { editableText } from "./text-actions";

/** Which text of the active surface is being edited inline, and how to start and end that. */
export type TextEditing = {
  editingId: string | null;
  /** Selects the text and opens the inline editor on it; `false` when it may not be edited. */
  start(id: string): boolean;
  stop(): void;
};

/** The state behind `TextEditingProvider`: one text at a time, never in a read-only design. */
export function useTextEditingState(editor: EditorController): TextEditing {
  const [editingId, setEditingId] = useState<string | null>(null);
  const start = useCallback(
    (id: string) => {
      if (!editableText(editor, id)) return false;
      editor.select(id);
      setEditingId(id);
      return true;
    },
    [editor],
  );
  const stop = useCallback(() => setEditingId(null), []);
  return useMemo(() => ({ editingId, start, stop }), [editingId, start, stop]);
}

const TextEditingContext = createContext<TextEditing | null>(null);

export function TextEditingProvider({
  value,
  children,
}: {
  value: TextEditing;
  children: ReactNode;
}) {
  return <TextEditingContext.Provider value={value}>{children}</TextEditingContext.Provider>;
}

export function useTextEditing(): TextEditing {
  const editing = useContext(TextEditingContext);
  if (!editing) throw new Error("useTextEditing must be used inside <TextEditingProvider>");
  return editing;
}
