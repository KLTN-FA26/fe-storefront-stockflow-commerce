import {
  BufferGeometry,
  CircleGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  TorusGeometry,
  Vector2,
} from "three";

import { cupSector, type PrintSurface } from "../surfaces";
import type { CupModel } from "../template/schema";

/**
 * The cup as separate meshes so the viewer can give each its own material (scene units = mm,
 * axis +Y, base at y = 0, front faces +Z).
 */
export type CupGeometry = {
  /** The printed band only (`surface.vRange`): its UVs are the dieline texture coordinates. */
  body: BufferGeometry;
  /** The unprinted outer wall above and below the band, with plain 0..1 UVs. */
  wall: BufferGeometry;
  /** The rolled lip round the top edge. */
  rim: BufferGeometry;
  /** The base, facing down. */
  bottom: BufferGeometry;
  /** The inner wall and floor, wound inwards so a front-face material shows them from inside. */
  inner: BufferGeometry;
};

export type CupGeometryOptions = { radialSegments?: number; heightSegments?: number };

const DEFAULT_RADIAL_SEGMENTS = 128;
const DEFAULT_HEIGHT_SEGMENTS = 16;
/** Paper thickness: the inner wall sits this far inside the outer wall. */
const WALL_MM = 0.6;
const RIM_TUBE_SEGMENTS = 8;
/** A wall strip shorter than this (the band starts at the rim or ends at the base) is dropped. */
const MIN_STRIP_MM = 1e-6;
const TAU = Math.PI * 2;

/** One horizontal circle of the frustum; `uv` gives the texture coordinate at axis angle `alpha`. */
type Ring = { y: number; radius: number; uv: (alpha: number) => [number, number] };

/**
 * Revolves strips of rings (each listed from the top down) about the Y axis. The axis angle α runs
 * from 0 (at −Z, where the seam is) through π (facing +Z) to 2π, increasing towards +X as seen from
 * the front, so a texture whose u grows with α reads left to right. Rings are `radialSegments + 1`
 * vertices wide (the first and last coincide) and `lean` is the wall's outward normal in the
 * (radial, y) plane.
 */
function revolveStrips(
  strips: readonly (readonly Ring[])[],
  radialSegments: number,
  lean: { radial: number; y: number },
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = radialSegments + 1;

  for (const rings of strips) {
    const first = positions.length / 3;
    for (const ring of rings) {
      for (let i = 0; i <= radialSegments; i++) {
        const alpha = (i / radialSegments) * TAU;
        const [sin, cos] = [Math.sin(alpha), Math.cos(alpha)];
        positions.push(-ring.radius * sin, ring.y, -ring.radius * cos);
        normals.push(-lean.radial * sin, lean.y, -lean.radial * cos);
        uvs.push(...ring.uv(alpha));
      }
    }
    for (let j = 0; j < rings.length - 1; j++) {
      for (let i = 0; i < radialSegments; i++) {
        // Counter-clockwise seen from outside: a (top left), b (below it), c (top right), d.
        const a = first + j * stride + i;
        const [b, c] = [a + stride, a + 1];
        indices.push(a, b, c, b, b + 1, c);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Width of the body's print at the surface, i.e. the `u` that α = 2π maps to (the glue flap lies beyond). */
function printedWidthMm(model: CupModel, surface: PrintSurface): number {
  if (surface.kind === "rect") return Math.PI * model.topDiameterMm;
  const sector = cupSector(model);
  return sector.sweepRad * sector.midRadiusMm;
}

/**
 * Builds the cup meshes. A body vertex at axis angle α and slant distance `v` from the rim takes
 * the texture coordinate of the dieline point `(u = α / 2π · printed width, v)`, so the 3D print
 * is the unrolled 2D art wrapped back onto the cone.
 */
export function buildCupGeometry(
  model: CupModel,
  surface: PrintSurface,
  opts: CupGeometryOptions = {},
): CupGeometry {
  const radialSegments = opts.radialSegments ?? DEFAULT_RADIAL_SEGMENTS;
  const heightSegments = opts.heightSegments ?? DEFAULT_HEIGHT_SEGMENTS;
  const topRadius = model.topDiameterMm / 2;
  const bottomRadius = model.bottomDiameterMm / 2;
  const slantMm = Math.hypot(model.heightMm, topRadius - bottomRadius);
  const lean = { radial: model.heightMm / slantMm, y: (bottomRadius - topRadius) / slantMm };

  /** The wall at slant distance `v` below the rim. */
  const wallAt = (v: number) => {
    const t = v / slantMm;
    return { y: model.heightMm * (1 - t), radius: topRadius + (bottomRadius - topRadius) * t };
  };

  const widthMm = printedWidthMm(model, surface);
  const [bandTop, bandBottom] = surface.vRange;
  const bodyRings = Array.from({ length: heightSegments + 1 }, (_, j): Ring => {
    const v = bandTop + ((bandBottom - bandTop) * j) / heightSegments;
    return {
      ...wallAt(v),
      uv: (alpha) => {
        const flat = surface.toFlat((alpha / TAU) * widthMm, v);
        return surface.uvOf(flat.x, flat.y);
      },
    };
  });

  const unprinted: [number, number][] = [
    [0, bandTop],
    [bandBottom, slantMm],
  ];
  const wallStrips = unprinted
    .filter(([from, to]) => to - from > MIN_STRIP_MM)
    .map(([from, to]) =>
      [from, to].map((v, k): Ring => ({ ...wallAt(v), uv: (alpha) => [alpha / TAU, 1 - k] })),
    );

  const rim = new TorusGeometry(
    topRadius,
    Math.max(model.rimMm, WALL_MM) / 2,
    RIM_TUBE_SEGMENTS,
    radialSegments,
  );
  rim.rotateX(Math.PI / 2);
  rim.translate(0, model.heightMm, 0);

  const bottom = new CircleGeometry(bottomRadius, radialSegments);
  bottom.rotateX(Math.PI / 2);

  // Lathe points listed top-down give inward-facing normals: inner wall, then the floor.
  const inner = new LatheGeometry(
    [
      new Vector2(topRadius - WALL_MM, model.heightMm),
      new Vector2(bottomRadius - WALL_MM, WALL_MM),
      new Vector2(0, WALL_MM),
    ],
    radialSegments,
  );

  return {
    body: revolveStrips([bodyRings], radialSegments, lean),
    wall: revolveStrips(wallStrips, radialSegments, lean),
    rim,
    bottom,
    inner,
  };
}
