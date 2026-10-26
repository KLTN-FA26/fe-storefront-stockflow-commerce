import type {
  CustomizationTemplate,
  PrintArea,
  PrintAreaCode,
  ProductModel,
} from "../template/schema";
import { createBagSurface } from "./bag";
import { createCupSurface } from "./cup";
import type { PrintSurface, SurfaceSet } from "./types";

export { createBagSurface } from "./bag";
export { createCupSurface, cupSector, isCylindricalCup, type CupSector } from "./cup";
export type {
  FlatPoint,
  Guide,
  PrintSurface,
  SurfacePoint,
  SurfaceRegion,
  SurfaceSet,
} from "./types";

function createSurface(model: ProductModel, area: PrintArea): PrintSurface {
  switch (model.kind) {
    case "parametric-cup":
      return createCupSurface(model, area);
    case "parametric-bag":
      return createBagSurface(area);
    case "gltf":
      throw new Error(`glTF templates are not enabled yet (print area ${area.code})`);
  }
}

/** One print surface per print area, in `printAreas` order. */
export function createSurfaces(template: CustomizationTemplate): SurfaceSet {
  const byCode: Partial<Record<PrintAreaCode, PrintSurface>> = {};
  for (const area of template.printAreas) {
    byCode[area.code] = createSurface(template.model, area);
  }
  return { order: template.printAreas.map((area) => area.code), byCode };
}
