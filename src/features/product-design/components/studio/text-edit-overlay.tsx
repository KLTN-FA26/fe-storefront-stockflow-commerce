"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";

import { applyToPoint, isWrapped, layoutText, type RectMm, type TextElement } from "../../engine";
import { patchElement } from "./element-actions";
import { frameMatrix } from "./selection-frame";
import { useEditorState, useStudio } from "./studio-context";
import { clipTextContent, DEFAULT_TEXT, finishTextEdit } from "./text-actions";
import { useTextEditing } from "./text-editing";

type EditorProps = {
  element: TextElement;
  cssPxPerMm: number;
  bounds: RectMm;
  onClose: () => void;
};

/**
 * One editing session of a text: a `<textarea>` laid over the element, in the stage's CSS px, with
 * the element's own font, size, line height, spacing, alignment and turn (the matrix of its
 * selection frame, without the scale, which is folded into the font size and the box). What is
 * typed goes to the document as it is typed, so the stage and the 3D preview follow; the
 * whole session is one undo step. A new text's placeholder ("Nhập chữ") is selected, so typing
 * replaces it; any other text opens with the caret at its end, so a stray key cannot wipe it.
 * What goes past `MAX_TEXT_CHARS` characters is cut off. Enter inserts a line break; Escape and leaving the field end the
 * session (the text is kept), and an empty or blank text is removed with it (`finishTextEdit`).
 *
 * A flat text is drawn by the stage, so its textarea shows only the caret and the selection. A
 * text bent around the cup is not flat there, so its textarea is a visible flat box centred on it
 * (R15: it need not follow the curve).
 */
function TextEditor({ element, cssPxPerMm: k, bounds, onClose }: EditorProps) {
  const services = useStudio();
  const { editor, surfaces, fonts, measure } = services;
  const { stop } = useTextEditing();
  const code = useEditorState((s) => s.activeSurface);
  const [session] = useState(() => editor.newId());
  const field = useRef<HTMLTextAreaElement>(null);
  /** Where focus was before the editor took it (the body: nowhere): Escape hands it back. */
  const opener = useRef<Element | null>(null);
  const ended = useRef(false);
  const surface = surfaces.byCode[code];
  /** A new text still holds the placeholder: typing should replace it, not add to it. */
  const [placeholder] = useState(() => element.content === DEFAULT_TEXT);

  useEffect(() => {
    opener.current ??= document.activeElement;
    const input = field.current;
    if (!input) return;
    input.focus();
    if (placeholder) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }, [placeholder]);

  if (!surface) return null;

  const end = (restoreFocus: boolean) => {
    if (ended.current) return;
    ended.current = true;
    finishTextEdit(services, code, element.id, session);
    stop();
    if (!restoreFocus) return;
    const back = opener.current;
    if (back instanceof HTMLElement && back !== document.body && back.isConnected) back.focus();
    else onClose();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Escape also cancels an IME composition (Telex, VNI): that is not the end of the session.
    if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    end(true);
  };

  const layout = layoutText(element, fonts, measure);
  const m = frameMatrix(element, surface);
  const centre = applyToPoint(m, { x: 0, y: 0 });
  /** CSS px per local mm: the placement scale (mm on the flat surface) times the stage's scale. */
  const px = Math.hypot(m[0], m[1]) * k;
  const wrapped = isWrapped(element, surface);

  return (
    <Textarea
      ref={field}
      aria-label="Nội dung chữ"
      value={element.content}
      wrap="off"
      spellCheck={false}
      onChange={(event) => {
        // At most MAX_TEXT_CHARS code points; the Properties panel says so once it is full.
        const content = clipTextContent(event.target.value);
        patchElement(editor, { code, surface, element }, { content }, session);
      }}
      onKeyDown={onKeyDown}
      onBlur={() => end(false)}
      className={cn(
        "absolute box-content field-sizing-fixed min-h-0 min-w-[1em] resize-none overflow-hidden rounded-none border-0 p-0 shadow-none",
        "ring-accent ring-1 focus-visible:ring-1",
        wrapped
          ? "bg-bg-surface text-ink-primary dark:bg-bg-surface"
          : "caret-accent selection:bg-accent/30 bg-transparent text-transparent dark:bg-transparent",
      )}
      style={{
        left: (centre.x - bounds.x) * k,
        top: (centre.y - bounds.y) * k,
        width: layout.widthMm * px,
        height: layout.heightMm * px,
        padding: "0 0.1em",
        transform: `translate(-50%, -50%) rotate(${Math.atan2(m[1], m[0])}rad)`,
        fontFamily: layout.family,
        fontSize: layout.fontSizeMm * px,
        fontWeight: layout.bold ? 700 : 400,
        fontStyle: layout.italic ? "italic" : "normal",
        lineHeight: element.lineHeight,
        letterSpacing: layout.letterSpacingMm * px,
        textAlign: element.align,
      }}
    />
  );
}

/**
 * The inline text editor of the stage, over the text `useTextEditing` says is being edited. It
 * mounts without a stage scale too (`cssPxPerMm` 0 before the first layout) so the field exists
 * as soon as editing starts. `onClose` hands focus to the stage when there is nowhere to return it.
 */
export function TextEditOverlay({
  cssPxPerMm,
  bounds,
  onClose,
}: {
  cssPxPerMm: number;
  bounds: RectMm;
  onClose: () => void;
}) {
  const { editingId, stop } = useTextEditing();
  const element = useEditorState((s) =>
    editingId === null
      ? undefined
      : s.document.surfaces[s.activeSurface]?.elements.find((el) => el.id === editingId),
  );
  // A text that is gone (undone, removed, on another surface) is no longer being edited.
  const gone = editingId !== null && element?.type !== "text";
  useEffect(() => {
    if (gone) stop();
  }, [gone, stop]);

  if (element?.type !== "text") return null;
  return (
    <TextEditor
      key={element.id}
      element={element}
      cssPxPerMm={cssPxPerMm}
      bounds={bounds}
      onClose={onClose}
    />
  );
}
