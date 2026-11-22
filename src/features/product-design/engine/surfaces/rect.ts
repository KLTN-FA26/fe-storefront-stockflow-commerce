import type { PathCmd, PointMm, RectMm } from "../geometry/types";
import type { PrintAreaCode } from "../template/schema";
import { TRIM_SAMPLE_INSET_MM } from "./types";
import type { Guide, PrintSurface, SurfaceRegion } from "./types";

export type RectSurfaceSpec = {
  code: PrintAreaCode;
  /** Trim size; the width includes the seam flap when there is one. */
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  safeMarginMm: number;
  /** `v` at the trim's top edge (a cylinder cup's band starts below the rim). */
  vOffsetMm: number;
  /** Glue flap at the right end of the trim, kept out of the safe area; 0 when there is none. */
  seamMm: number;
  /** Adds a centre fold guide (bag gussets). */
  crease: boolean;
};

function rectPath({ x, y, width, height }: RectMm): PathCmd[] {
  return [
    { c: "M", x, y },
    { c: "L", x: x + width, y },
    { c: "L", x: x + width, y: y + height },
    { c: "L", x, y: y + height },
    { c: "Z" },
  ];
}

function inRect(p: PointMm, r: RectMm): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** Steps along each edge of the trim (BE `PrintSurface.Rect.trimSamples`: 11 points a side). */
const RECT_SAMPLE_STEPS = 10;

/** BE `Rect.trimSamples`: the trim inset by `TRIM_SAMPLE_INSET_MM`, 11 points along each side. */
function rectTrimSamples(trim: RectMm): PointMm[] {
  const left = trim.x + TRIM_SAMPLE_INSET_MM;
  const top = trim.y + TRIM_SAMPLE_INSET_MM;
  const right = trim.x + trim.width - TRIM_SAMPLE_INSET_MM;
  const bottom = trim.y + trim.height - TRIM_SAMPLE_INSET_MM;
  const points: PointMm[] = [];
  for (let i = 0; i <= RECT_SAMPLE_STEPS; i++) {
    const fx = left + ((right - left) * i) / RECT_SAMPLE_STEPS;
    const fy = top + ((bottom - top) * i) / RECT_SAMPLE_STEPS;
    points.push({ x: fx, y: top }, { x: fx, y: bottom }, { x: left, y: fy }, { x: right, y: fy });
  }
  return points;
}

/**
 * Rectangular surface (bag faces, cylindrical cups). Flat origin is the bleed box's top-left;
 * `u`/`v` are mm from the trim's top-left (`v` shifted by `vOffsetMm`), and upright is always 0.
 */
export function createRectSurface(spec: RectSurfaceSpec): PrintSurface {
  const { widthMm: w, heightMm: h, bleedMm: bleed, safeMarginMm: safe, seamMm: seam } = spec;
  const flatBounds: RectMm = { x: 0, y: 0, width: w + 2 * bleed, height: h + 2 * bleed };
  const regions: Record<SurfaceRegion, RectMm> = {
    bleed: flatBounds,
    trim: { x: bleed, y: bleed, width: w, height: h },
    safe: { x: bleed + safe, y: bleed + safe, width: w - seam - 2 * safe, height: h - 2 * safe },
  };
  const seamX = bleed + w - seam;
  const verticalLine = (x: number): PathCmd[] => [
    { c: "M", x, y: bleed },
    { c: "L", x, y: bleed + h },
  ];

  return {
    code: spec.code,
    kind: "rect",
    flatBounds,
    uRange: [0, w],
    vRange: [spec.vOffsetMm, spec.vOffsetMm + h],
    bleedMm: bleed,
    toFlat: (u, v) => ({ x: u + bleed, y: v - spec.vOffsetMm + bleed, uprightRad: 0 }),
    fromFlat: (x, y) => ({ u: x - bleed, v: y - bleed + spec.vOffsetMm }),
    contains: (p, region) => inRect(p, regions[region]),
    inSeam: (p) => seam > 0 && inRect(p, regions.trim) && p.x > seamX,
    trimSamples: () => rectTrimSamples(regions.trim),
    outline: (region) => rectPath(regions[region]),
    guides: () => {
      const guides: Guide[] = [
        { kind: "bleed", path: rectPath(regions.bleed) },
        { kind: "trim", path: rectPath(regions.trim) },
        { kind: "safe", path: rectPath(regions.safe) },
      ];
      if (seam > 0) guides.push({ kind: "seam", path: verticalLine(seamX) });
      if (spec.crease) guides.push({ kind: "crease", path: verticalLine(bleed + w / 2) });
      return guides;
    },
    uvOf: (x, y) => [x / flatBounds.width, 1 - y / flatBounds.height],
  };
}
