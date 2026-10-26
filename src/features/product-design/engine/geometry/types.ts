/** A point in document space, in millimetres. */
export type PointMm = { x: number; y: number };

/** An axis-aligned rectangle in document space, in millimetres. */
export type RectMm = { x: number; y: number; width: number; height: number };

/**
 * One command of a flat outline path (surface boundary, print area, clip).
 * `M`/`L` move and line to a point; `A` is a circular arc about (`cx`, `cy`) with radius `r`
 * from `start` to `end` (radians, `ccw` = counter-clockwise); `Z` closes the sub-path.
 */
export type PathCmd =
  | { c: "M" | "L"; x: number; y: number }
  | { c: "A"; cx: number; cy: number; r: number; start: number; end: number; ccw: boolean }
  | { c: "Z" };
