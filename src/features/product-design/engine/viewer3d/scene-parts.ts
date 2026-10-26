import {
  BackSide,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  type BufferGeometry,
  type Material,
} from "three";

import type { PrintSurface, SurfaceSet } from "../surfaces";
import type { BagModel, CupModel, PrintAreaCode } from "../template/schema";
import { buildBagGeometry } from "./bag-mesh";
import { buildCupGeometry } from "./cup-mesh";
import { createMaterials, type ProductMaterials } from "./materials";

/** The print area a mesh carries the artwork of, and the surface its UVs belong to. */
export type PrintTarget = { code: PrintAreaCode; surface: PrintSurface };
export type PrintMesh = PrintTarget & { mesh: Mesh };

/** The model as one group of meshes, all on the base material until their artwork arrives. */
export type ModelScene = {
  group: Group;
  /** Every mesh of the group, for picking (the contact shadow is added to the group later, never here). */
  meshes: Mesh[];
  materials: ProductMaterials;
  /** The meshes that take a print material (the cup body, each bag panel with a print area). */
  printMeshes: PrintMesh[];
};

/**
 * One mesh of the model; `print` says which print area's artwork it carries. A `sheet` is a
 * single-sided panel: its outside takes the (front-side) artwork and a twin shows its inside.
 */
type Part = { name: string; geometry: BufferGeometry; print?: PrintTarget; sheet?: true };

const BAG_FACES = ["FRONT", "BACK", "LEFT", "RIGHT"] as const;

function cupParts(model: CupModel, surfaces: SurfaceSet): Part[] {
  const surface = surfaces.byCode.BODY;
  if (!surface) throw new Error("A cup template needs a BODY print area");
  const { body, wall, rim, bottom, inner } = buildCupGeometry(model, surface);
  return [
    { name: "body", geometry: body, print: { code: "BODY", surface } },
    { name: "wall", geometry: wall },
    { name: "rim", geometry: rim },
    { name: "bottom", geometry: bottom },
    { name: "inner", geometry: inner },
  ];
}

function bagParts(model: BagModel, surfaces: SurfaceSet): Part[] {
  const { panels, bottom, fold, handles } = buildBagGeometry(model, surfaces);
  const faces = BAG_FACES.map((code): Part => {
    const surface = surfaces.byCode[code];
    return {
      name: `panel-${code}`,
      geometry: panels[code],
      ...(surface ? { print: { code, surface }, sheet: true as const } : {}),
    };
  });
  return [
    ...faces,
    { name: "bottom", geometry: bottom },
    { name: "fold", geometry: fold },
    ...handles.map((geometry, i): Part => ({ name: `handle-${i}`, geometry })),
  ];
}

/**
 * Builds the meshes and materials of a parametric cup or bag. Every mesh starts on the base
 * material (R4: the print material goes only to the print meshes, later, once their texture
 * exists). A bag's base is double-sided (hem, handles, bottom), but each printed panel is split
 * in two on the same geometry: the outside on a front-side stock, which the artwork replaces, and
 * an `-inside` twin on a back-side stock, so the artwork never shows mirrored on the inside and
 * a pick from inside the open mouth is never a print hit. Throws before creating anything when
 * the template lacks a surface it needs.
 */
export function buildModelScene(model: CupModel | BagModel, surfaces: SurfaceSet): ModelScene {
  const parts =
    model.kind === "parametric-cup" ? cupParts(model, surfaces) : bagParts(model, surfaces);
  const materials = createMaterials(
    model.material,
    model.kind === "parametric-bag" ? { side: DoubleSide } : {},
  );
  const group = new Group();
  const meshes: Mesh[] = [];
  const printMeshes: PrintMesh[] = [];
  const add = (name: string, geometry: BufferGeometry, material: Material) => {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    meshes.push(mesh);
    return mesh;
  };

  for (const { name, geometry, print, sheet } of parts) {
    const mesh = add(name, geometry, sheet ? materials.onlySide(FrontSide) : materials.base);
    if (print) printMeshes.push({ ...print, mesh });
    if (sheet) add(`${name}-inside`, geometry, materials.onlySide(BackSide));
  }
  return { group, meshes, materials, printMeshes };
}
