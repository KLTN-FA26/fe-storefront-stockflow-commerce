import { getStroke } from "perfect-freehand";

import type { Stroke } from "../document/schema";

/**
 * perfect-freehand counts in the units of its input: it skips the last 3 units of a stroke as noise
 * (`END_NOISE_THRESHOLD`) and gives a tap a second point 1 unit away. Fed millimetres, a stroke
 * shorter than 3 mm lost its end and a tap grew a half-disc towards a point 1.4 mm off, far past a
 * fine brush. So it is fed tenths of a millimetre, where those are 0.3 mm and 0.1 mm.
 */
const UNITS_PER_MM = 10;

/**
 * The filled outline of a freehand stroke, in the drawing's local mm. `sizeMm` is the brush
 * diameter. A pointer without pressure reports one constant value for the whole stroke (a mouse
 * says 0.5, some touch screens 1), so equal pressures mean "no information": the width is simulated
 * from the speed and the reported value is dropped (it would otherwise seed the simulation and
 * make the same stroke differ by device). Real, varying pressure drives the width directly.
 * The outline stays within `0.75 × sizeMm` of the stroke's points (`createSizer` sizes the drawing
 * box from that), taps and strokes of a few tenths of a millimetre included (see `UNITS_PER_MM`).
 * Stored strokes are always finished, hence `last` (the outline reaches the final point instead of
 * stopping short by the smoothing lag).
 */
export function strokePolygon(stroke: Stroke): [number, number][] {
  const { points } = stroke;
  const firstPressure = points[0]?.[2];
  const simulatePressure = points.every(([, , pressure]) => pressure === firstPressure);
  const fed = points.map(([x, y, pressure]) =>
    simulatePressure
      ? [x * UNITS_PER_MM, y * UNITS_PER_MM]
      : [x * UNITS_PER_MM, y * UNITS_PER_MM, pressure],
  );
  const outline = getStroke(fed, {
    size: stroke.sizeMm * UNITS_PER_MM,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure,
    last: true,
  });
  return outline.map(([x, y]) => [x / UNITS_PER_MM, y / UNITS_PER_MM]);
}
