import {
  BAG_SIDES,
  bagSheet,
  mergeVectorPages,
  mmToPt,
  multiply,
  onSheet,
  printSlugLines,
  sheetFlatSize,
  sheetLines,
  translate,
  type BagModel,
  type CustomizationTemplate,
  type DesignDocument,
  type Mat2D,
  type PathCmd,
  type PrintGuide,
  type PrintJobInfo,
  type PrintPage,
  type SurfaceSet,
  type VectorPage,
} from "../../engine";
import type { ExportRenderer } from "./export-renderer";

/** `path` moved by `(dx, dy)` mm. */
function moved(path: PathCmd[], dx: number, dy: number): PathCmd[] {
  return path.map((cmd) => {
    switch (cmd.c) {
      case "M":
      case "L":
        return { ...cmd, x: cmd.x + dx, y: cmd.y + dy };
      case "A":
        return { ...cmd, cx: cmd.cx + dx, cy: cmd.cy + dy };
      case "Z":
        return cmd;
    }
  });
}

/**
 * A paper bag's print file page: its four sides laid onto the flat sheet the workshop prints, die-cuts,
 * folds and glues (spec 2026-11-18 §3, the backend's `BagSheet`). Each side is recorded in the
 * sheet's coordinates (vectors where it can, else its raster), clipped to its trim plus the sheet's
 * bleed below it (into the bottom fold) and, on LEFT, past the outer die line; the glue flap, top
 * and bottom folds stay unprinted. The die line is the trim rectangle; the folds and each side's
 * safe area go on the guide layer.
 */
export async function bagSheetPage(input: {
  model: BagModel;
  template: CustomizationTemplate;
  surfaces: SurfaceSet;
  document: DesignDocument;
  renderer: ExportRenderer;
  pxPerMm: number;
  info: PrintJobInfo;
  onSide?: (index: number, count: number) => Promise<void>;
}): Promise<PrintPage> {
  const { model, template, surfaces, document, renderer, pxPerMm, info } = input;
  const sheet = bagSheet(model, template.printAreas);
  const { width: widthMm, height: heightMm } = sheetFlatSize(sheet);
  const k = mmToPt(1) / pxPerMm;
  const sheetBase: Mat2D = [k, 0, 0, -k, 0, mmToPt(heightMm)];
  const names = new Map(template.printAreas.map((area) => [area.code, area.name]));

  const parts: VectorPage[] = [];
  const safeGuides: PrintGuide[] = [];
  for (const [i, code] of BAG_SIDES.entries()) {
    await input.onSide?.(i, BAG_SIDES.length);
    const surface = surfaces.byCode[code];
    if (!surface) throw new Error(`A bag's sheet needs its ${code} side`);
    const side = onSheet(sheet, sheet.sides[code]);
    // The side's own flat origin (its bleed box's top-left) on the sheet's flat mm.
    const dx = side.x - surface.bleedMm;
    const dy = side.y - surface.bleedMm;
    const base = multiply(sheetBase, translate(dx * pxPerMm, dy * pxPerMm));
    const clipMm = {
      x: surface.bleedMm,
      y: surface.bleedMm,
      width: side.width + (code === "LEFT" ? sheet.bleedMm : 0),
      height: side.height + sheet.bleedMm,
    };
    const layerPrefix = names.get(code) ?? code;
    parts.push(
      await renderer.printSheetFace(code, document, pxPerMm, { base, clipMm, layerPrefix }),
    );
    safeGuides.push({ kind: "safe", path: moved(surface.outline("safe"), dx, dy) });
  }

  const { cut, folds } = sheetLines(sheet);
  const guides: PrintGuide[] = [
    ...folds.map((path) => ({ kind: "crease" as const, path })),
    ...safeGuides,
  ];
  const slug = await renderer.printSlug(
    printSlugLines(info, {
      code: "FRONT",
      name: "Tấm trải phẳng",
      page: 1,
      pages: 1,
      trimMm: { width: sheet.trimWidthMm, height: sheet.trimHeightMm },
      bleedMm: sheet.bleedMm,
      guideKinds: guides.map((guide) => guide.kind),
      sheet: {
        glueFlapMm: sheet.glueFlapMm,
        topFoldMm: sheet.topFoldMm,
        bottomFoldMm: sheet.bottomFoldMm,
        assumed: sheet.assumed,
      },
    }),
    widthMm,
    pxPerMm,
  );
  return {
    code: "FRONT",
    widthMm,
    heightMm,
    bands: [],
    vector: mergeVectorPages(parts),
    cutPath: cut,
    guides,
    slug,
  };
}
