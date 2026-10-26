import type { Placement } from "../document/schema";
import type { PrintSurface } from "../surfaces/types";

/** A guide an element centre can snap to: a `u` line, a `v` line, or both (a point). */
export type SnapTarget = { u?: number; v?: number };

export type SnapResult = {
  u: number;
  v: number;
  /** The target `u` snapped to, or `null` when no target was within the threshold. */
  snappedU: number | null;
  snappedV: number | null;
};

const DEFAULT_THRESHOLD_MM = 2;

/** The candidate nearest to `value` within `threshold` mm, or `null`. */
function nearest(value: number, candidates: number[], threshold: number): number | null {
  let best: number | null = null;
  for (const c of candidates) {
    const gap = Math.abs(c - value);
    if (gap <= threshold && (best === null || gap < Math.abs(best - value))) best = c;
  }
  return best;
}

const defined = (values: (number | undefined)[]): number[] =>
  values.filter((value): value is number => value !== undefined);

/**
 * Snaps a placement centre to the nearest target on each axis independently, when it is within
 * `thresholdMm`. An axis with no target in range keeps its value and reports `null`.
 */
export function snapPlacement(
  p: { u: number; v: number },
  targets: SnapTarget[],
  thresholdMm: number = DEFAULT_THRESHOLD_MM,
): SnapResult {
  const snappedU = nearest(p.u, defined(targets.map((t) => t.u)), thresholdMm);
  const snappedV = nearest(p.v, defined(targets.map((t) => t.v)), thresholdMm);
  return { u: snappedU ?? p.u, v: snappedV ?? p.v, snappedU, snappedV };
}

const BISECTION_STEPS = 40;

/**
 * The boundary between `inside` (a value known to be inside) and `outside`, found by bisection;
 * `outside` itself when that is inside too (no margin).
 */
function edgeBetween(inside: number, outside: number, isInside: (t: number) => boolean): number {
  if (isInside(outside)) return outside;
  let [a, b] = [inside, outside];
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (a + b) / 2;
    if (isInside(mid)) a = mid;
    else b = mid;
  }
  return a;
}

/**
 * Snap targets of a surface: the visible centre and the safe-area edges on each axis, plus the
 * centre lines of the other elements. The safe edges are read off `contains(…, "safe")` along the
 * surface's centre lines, so a cup's seam flap (outside the safe area) is not part of the centre.
 */
export function surfaceSnapTargets(surface: PrintSurface, others: Placement[]): SnapTarget[] {
  const [u0, u1] = surface.uRange;
  const [v0, v1] = surface.vRange;
  const [uMid, vMid] = [(u0 + u1) / 2, (v0 + v1) / 2];
  const safeAt = (u: number, v: number) => {
    const { x, y } = surface.toFlat(u, v);
    return surface.contains({ x, y }, "safe");
  };

  const uLo = edgeBetween(uMid, u0, (u) => safeAt(u, vMid));
  const uHi = edgeBetween(uMid, u1, (u) => safeAt(u, vMid));
  const vLo = edgeBetween(vMid, v0, (v) => safeAt(uMid, v));
  const vHi = edgeBetween(vMid, v1, (v) => safeAt(uMid, v));

  return [
    { u: (uLo + uHi) / 2 },
    { v: (vLo + vHi) / 2 },
    { u: uLo },
    { u: uHi },
    { v: vLo },
    { v: vHi },
    ...others.flatMap((o) => [{ u: o.u }, { v: o.v }]),
  ];
}
