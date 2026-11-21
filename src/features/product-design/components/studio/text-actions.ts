import {
  addElement,
  clampPlacement,
  MAX_ELEMENTS_PER_SURFACE,
  removeElement,
  type CustomizationTemplate,
  type EditorController,
  type FontRegistry,
  type Hex,
  type PrintAreaCode,
  type TextElement,
} from "../../engine";
import type { LibraryText } from "../../types";
import { SCALE_RANGE } from "./element-actions";
import { bendOnSurface } from "./image-actions";
import { largestScaleInSafe, safeBox } from "./safe-fit";
import { STUDIO_ANNOUNCEMENTS } from "./studio-announcer";
import type { StudioServices } from "./studio-context";

/** The size range of a text, in pt (the Properties field and the shrink that keeps it in the safe area). */
export const MIN_TEXT_SIZE_PT = 6;
export const MAX_TEXT_SIZE_PT = 200;
/** What the Properties fields let a text take. */
export const TEXT_LIMITS = {
  letterSpacingEm: { min: -0.2, max: 2 },
  lineHeight: { min: 0.8, max: 3 },
  outlineMm: { min: 0.1, max: 5 },
} as const;

/** The most characters (code points) a text holds: what is typed or pasted past it is cut off. */
export const MAX_TEXT_CHARS = 500;

/** `content` cut to `MAX_TEXT_CHARS` code points (an emoji or a Vietnamese letter is one). */
export const clipTextContent = (content: string): string => {
  const chars = [...content];
  return chars.length > MAX_TEXT_CHARS ? chars.slice(0, MAX_TEXT_CHARS).join("") : content;
};

/** Whether a text has reached `MAX_TEXT_CHARS`. */
export const isTextFull = (content: string): boolean => [...content].length >= MAX_TEXT_CHARS;

/** What a new text says until the customer types over it (selected on opening, so typing replaces it). */
export const DEFAULT_TEXT = "Nhập chữ";
/** Print data: near-black ink, and a blue outline that shows on white and on kraft stock alike. */
export const DEFAULT_TEXT_COLOR: Hex = "#111111";
export const DEFAULT_OUTLINE = { color: "#2563EB", widthMm: 0.5 } as const satisfies {
  color: Hex;
  widthMm: number;
};

/** The sizes the tool panel adds a text at: "Tiêu đề", "Phụ đề", "Ghi chú". */
export type TextPreset = { sizePt: number; bold: boolean };
export const TEXT_PRESETS: readonly (TextPreset & { label: string })[] = [
  { label: "Tiêu đề", sizePt: 48, bold: true },
  { label: "Phụ đề", sizePt: 24, bold: false },
  { label: "Ghi chú", sizePt: 12, bold: false },
];
/** What "Thêm chữ" adds: the plain 24 pt text. */
export const DEFAULT_PRESET: TextPreset = { sizePt: 24, bold: false };

/** A font the customer may pick, as the registry spells it. */
export type FontOption = { code: string; label: string; family: string; italic: boolean };

/**
 * The fonts a text on this template may use, in the template's order: its `allowedFontCodes`,
 * or every font of the registry when it lists none (`null` or empty, R30). A listed code the
 * registry does not know is skipped, and so is one the BE does not list (`served`, BE-18);
 * `served` is `null` while the BE's list is unknown (not read yet, or it failed): the registry
 * stands alone then, so the studio never waits on that read.
 */
export function allowedFonts(
  template: CustomizationTemplate,
  fonts: FontRegistry,
  served: readonly string[] | null = null,
): FontOption[] {
  const listed = template.allowedFontCodes;
  const codes = listed !== null && listed.length > 0 ? listed : Object.keys(fonts);
  return [...new Set(codes)].flatMap((code) => {
    const font = fonts[code];
    return font && (served === null || served.includes(code)) ? [{ code, ...font }] : [];
  });
}

type PlaceServices = Pick<
  StudioServices,
  "editor" | "surfaces" | "sizer" | "fonts" | "servedFontCodes" | "template" | "announce"
>;

/**
 * Adds a text to the active surface: the defaults, in the template's first allowed font, centred
 * on the safe area and selected, as one undo step. Its size is then shrunk (to 0.1 pt, at least
 * `MIN_TEXT_SIZE_PT`) until its whole outline is inside the safe area, and the pointer goes back
 * to the select tool (only it moves and resizes). Returns the new element's id, or `null` when
 * nothing was added: the design is read-only, the surface is full, or no font is allowed.
 */
export function placeText(
  { editor, surfaces, sizer, fonts, servedFontCodes, template, announce }: PlaceServices,
  preset: TextPreset,
): string | null {
  const { activeSurface: code, readOnly, document } = editor.store.getState();
  const surface = surfaces.byCode[code];
  const font = allowedFonts(template, fonts, servedFontCodes)[0];
  if (!surface || !font || readOnly) return null;
  if ((document.surfaces[code]?.elements.length ?? 0) >= MAX_ELEMENTS_PER_SURFACE) return null;

  const safe = safeBox(surface);
  const sized: TextElement = {
    id: editor.newId(),
    type: "text",
    name: "Chữ",
    hidden: false,
    locked: false,
    opacity: 1,
    placement: clampPlacement({ u: safe.u, v: safe.v, rotationDeg: 0, scale: 1 }, surface),
    content: DEFAULT_TEXT,
    fontCode: font.code,
    sizePt: preset.sizePt,
    color: DEFAULT_TEXT_COLOR,
    align: "center",
    bold: preset.bold,
    italic: false,
    letterSpacingEm: 0,
    lineHeight: 1.2,
    ...bendOnSurface(surface),
  };
  // A text's box grows in step with its size, so the scale that fits is the factor to shrink by.
  const shrink = largestScaleInSafe(
    sized,
    sizer(sized),
    surface,
    Math.min(1, MIN_TEXT_SIZE_PT / sized.sizePt),
    1,
  );
  const fitted = Math.max(MIN_TEXT_SIZE_PT, Math.floor(sized.sizePt * shrink * 10) / 10);
  const element: TextElement = shrink === 1 ? sized : { ...sized, sizePt: fitted };

  editor.apply((doc) => addElement(doc, code, element));
  editor.select(element.id);
  editor.setTool("select");
  announce(STUDIO_ANNOUNCEMENTS.textAdded);
  return element.id;
}

/**
 * Adds a saved text style of the project library (`item.text` in `item.style`) to the active
 * surface, centred on the safe area and selected, as one undo step. The saved size stays; when the
 * box is wider than the safe area the placement's scale is lowered until the whole outline fits
 * (the size and the outline width shrink with it). The saved font is used when the template allows
 * it, else the first allowed one (an italic only where that font has one). Returns the new
 * element's id, or `null` when nothing was added, as `placeText` does.
 */
export function placeTextStyle(
  { editor, surfaces, sizer, fonts, servedFontCodes, template, announce }: PlaceServices,
  item: Pick<LibraryText, "text" | "style">,
): string | null {
  const { activeSurface: code, readOnly, document } = editor.store.getState();
  const surface = surfaces.byCode[code];
  const allowed = allowedFonts(template, fonts, servedFontCodes);
  const font = allowed.find((option) => option.code === item.style.fontCode) ?? allowed[0];
  if (!surface || !font || readOnly) return null;
  if ((document.surfaces[code]?.elements.length ?? 0) >= MAX_ELEMENTS_PER_SURFACE) return null;

  const { style } = item;
  const safe = safeBox(surface);
  const sized: TextElement = {
    id: editor.newId(),
    type: "text",
    name: "Chữ",
    hidden: false,
    locked: false,
    opacity: 1,
    placement: clampPlacement({ u: safe.u, v: safe.v, rotationDeg: 0, scale: 1 }, surface),
    content: clipTextContent(item.text),
    fontCode: font.code,
    sizePt: style.sizePt,
    color: style.color,
    align: style.align,
    bold: style.bold,
    italic: font.italic ? style.italic : false,
    letterSpacingEm: style.letterSpacingEm,
    lineHeight: style.lineHeight,
    ...(style.outline ? { outline: style.outline } : {}),
    ...bendOnSurface(surface),
  };
  const scale = largestScaleInSafe(sized, sizer(sized), surface, SCALE_RANGE.min, 1);
  const element: TextElement =
    scale === 1 ? sized : { ...sized, placement: { ...sized.placement, scale } };

  editor.apply((doc) => addElement(doc, code, element));
  editor.select(element.id);
  editor.setTool("select");
  announce(STUDIO_ANNOUNCEMENTS.textAdded);
  return element.id;
}

/** The text `id` of the active surface when the customer may edit it: not read-only, locked or hidden. */
export function editableText(editor: EditorController, id: string): TextElement | null {
  const { document, activeSurface, readOnly } = editor.store.getState();
  const element = document.surfaces[activeSurface]?.elements.find((el) => el.id === id);
  return element?.type === "text" && !readOnly && !element.locked && !element.hidden
    ? element
    : null;
}

/**
 * Ends an editing session of text `id` on `code`: a text left empty or with only blanks is
 * removed, in the session's own undo step (`gestureId`), so one undo brings back what it was
 * before the session.
 */
export function finishTextEdit(
  { editor, announce }: Pick<StudioServices, "editor" | "announce">,
  code: PrintAreaCode,
  id: string,
  gestureId: string,
): void {
  const element = editor.store
    .getState()
    .document.surfaces[code]?.elements.find((el) => el.id === id);
  if (element?.type !== "text" || element.content.trim() !== "") return;
  editor.apply((doc) => removeElement(doc, code, id), { gestureId });
  announce(STUDIO_ANNOUNCEMENTS.elementRemoved);
}
