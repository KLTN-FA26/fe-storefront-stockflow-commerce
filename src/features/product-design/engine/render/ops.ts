import type { Hex, PatternId, Stroke } from "../document/schema";
import type { Mat2D } from "../geometry/affine";
import type { PolarWarp } from "../geometry/polar-warp";
import type { PathCmd, RectMm } from "../geometry/types";
import type { Guide } from "../surfaces/types";
import type { ArcGlyph } from "./arc-text";
import type { TextLayout } from "./text-layout";

/**
 * What a composition is for: the `editor` view adds the non-printing guides, `texture` and
 * `preview` feed the 3D model (so a kraft material is tinted), `print` is the artwork alone.
 */
export type ComposeTarget = "editor" | "texture" | "preview" | "print";

/** A picture drawn rigidly into its local `box` through `matrix`. */
export type ImageOp = Extract<DrawOp, { op: "image" }>;

/** Text lines drawn rigidly through `matrix`. */
export type TextOp = Extract<DrawOp, { op: "text" }>;

/** A wrapped image, remapped through its polar warp. */
export type WarpedImageOp = Extract<DrawOp, { op: "warpedImage" }>;

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
  /**
   * A wrapped text as vector glyphs along the arc (spec §5.2): `source` is its rigid op, which
   * gives the style; each glyph carries its own place.
   */
  | { op: "arcText"; source: TextOp; glyphs: ArcGlyph[] }
  /**
   * A wrapped image, remapped exactly through `warp` (spec §5.1); `source` is its rigid op, `id` its
   * element's (one cache entry each), `sheetRadiiMm` the radii about the apex the bleed spans.
   */
  | {
      op: "warpedImage";
      id: string;
      source: ImageOp;
      warp: PolarWarp;
      sheetRadiiMm: [inner: number, outer: number];
    }
  | { op: "multiply"; path: PathCmd[]; color: Hex }
  | { op: "guides"; guides: Guide[]; shadeOutside: PathCmd[] };
