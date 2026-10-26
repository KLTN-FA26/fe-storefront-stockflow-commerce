import type { PrintArea } from "../template/schema";
import { createRectSurface } from "./rect";
import type { PrintSurface } from "./types";

/** A bag face: `u = x`, `v = y` from the trim's top-left; gussets get a centre crease guide. */
export function createBagSurface(area: PrintArea): PrintSurface {
  return createRectSurface({
    code: area.code,
    widthMm: area.widthMm,
    heightMm: area.heightMm,
    bleedMm: area.bleedMm,
    safeMarginMm: area.safeMarginMm,
    vOffsetMm: 0,
    seamMm: 0,
    crease: area.code === "LEFT" || area.code === "RIGHT",
  });
}
