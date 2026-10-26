import type { PointMm } from "./types";

/**
 * A 2D affine matrix in canvas `setTransform(a, b, c, d, e, f)` order:
 * `x' = a·x + c·y + e`, `y' = b·x + d·y + f`.
 */
export type Mat2D = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export const IDENTITY: Mat2D = [1, 0, 0, 1, 0, 0];

/** Composition `m1 · m2`: the result applies `m2` first, then `m1`. */
export function multiply(m1: Mat2D, m2: Mat2D): Mat2D {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/** The inverse matrix, or `null` when `m` is singular (for example a zero scale). */
export function invert(m: Mat2D): Mat2D | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (det === 0 || !Number.isFinite(det)) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export function applyToPoint(m: Mat2D, p: PointMm): PointMm {
  const [a, b, c, d, e, f] = m;
  return { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f };
}

export function translate(x: number, y: number): Mat2D {
  return [1, 0, 0, 1, x, y];
}

/** Rotation by `rad` radians (positive turns +x towards +y, clockwise on a y-down canvas). */
export function rotate(rad: number): Mat2D {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [cos, sin, -sin, cos, 0, 0];
}

export function scale(sx: number, sy: number): Mat2D {
  return [sx, 0, 0, sy, 0, 0];
}
