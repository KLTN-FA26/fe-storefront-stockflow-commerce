import type { PathCmd, PointMm, RectMm } from "../geometry/types";
import type { PrintAreaCode } from "../template/schema";

/** Nested print regions: bleed ⊃ trim ⊃ safe. */
export type SurfaceRegion = "bleed" | "trim" | "safe";

/** A non-printing line drawn over the editor view (never exported). */
export type Guide = { kind: "bleed" | "trim" | "safe" | "seam" | "crease"; path: PathCmd[] };

/** A dieline point plus the direction that reads as "up" on the product there (radians). */
export type FlatPoint = PointMm & { uprightRad: number };

/** Surface coordinates in mm: `u` across the print area, `v` down from its top (spec §4.3). */
export type SurfacePoint = { u: number; v: number };

/**
 * One print area unrolled into flat (dieline) coordinates. The flat origin is the top-left of
 * `flatBounds`, the bleed box; 2D editor, 3D texture and print output all share this geometry.
 */
export interface PrintSurface {
  code: PrintAreaCode;
  kind: "rect" | "sector";
  flatBounds: RectMm;
  uRange: [number, number];
  vRange: [number, number];
  bleedMm: number;
  toFlat(u: number, v: number): FlatPoint;
  fromFlat(x: number, y: number): SurfacePoint;
  contains(p: PointMm, region: SurfaceRegion): boolean;
  /** True inside the trim on the glue flap, which is hidden under the overlap once assembled. */
  inSeam(p: PointMm): boolean;
  outline(region: SurfaceRegion): PathCmd[];
  guides(): Guide[];
  /** Flat point → texture UV over `flatBounds` (V grows upwards, as in three.js). */
  uvOf(x: number, y: number): [number, number];
}

/** Every print surface of a template, in `printAreas` order. */
export type SurfaceSet = {
  order: PrintAreaCode[];
  byCode: Readonly<Partial<Record<PrintAreaCode, PrintSurface>>>;
};
