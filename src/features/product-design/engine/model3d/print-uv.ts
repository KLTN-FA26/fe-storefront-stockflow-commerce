import { BufferGeometry, Float32BufferAttribute, Matrix3, type Mesh, Vector3 } from "three";

import type { BagModel, CupModel } from "../template/schema";
import { printedWidthMm } from "../viewer3d/cup-mesh";
import type { PrintTarget } from "../viewer3d/scene-parts";

const TAU = Math.PI * 2;

type Axis = "x" | "z";

/**
 * For each bag face: the plan axis its width runs along and whether `s` (0 = left seen from
 * outside) grows with that axis. Mirrors `segmentsOf` in `viewer3d/bag-mesh.ts`: the front runs
 * towards +X, the right face towards −Z, the back towards −X and the left face towards +Z.
 */
const BAG_FACES: Record<string, { axis: Axis; rising: boolean; outward: Vector3 }> = {
  FRONT: { axis: "x", rising: true, outward: new Vector3(0, 0, 1) },
  RIGHT: { axis: "z", rising: false, outward: new Vector3(1, 0, 0) },
  BACK: { axis: "x", rising: false, outward: new Vector3(0, 0, -1) },
  LEFT: { axis: "z", rising: true, outward: new Vector3(-1, 0, 0) },
};

/** A triangle corner in world space. */
type Corner = { p: Vector3; n: Vector3 };
/** A corner with the cup's axis angle it takes (0 or 2π on the seam cut). */
type AngledCorner = Corner & { alpha: number };

/** Triangles thinner than this (mm²) left by a cut are dropped. */
const MIN_AREA_MM2 = 1e-6;

const areaOf = (a: Vector3, b: Vector3, c: Vector3) =>
  new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).length() / 2;

/**
 * Makes a triangle wind outward (swapping two corners when it faces inward) and its normals agree
 * (negating those that point inward). `outward` is the direction the surface faces at the
 * triangle; a triangle with no direction or no area is left alone.
 */
function faceOutward(
  tri: [Corner, Corner, Corner],
  outward: Vector3 | null,
): [Corner, Corner, Corner] {
  if (!outward) return tri;
  const [a, b, c] = tri;
  const geometric = new Vector3().subVectors(b.p, a.p).cross(new Vector3().subVectors(c.p, a.p));
  const ordered: [Corner, Corner, Corner] = geometric.dot(outward) < 0 ? [a, c, b] : [a, b, c];
  const fixed = ordered.map((corner) =>
    corner.n.dot(outward) < 0 ? { p: corner.p, n: corner.n.clone().negate() } : corner,
  );
  return [fixed[0]!, fixed[1]!, fixed[2]!];
}

/**
 * The cup triangle as one or two angled triangles. One that crosses the seam half-plane (x = 0,
 * z < 0, where α is 0 and 2π) is cut there: the part with small α keeps α and its cut corners take
 * 0, the part with α just below 2π takes 2π on its cut corners, so both map inside the printed
 * width. A corner exactly on the seam joins the side of its triangle.
 */
function splitAtSeam(tri: readonly Corner[]): AngledCorner[][] {
  const alphas = tri.map((c) => axisAngle(c.p));
  const max = Math.max(...alphas);
  const corners = tri.map((c, i): AngledCorner => ({ ...c, alpha: alphas[i]! }));
  if (max - Math.min(...alphas) <= Math.PI) return [corners];

  const low = alphas.map((alpha) => alpha < max - Math.PI);
  // Signed distance to the seam plane, never on the wrong side of it for its own region.
  const side = (i: number) => (low[i] ? Math.min(tri[i]!.p.x, 0) : Math.max(tri[i]!.p.x, 0));
  const cut = (i: number, j: number, alpha: number): AngledCorner => {
    const [da, db] = [side(i), side(j)];
    const t = da === db ? 0 : Math.min(1, Math.max(0, da / (da - db)));
    const [a, b] = [tri[i]!, tri[j]!];
    const n = a.n.clone().lerp(b.n, t);
    return {
      p: a.p.clone().lerp(b.p, t),
      n: n.lengthSq() > 0 ? n.normalize() : a.n.clone(),
      alpha,
    };
  };

  return [true, false].flatMap((isLow) => {
    const polygon: AngledCorner[] = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if (low[i] === isLow) polygon.push(corners[i]!);
      if (low[i] !== low[j]) polygon.push(cut(i, j, isLow ? 0 : TAU));
    }
    const fan = polygon.slice(1, -1).map((corner, k) => [polygon[0]!, corner, polygon[k + 2]!]);
    return fan.filter(([a, b, c]) => areaOf(a!.p, b!.p, c!.p) > MIN_AREA_MM2);
  });
}

/** `atan2(-x, -z)` in [0, 2π): 0 at −Z (where the cup's seam is), π at +Z, growing towards +X seen from the front. */
function axisAngle(p: Vector3): number {
  const alpha = Math.atan2(-p.x, -p.z);
  return alpha < 0 ? alpha + TAU : alpha;
}

/**
 * A print mesh from a loaded model, given the texture coordinates the studio needs: it ignores the
 * UVs of the file and computes them from each vertex's position with the same formula the
 * parametric meshes use (`buildCupGeometry` / `buildBagGeometry`), so the artwork lands where the
 * 2D dieline says.
 *
 * The mesh's world transform (`matrixWorld`, parents included) is applied, so the returned
 * geometry is in world space (mm after the loader's scaling): put it on a mesh with an identity
 * transform. The cup's axis is the world Y axis through the origin; its front faces +Z. The
 * result is non-indexed and has `position`, `normal` (the file's, or smooth ones computed when it
 * has none) and `uv`.
 *
 * The result always faces outward (away from the Y axis for a cup; FRONT +Z, BACK −Z, RIGHT +X,
 * LEFT −X for a bag): a triangle that winds inward, by the file or a mirrored parent, has two
 * corners swapped, and normals that point inward are negated. A cup triangle that crosses the seam
 * (x = 0, z < 0) is cut there into two, one ending at α = 0 and one at α = 2π, so no UV leaves
 * `[0, printed width]` and the whole strip appears on the model. Limit: a triangle spanning more
 * than π without touching the seam is not understood (a body needs at least a few sides).
 *
 * The UV is a function of the vertex's ABSOLUTE world position against the template `model`, never
 * of the mesh's own extent: a vertex at the same place gets the same UV as on the parametric mesh,
 * so a mesh shorter or longer than the band is not rescaled, and vertices outside the band map
 * outside the printed area (no clamping).
 *
 * Cup: `α = atan2(−x, −z)`, `v = slant · (1 − y / heightMm)` (the relation `wallAt` in
 * `cup-mesh.ts` inverts), then `uvOf(toFlat(α/2π · printed width, v))`. Bag: `s` across the face
 * and `t = (panelHeight − y) / panelHeight`, with the face spans of `segmentsOf` in `bag-mesh.ts`
 * (FRONT x from −w/2, RIGHT z falling from g/2, BACK x falling from w/2, LEFT z from −g/2), then
 * `uvOf(toFlat(u0 + (u1 − u0)s, v0 + (v1 − v0)t))`.
 */
export function printGeometry(
  mesh: Mesh,
  target: PrintTarget,
  model: CupModel | BagModel,
): BufferGeometry {
  const { code, surface } = target;
  if (model.kind === "parametric-cup" ? code !== "BODY" : !(code in BAG_FACES)) {
    throw new Error(`Print area ${code} does not exist on a ${model.kind} model`);
  }

  const source = mesh.geometry;
  const positionAttr = source.getAttribute("position");
  if (!positionAttr || positionAttr.itemSize < 3) {
    throw new Error("The print mesh has no position attribute");
  }

  // Smooth normals for a file without them, computed in the mesh's own space before de-indexing.
  const withNormals = source.getAttribute("normal") ? source : source.clone();
  if (withNormals !== source) withNormals.computeVertexNormals();
  const normalAttr = withNormals.getAttribute("normal");

  mesh.updateWorldMatrix(true, false);
  const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrixWorld);
  const world = Array.from({ length: positionAttr.count }, (_, i) =>
    new Vector3().fromBufferAttribute(positionAttr, i).applyMatrix4(mesh.matrixWorld),
  );
  const worldNormals = Array.from({ length: normalAttr.count }, (_, i) =>
    new Vector3().fromBufferAttribute(normalAttr, i).applyMatrix3(normalMatrix).normalize(),
  );

  const index = source.getIndex();
  const corners = index ? Array.from(index.array) : world.map((_, i) => i);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const toUv = (u: number, v: number) => {
    const flat = surface.toFlat(u, v);
    return surface.uvOf(flat.x, flat.y);
  };

  // The UV of a vertex, given the unwrapped axis angle when this is a cup. Always from the
  // vertex's absolute world position against the model, never from the mesh's own extent.
  let uvOfVertex: (p: Vector3, alpha: number) => [number, number];
  if (model.kind === "parametric-cup") {
    const widthMm = printedWidthMm(model, surface);
    const slantMm = Math.hypot(model.heightMm, (model.topDiameterMm - model.bottomDiameterMm) / 2);
    uvOfVertex = (p, alpha) => toUv((alpha / TAU) * widthMm, slantMm * (1 - p.y / model.heightMm));
  } else {
    const { axis, rising } = BAG_FACES[code]!;
    const [u0, u1] = surface.uRange;
    const [v0, v1] = surface.vRange;
    const [hw, hg] = [model.widthMm / 2, model.gussetMm / 2];
    const panelHeight = model.heightMm - model.topFoldMm;
    // Plan span of the face, as in `segmentsOf`: start and length along its axis.
    const span =
      axis === "x" ? { from: -hw, length: model.widthMm } : { from: -hg, length: model.gussetMm };
    uvOfVertex = (p) => {
      const along = (p[axis] - span.from) / span.length;
      const s = rising ? along : 1 - along;
      const t = (panelHeight - p.y) / panelHeight;
      return toUv(u0 + (u1 - u0) * s, v0 + (v1 - v0) * t);
    };
  }

  const bagOutward = model.kind === "parametric-cup" ? null : BAG_FACES[code]!.outward;
  for (let k = 0; k + 2 < corners.length; k += 3) {
    const raw = [corners[k]!, corners[k + 1]!, corners[k + 2]!].map((vertex): Corner => ({
      p: world[vertex]!,
      n: worldNormals[vertex]!,
    }));
    const [a, b, c] = raw as [Corner, Corner, Corner];
    // A cup faces away from the Y axis at the triangle's centre; a bag face along its own direction.
    const centre = new Vector3(a.p.x + b.p.x + c.p.x, 0, a.p.z + b.p.z + c.p.z);
    const outward = bagOutward ?? (centre.lengthSq() > 1e-9 ? centre : null);
    const oriented = faceOutward([a, b, c], outward);
    const pieces: AngledCorner[][] =
      model.kind === "parametric-cup"
        ? splitAtSeam(oriented)
        : [oriented.map((corner) => ({ ...corner, alpha: 0 }))];
    for (const piece of pieces) {
      for (const { p, n, alpha } of piece) {
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
        uvs.push(...uvOfVertex(p, alpha));
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  return geometry;
}
