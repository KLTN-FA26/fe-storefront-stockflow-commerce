import {
  PATTERN_IDS,
  setBackground,
  setBackgroundAll,
  type Background,
  type EditorController,
  type Hex,
  type PatternId,
  type PrintAreaCode,
} from "../../engine";

export type BackgroundKind = Background["kind"];
export type PatternBackground = Extract<Background, { kind: "pattern" }>;

export const NO_BACKGROUND: Background = { kind: "none" };

/** What a pattern's scale (the motif pitch, mm) and rotation (°) may be. */
export const PATTERN_SCALE_MM = { min: 2, max: 40 } as const;
export const PATTERN_ROTATION_DEG = { min: 0, max: 180 } as const;

/** What a new colour or pattern starts with: print data, a neutral grey ground and a darker motif. */
const DEFAULT_GROUND: Hex = "#9CA3AF";
const DEFAULT_MOTIF: Hex = "#374151";
const DEFAULT_PATTERN_SCALE_MM = 10;

/** The patterns as the customer reads them, in the engine's order. */
export const PATTERN_NAMES: Readonly<Record<PatternId, string>> = {
  dots: "Chấm bi",
  stripes: "Kẻ sọc",
  checker: "Ca rô",
  waves: "Sóng",
  grid: "Lưới",
  chevron: "Zig-zag",
};

export const isBackgroundKind = (value: string): value is BackgroundKind =>
  value === "none" || value === "color" || value === "pattern";

/**
 * The background of `kind` that takes over from `current`: `current` itself when it already is of
 * that kind; else a colour that keeps the ground colour of what it replaces, or the first pattern
 * over it.
 */
export function backgroundOfKind(kind: BackgroundKind, current: Background): Background {
  if (current.kind === kind) return current;
  switch (kind) {
    case "none":
      return NO_BACKGROUND;
    case "color":
      return { kind, color: current.kind === "pattern" ? current.colors[0] : DEFAULT_GROUND };
    case "pattern":
      return {
        kind,
        patternId: PATTERN_IDS[0],
        colors: [current.kind === "color" ? current.color : DEFAULT_GROUND, DEFAULT_MOTIF],
        scale: DEFAULT_PATTERN_SCALE_MM,
        rotationDeg: 0,
      };
  }
}

/** Sets surface `code`'s background; edits sharing a `session` (one scrub of a slider) are one undo step. */
export function applyBackground(
  editor: EditorController,
  code: PrintAreaCode,
  background: Background,
  session?: string,
) {
  editor.apply(
    (doc) => setBackground(doc, code, background),
    session === undefined ? undefined : { gestureId: session },
  );
}

/** One background on every face, as one undo step. */
export function applyBackgroundToAll(editor: EditorController, background: Background) {
  editor.apply((doc) => setBackgroundAll(doc, background));
}
