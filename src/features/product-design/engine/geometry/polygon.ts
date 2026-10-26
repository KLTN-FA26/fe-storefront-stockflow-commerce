import type { PointMm, RectMm } from "./types";

/**
 * Even-odd ray-casting hit test. A polygon needs at least 3 vertices; the result for a point
 * exactly on an edge is unspecified (callers treat boundary hits as a coin flip either way).
 */
export function pointInPolygon(p: PointMm, poly: PointMm[]): boolean {
  const last = poly.at(-1);
  if (poly.length < 3 || last === undefined) return false;

  let inside = false;
  let prev = last;
  for (const cur of poly) {
    const crossesRay = cur.y > p.y !== prev.y > p.y;
    if (crossesRay && p.x < ((prev.x - cur.x) * (p.y - cur.y)) / (prev.y - cur.y) + cur.x) {
      inside = !inside;
    }
    prev = cur;
  }
  return inside;
}

/** Axis-aligned bounding box of `points`; a zero rect at the origin when there are none. */
export function boundsOf(points: PointMm[]): RectMm {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Segments each edge is cut into by `alongEdges`: even, so every edge's midpoint is sampled. */
const EDGE_SEGMENTS = 10;

/**
 * Every vertex of a closed outline plus `EDGE_SEGMENTS − 1` evenly spaced points on the edge that
 * starts there, so a containment test also sees the middle of each straight edge.
 */
export function alongEdges(outline: PointMm[]): PointMm[] {
  return outline.flatMap((a, i) => {
    const b = outline[(i + 1) % outline.length] ?? a;
    return Array.from({ length: EDGE_SEGMENTS }, (_, k) => ({
      x: a.x + ((b.x - a.x) * k) / EDGE_SEGMENTS,
      y: a.y + ((b.y - a.y) * k) / EDGE_SEGMENTS,
    }));
  });
}
