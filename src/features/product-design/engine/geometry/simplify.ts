/** Distance from (`px`, `py`) to the segment (`ax`, `ay`)–(`bx`, `by`), clamped to its ends. */
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Ramer–Douglas–Peucker polyline simplification over `[x, y, …]` tuples (extra components, such
 * as pressure, ride along untouched). The first and last points are always kept, and a point
 * survives when it lies farther than `tolerance` from the simplified segment. Iterative, so long
 * freehand strokes cannot overflow the call stack.
 */
export function simplifyRdp<T extends readonly number[]>(points: T[], tolerance: number): T[] {
  const n = points.length;
  if (n < 3) return [...points];

  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;

  const pending: Array<[first: number, last: number]> = [[0, n - 1]];
  for (let range = pending.pop(); range; range = pending.pop()) {
    const [first, last] = range;
    const [ax = 0, ay = 0] = points[first] ?? [];
    const [bx = 0, by = 0] = points[last] ?? [];

    let farthest = -1;
    let farthestDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const [px = 0, py = 0] = points[i] ?? [];
      const distance = distanceToSegment(px, py, ax, ay, bx, by);
      if (distance > farthestDistance) {
        farthest = i;
        farthestDistance = distance;
      }
    }

    if (farthest !== -1) {
      keep[farthest] = true;
      pending.push([first, farthest], [farthest, last]);
    }
  }

  return points.filter((_, i) => keep[i]);
}
