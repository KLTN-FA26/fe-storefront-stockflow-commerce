import type { PathCmd } from "../geometry/types";
import { mmToPt } from "../geometry/units";

/** One PDF path-construction operator with its operands, in pt and PDF user space (y up). */
export type PdfSegment = { op: "m" | "l" | "c" | "h"; args: number[] };

const TAU = Math.PI * 2;
/** A cubic Bézier stays within about 0.03 % of the true arc up to this angle. */
const MAX_SEGMENT_RAD = Math.PI / 2;
/** Two points closer than this (mm) are the same point: no joining line is needed. */
const COINCIDENT_MM = 1e-6;
/** Absorbs float error so an exact quarter turn is one segment, not two. */
const SEGMENT_EPSILON = 1e-9;

const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

/**
 * Signed sweep of a canvas `arc(…, start, end, ccw)`: positive turns clockwise on screen (angles
 * grow towards +y), negative counter-clockwise. A full turn or more is exactly one circle; otherwise
 * the sweep is the angular distance from `start` to `end` in the arc's own direction.
 */
function canvasSweep(start: number, end: number, ccw: boolean): number {
  const delta = end - start;
  if (!ccw) return delta >= TAU ? TAU : mod(delta, TAU);
  return -delta >= TAU ? -TAU : -mod(-delta, TAU);
}

/**
 * Flat dieline path (mm, y down, origin at the bleed box's top-left) as PDF path operators (pt, y up,
 * origin at the page's bottom-left). Arcs become cubic Béziers of at most 90° each; like a canvas path,
 * an arc that does not start at the current point is joined to it with a line.
 */
export function pathToPdf(path: PathCmd[], pageHeightMm: number): PdfSegment[] {
  const pageHeightPt = mmToPt(pageHeightMm);
  const toPdf = (x: number, y: number): [number, number] => [mmToPt(x), pageHeightPt - mmToPt(y)];

  const out: PdfSegment[] = [];
  let current: { x: number; y: number } | null = null;
  let subpathStart: { x: number; y: number } | null = null;

  const moveTo = (x: number, y: number) => {
    out.push({ op: "m", args: toPdf(x, y) });
    current = subpathStart = { x, y };
  };
  const lineTo = (x: number, y: number) => {
    if (current === null) return moveTo(x, y);
    out.push({ op: "l", args: toPdf(x, y) });
    current = { x, y };
  };

  for (const cmd of path) {
    if (cmd.c === "Z") {
      if (current !== null) {
        out.push({ op: "h", args: [] });
        current = subpathStart;
      }
    } else if (cmd.c !== "A") {
      if (cmd.c === "M") moveTo(cmd.x, cmd.y);
      else lineTo(cmd.x, cmd.y);
    } else {
      const { cx, cy, r } = cmd;
      const sweep = canvasSweep(cmd.start, cmd.end, cmd.ccw);
      const at = (angle: number) => ({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });

      const from = at(cmd.start);
      if (current === null) moveTo(from.x, from.y);
      else if (Math.hypot(from.x - current.x, from.y - current.y) > COINCIDENT_MM) {
        lineTo(from.x, from.y);
      }

      const segments = Math.ceil(Math.abs(sweep) / MAX_SEGMENT_RAD - SEGMENT_EPSILON);
      const step = segments === 0 ? 0 : sweep / segments;
      // Handle length for a Bézier over `step`; its sign follows the direction of travel.
      const k = (4 / 3) * Math.tan(step / 4);
      for (let i = 0; i < segments; i++) {
        const a = cmd.start + i * step;
        const b = a + step;
        const p0 = at(a);
        const p3 = at(b);
        out.push({
          op: "c",
          args: [
            ...toPdf(p0.x - k * r * Math.sin(a), p0.y + k * r * Math.cos(a)),
            ...toPdf(p3.x + k * r * Math.sin(b), p3.y - k * r * Math.cos(b)),
            ...toPdf(p3.x, p3.y),
          ],
        });
        current = p3;
      }
    }
  }
  return out;
}
