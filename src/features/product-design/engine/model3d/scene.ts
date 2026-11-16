import { BackSide, DoubleSide, FrontSide, Group, Mesh, type Material } from "three";

import type { SurfaceSet } from "../surfaces";
import type { BagModel, CupModel, PrintAreaCode } from "../template/schema";
import { createMaterials, type ProductMaterials } from "../viewer3d/materials";
import type { ModelScene, PrintMesh, PrintTarget } from "../viewer3d/scene-parts";
import { disposeMaterials, materialsOf, texturesOf } from "./dispose";
import { findPrintObjects, type PrintObject } from "./find-print-meshes";
import { Model3dError } from "./load";
import { printGeometry } from "./print-uv";
import type { Model3dRef } from "./schema";

type Model = CupModel | BagModel;
type Mapped = PrintTarget & { name: string; mesh: Mesh };

/**
 * The mesh of one print area: the object the ref names, with exactly one mesh below it. More than
 * one such object is `MESH_MISSING`: the file would show the second one over the artwork. A name on
 * a parent group that holds other print objects (`problem: "parent"`) is only a report, not a
 * second object: what is below it is looked at on its own.
 */
function meshOf(code: PrintAreaCode, meshName: string, objects: PrintObject[]): Mesh {
  const named = objects.filter((o) => o.printAreaCode === code && o.name === meshName);
  const objectsOfName = named.filter((o) => o.problem !== "parent");
  if (objectsOfName.length > 1) {
    throw new Model3dError(
      "MESH_MISSING",
      `File .glb có ${objectsOfName.length} đối tượng cùng tên "${meshName}" cho vùng in ${code}: mỗi vùng in phải có đúng một`,
    );
  }
  const usable = named.find((o) => o.mesh);
  if (usable?.mesh) return usable.mesh;
  if (named.some((o) => o.problem === "multi")) {
    throw new Model3dError(
      "MESH_MISSING",
      `Phần in "${meshName}" của vùng in ${code} có nhiều mesh (nhiều vật liệu): phần in phải dùng một vật liệu`,
    );
  }
  throw new Model3dError(
    "MESH_MISSING",
    named.length > 0
      ? `Phần in "${meshName}" của vùng in ${code} không có mesh nào`
      : `File .glb không có mesh "${meshName}" cho vùng in ${code}`,
  );
}

/** Finds the mesh of every print area of the template; a print area it cannot find is `MESH_MISSING`. */
function resolveMapped(root: Group, ref: Model3dRef, surfaces: SurfaceSet): Mapped[] {
  const objects = findPrintObjects(root);
  return surfaces.order.map((code) => {
    const entry = ref.surfaces.find((s) => s.printAreaCode === code);
    if (!entry) {
      throw new Model3dError("MESH_MISSING", `Model 3D chưa gán mesh cho vùng in ${code}`);
    }
    const surface = surfaces.byCode[code];
    if (!surface) {
      throw new Model3dError("INVALID_MODEL", `Mẫu in không có vùng in ${code}`);
    }
    return { code, surface, name: entry.meshName, mesh: meshOf(code, entry.meshName, objects) };
  });
}

/** Files' own materials get freed with the scene's bundle: the viewer already calls `materials.dispose()`. */
function withFileMaterials(
  materials: ProductMaterials,
  fileMaterials: Set<Material>,
): ProductMaterials {
  return {
    ...materials,
    dispose() {
      materials.dispose();
      disposeMaterials(fileMaterials);
    },
  };
}

/**
 * Turns a loaded `.glb` (`loadGlb`, in mm) into the scene the viewer shows, the same shape that
 * `buildModelScene` gives for the parametric model of `model` (the template's).
 *
 * The storefront only displays: it does not measure the file or compare it with the template (that
 * is checked at upload, in the back-office). It requires, for every print area of the template, a
 * mapped object in the file that holds exactly one mesh (`MESH_MISSING`, naming the print area),
 * and a mesh `printGeometry` can map (`INVALID_MODEL`). Every `printGeometry` is computed before
 * the loaded tree is touched, so nothing is changed when a check fails.
 *
 * Ownership: when this throws, the caller still owns `root` and must free it (`disposeGlbTree`); on
 * success the scene owns it (`disposeGlbScene`, or `materials.dispose()` plus the geometries).
 * Children of a mapped print node are kept: they are re-attached to its parent, in place.
 *
 * Result: `group` holds the loaded tree as it is (rim, bottom, inner, ... keep the file's materials
 * and their place) plus one new mesh per mapped print mesh, which carries the geometry of
 * `printGeometry` (world space, so on an identity transform; the file's own mesh of that name is
 * taken out and its geometry and material freed). Print meshes start on `materials.base` (a printed
 * bag face on `onlySide(FrontSide)` with an `-inside` twin, as `buildModelScene` does); the viewer
 * gives them the print material when the artwork arrives. `meshes` lists every mesh of the group,
 * the twins included; `printMeshes` only the new ones; `materials` is `createMaterials` for the
 * template's stock, whose `dispose()` also frees the file's own materials and textures.
 */
export function buildGlbScene(
  root: Group,
  ref: Model3dRef,
  model: Model,
  surfaces: SurfaceSet,
): ModelScene {
  const mapped = resolveMapped(root, ref, surfaces);

  const geometries = mapped.map((m) => {
    try {
      return printGeometry(m.mesh, { code: m.code, surface: m.surface }, model);
    } catch (error) {
      throw new Model3dError(
        "INVALID_MODEL",
        `Không tính được UV cho vùng in ${m.code} (${m.name}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  // ---- nothing can fail from here: swap the print meshes in ---------------------------------
  const sheet = model.kind === "parametric-bag";
  const productMaterials = createMaterials(model.material, sheet ? { side: DoubleSide } : {});
  const removed = mapped.map((m) => m.mesh);
  // A print node's own children stay in the tree, where they were in the world.
  for (const mesh of removed) {
    const parent = mesh.parent;
    if (parent) [...mesh.children].forEach((child) => parent.attach(child));
    mesh.removeFromParent();
  }

  const group = new Group();
  group.add(root);
  const printMeshes: PrintMesh[] = [];
  mapped.forEach(({ code, surface, name }, i) => {
    const geometry = geometries[i]!;
    const mesh = new Mesh(
      geometry,
      sheet ? productMaterials.onlySide(FrontSide) : productMaterials.base,
    );
    mesh.name = name;
    group.add(mesh);
    printMeshes.push({ code, surface, mesh });
    if (sheet) {
      const inside = new Mesh(geometry, productMaterials.onlySide(BackSide));
      inside.name = `${name}-inside`;
      group.add(inside);
    }
  });

  // The file's own materials: those a mesh of the file still uses; the removed meshes' are freed.
  const fileMaterials = new Set<Material>();
  root.traverse((object) => {
    if (object instanceof Mesh) materialsOf(object).forEach((m) => fileMaterials.add(m));
  });
  const keptTextures = new Set(Array.from(fileMaterials, texturesOf).flat());
  const unused = new Set<Material>();
  for (const mesh of removed) {
    mesh.geometry.dispose();
    materialsOf(mesh).forEach((m) => fileMaterials.has(m) || unused.add(m));
  }
  disposeMaterials(unused, keptTextures);

  const meshes: Mesh[] = [];
  group.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object);
  });
  return {
    group,
    meshes,
    materials: withFileMaterials(productMaterials, fileMaterials),
    printMeshes,
  };
}

/**
 * Frees what a scene from `buildGlbScene` owns: every geometry, the print and base materials, the
 * file's own materials and their textures. The artwork textures belong to the caller.
 */
export function disposeGlbScene(scene: ModelScene) {
  const geometries = new Set<Mesh["geometry"]>();
  scene.group.traverse((object) => {
    if (object instanceof Mesh) geometries.add(object.geometry);
  });
  geometries.forEach((geometry) => geometry.dispose());
  scene.materials.dispose();
  scene.group.removeFromParent();
}
