import type { Hex, PatternId, Stroke } from "../document/schema";
import type { Mat2D } from "../geometry/affine";
import type { PathCmd, RectMm } from "../geometry/types";
import type { Guide } from "../surfaces/types";
import type { TextLayout } from "./text-layout";

/**
 * What a composition is for: the `editor` view adds the non-printing guides, `texture` and
 * `preview` feed the 3D model (so a kraft material is tinted), `print` is the artwork alone.
 */
export type ComposeTarget = "editor" | "texture" | "preview" | "print";

/**
 * A slice of a wrapped element: the source columns `[srcX, srcX + srcWidth)` (local mm, before
 * `scale`) drawn through `matrix`, which maps element-local to flat coordinates.
 */
export type Strip = { srcX: number; srcWidth: number; matrix: Mat2D };

/** The ops of an element that can be sliced into strips. */
export type WarpableOp = Extract<DrawOp, { op: "image" | "text" }>;

/**
 * One drawing instruction in flat mm. `compose` emits these and the executor replays them onto a
 * canvas or PDF (applying its own px-per-mm), so composition itself never touches a canvas.
 */
export type DrawOp =
  | { op: "save" }
  | { op: "restore" }
  | { op: "clip"; path: PathCmd[] }
  | { op: "fill"; path: PathCmd[]; color: Hex }
  | {
      op: "pattern";
      bounds: RectMm;
      patternId: PatternId;
      colors: [Hex, Hex];
      scale: number;
      rotationDeg: number;
    }
  | { op: "image"; matrix: Mat2D; box: RectMm; assetId: string; opacity: number }
  | {
      op: "text";
      matrix: Mat2D;
      layout: TextLayout;
      color: Hex;
      outline?: { color: Hex; widthMm: number };
      opacity: number;
    }
  | { op: "drawing"; id: string; matrix: Mat2D; box: RectMm; strokes: Stroke[]; opacity: number }
  | { op: "warped"; source: WarpableOp; strips: Strip[] }
  | { op: "multiply"; path: PathCmd[]; color: Hex }
  | { op: "guides"; guides: Guide[]; shadeOutside: PathCmd[] };
