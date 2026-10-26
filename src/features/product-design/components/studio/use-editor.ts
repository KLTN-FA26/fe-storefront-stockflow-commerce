"use client";

import { useEffect, useState } from "react";

import {
  createEditor,
  type CustomizationTemplate,
  type DesignDocument,
  type EditorController,
} from "../../engine";

/** Read-only allows the select tool only. */
function applyReadOnly(editor: EditorController, readOnly: boolean) {
  editor.setReadOnly(readOnly);
  if (readOnly) editor.setTool("select");
}

/**
 * The editor of the open design, created once from the document as it was loaded: from then on the
 * editor owns the document (autosave writes it back), so a later refetch never replaces it. It is
 * read-only (select tool only) while the design's lifecycle state is not editable, and follows
 * that state.
 */
export function useEditor({
  template,
  document,
  readOnly,
}: {
  template: CustomizationTemplate;
  document: DesignDocument;
  readOnly: boolean;
}): EditorController {
  const [editor] = useState(() => {
    const created = createEditor({ template, document });
    applyReadOnly(created, readOnly); // before the first render, so nothing shows as editable
    return created;
  });
  useEffect(() => applyReadOnly(editor, readOnly), [editor, readOnly]);
  return editor;
}
