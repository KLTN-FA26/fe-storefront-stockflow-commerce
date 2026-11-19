import type { PathCmd, RectMm } from "../geometry/types";
import type { BagModel, PrintArea, PrintAreaCode } from "../template/schema";

/**
 * The glue flap a bag has when its template does not say (one saved before the field existed).
 * ⚠️ ASSUMPTION awaiting the workshop: the value the back office pre-fills and the backend fills in
 * (`BagModel.DEFAULT_GLUE_FLAP_MM`), so both ends draw the same sheet.
 */
export const DEFAULT_GLUE_FLAP_MM = 20;
/** The share of the gusset a bottom fold takes when the template does not say (same assumption). */
export const DEFAULT_BOTTOM_FOLD_SHARE = 0.6;

/** The sides of a bag in the order they lie on the sheet, after the glue flap. */
export const BAG_SIDES = ["FRONT", "RIGHT", "BACK", "LEFT"] as const satisfies PrintAreaCode[];
export type BagSide = (typeof BAG_SIDES)[number];

/** Millimetres to hundredths, half up, as the backend's `round2` and the template's columns keep them. */
const round2 = (mm: number) => Math.round(mm * 100) / 100;

/** `round2(0.6 × gusset)`: the bottom fold of a bag whose template does not say. */
export const defaultBottomFoldMm = (gussetMm: number) =>
  round2(DEFAULT_BOTTOM_FOLD_SHARE * gussetMm);

/**
 * A paper bag's print file as the workshop prints it: one flat sheet, die-cut, folded into a tube,
 * glued along its glue flap and folded at the bottom (spec 2026-11-18 §3). The customer still
 * designs each side on its own surface; the print file lays the four sides onto this sheet. Figure
 * for figure the backend's `BagSheet`, which checks and stamps the file against the same numbers.
 *
 * Sheet coordinates are mm from the trim's top-left, y down. With `P = round2(H) − round2(T)`:
 * the trim is `Wt = G + 2W + 2g` × `Ht = T + P + B`; the bleed box `(Wt + 2b) × (Ht + 2b)` with the
 * trim at `(b, b)`; the sides FRONT `(G, T)`, RIGHT `(G + W, T)`, BACK `(G + W + g, T)`,
 * LEFT `(G + 2W + g, T)`.
 */
export type BagSheet = {
  glueFlapMm: number;
  widthMm: number;
  gussetMm: number;
  topFoldMm: number;
  /** `P`: the printed height of a side. */
  printedHeightMm: number;
  bottomFoldMm: number;
  /** `b`: the largest bleed of the four print areas. */
  bleedMm: number;
  trimWidthMm: number;
  trimHeightMm: number;
  /** The template gave no glue flap or bottom fold: the defaults stand in (an assumption). */
  assumed: boolean;
  /** Each side's trim on the sheet, from the trim's top-left. */
  sides: Record<BagSide, RectMm>;
  /** Folds as distances from the trim's left (vertical) or top (horizontal) edge. */
  verticalFolds: number[];
  horizontalFolds: number[];
};

/** The sheet of `model`, whose sides are `areas` (a bag's FRONT, BACK, LEFT and RIGHT). */
export function bagSheet(model: BagModel, areas: readonly PrintArea[]): BagSheet {
  const G = model.glueFlapMm ?? DEFAULT_GLUE_FLAP_MM;
  const B = model.bottomFoldMm ?? defaultBottomFoldMm(model.gussetMm);
  const { widthMm: W, gussetMm: g, topFoldMm: T } = model;
  const P = round2(model.heightMm) - round2(T);
  const bleed = areas.reduce((most, area) => Math.max(most, area.bleedMm), 0);
  const side = (x: number, width: number): RectMm => ({ x, y: T, width, height: P });
  return {
    glueFlapMm: G,
    widthMm: W,
    gussetMm: g,
    topFoldMm: T,
    printedHeightMm: P,
    bottomFoldMm: B,
    bleedMm: bleed,
    trimWidthMm: G + 2 * W + 2 * g,
    trimHeightMm: T + P + B,
    assumed: model.glueFlapMm === undefined || model.bottomFoldMm === undefined,
    sides: {
      FRONT: side(G, W),
      RIGHT: side(G + W, g),
      BACK: side(G + W + g, W),
      LEFT: side(G + 2 * W + g, g),
    },
    verticalFolds: [G, G + W, G + W + g / 2, G + W + g, G + 2 * W + g, G + 2 * W + 1.5 * g],
    horizontalFolds: [T, T + P],
  };
}

/** The bleed box of the sheet: the print file's page (BleedBox), in mm. */
export const sheetFlatSize = (sheet: BagSheet) => ({
  width: sheet.trimWidthMm + 2 * sheet.bleedMm,
  height: sheet.trimHeightMm + 2 * sheet.bleedMm,
});

/** `rect` (sheet trim mm) in the sheet's flat mm (from the bleed box's top-left). */
export const onSheet = (sheet: BagSheet, rect: RectMm): RectMm => ({
  ...rect,
  x: rect.x + sheet.bleedMm,
  y: rect.y + sheet.bleedMm,
});

/** A rectangle as a closed path. */
export function rectPath({ x, y, width, height }: RectMm): PathCmd[] {
  return [
    { c: "M", x, y },
    { c: "L", x: x + width, y },
    { c: "L", x: x + width, y: y + height },
    { c: "L", x, y: y + height },
    { c: "Z" },
  ];
}

/** The die line (the trim rectangle) and the folds, as paths in the sheet's flat mm. */
export function sheetLines(sheet: BagSheet): { cut: PathCmd[]; folds: PathCmd[][] } {
  const b = sheet.bleedMm;
  const { trimWidthMm: w, trimHeightMm: h } = sheet;
  const line = (x0: number, y0: number, x1: number, y1: number): PathCmd[] => [
    { c: "M", x: b + x0, y: b + y0 },
    { c: "L", x: b + x1, y: b + y1 },
  ];
  return {
    cut: rectPath({ x: b, y: b, width: w, height: h }),
    folds: [
      ...sheet.verticalFolds.map((x) => line(x, 0, x, h)),
      ...sheet.horizontalFolds.map((y) => line(0, y, w, y)),
    ],
  };
}
