import { boundsOf } from "./polygon";
import type { PointMm, RectMm } from "./types";

const QUARTER_TURN = Math.PI / 2;

/**
 * The exact flat bounding box of the annular sector about `centre` between the two `radii` and the
 * angles `from` and `to`, in either order (0 = straight up, −y; `x = r·sin φ`, `y = −r·cos φ`). An
 * arc reaches its extremes in x and y only at its ends or at an axis angle (a multiple of π/2), and
 * along a ray x and y are linear in the radius, so the ends and the axis angles in range, each on
 * both radii, are all the points it needs.
 */
export function sectorBounds(
  centre: PointMm,
  radii: readonly [number, number],
  from: number,
  to: number,
): RectMm {
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  const angles = [lo, hi];
  for (let k = Math.ceil(lo / QUARTER_TURN); k * QUARTER_TURN <= hi; k++) {
    angles.push(k * QUARTER_TURN);
  }
  return boundsOf(
    angles.flatMap((phi) =>
      radii.map((r) => ({ x: centre.x + r * Math.sin(phi), y: centre.y - r * Math.cos(phi) })),
    ),
  );
}
