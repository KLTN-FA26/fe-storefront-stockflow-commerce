import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  PlaneGeometry,
  TubeGeometry,
  Vector3,
} from "three";

import type { PrintSurface, SurfaceSet } from "../surfaces";
import type { BagModel } from "../template/schema";

type FaceCode = "FRONT" | "BACK" | "LEFT" | "RIGHT";

/**
 * The bag as separate meshes (scene units = mm, base at y = 0, mouth at `heightMm`, front faces
 * +Z, width along X and gusset depth along Z).
 */
export type BagGeometry = {
  /** Printed faces, each `heightMm − topFoldMm` tall. A face without a print area gets plain 0..1 UVs. */
  panels: Record<FaceCode, BufferGeometry>;
  bottom: BufferGeometry;
  /** The unprinted top hem above the panels, all the way round. */
  fold: BufferGeometry;
  /** One loop on each of the front and back faces; empty for a bag without handles. */
  handles: BufferGeometry[];
};

const FACES: readonly FaceCode[] = ["FRONT", "BACK", "LEFT", "RIGHT"];
/** How far a gusset's centre crease is pushed in, as a fraction of the gusset depth. */
const CREASE_DEPTH_RATIO = 0.1;
/** Handle loop proportions, as fractions of the bag width. */
const HANDLE_SPAN_RATIO = 0.4;
const HANDLE_RISE_RATIO = 0.35;
/** Handles hang this far inside the front/back faces. */
const HANDLE_INSET_MM = 2;
const TWISTED_RADIUS_MM = 2;
const FLAT_THICKNESS_MM = 1;
const FLAT_WIDTH_MM = 15;
const HANDLE_TUBE_SEGMENTS = 48;
const HANDLE_RADIAL_SEGMENTS = 8;

/** A vertical strip of wall between two plan points; `s0`/`s1` are its share of the face width. */
type Segment = { x0: number; z0: number; x1: number; z1: number; s0: number; s1: number };

/**
 * Plan outline of a face, listed so the print reads left to right seen from outside: the front
 * runs towards +X, the right face towards −Z, the back towards −X, the left face towards +Z.
 * Gusset faces pass through a crease point pushed in from the box.
 */
function segmentsOf(code: FaceCode, model: BagModel): Segment[] {
  const [hw, hg] = [model.widthMm / 2, model.gussetMm / 2];
  const dent = model.gussetMm * CREASE_DEPTH_RATIO;
  const outline: Record<FaceCode, [number, number][]> = {
    FRONT: [
      [-hw, hg],
      [hw, hg],
    ],
    RIGHT: [
      [hw, hg],
      [hw - dent, 0],
      [hw, -hg],
    ],
    BACK: [
      [hw, -hg],
      [-hw, -hg],
    ],
    LEFT: [
      [-hw, -hg],
      [-hw + dent, 0],
      [-hw, hg],
    ],
  };
  const points = outline[code];
  return points.flatMap(([x0, z0], k) => {
    const next = points[k + 1];
    if (!next) return [];
    const [s0, s1] = [k / (points.length - 1), (k + 1) / (points.length - 1)];
    return [{ x0, z0, x1: next[0], z1: next[1], s0, s1 }];
  });
}

/**
 * One quad per segment between heights `yBottom` and `yTop`, each with its own four vertices so
 * a crease stays sharp. `uvAt(s, t)` gives the texture coordinate at share `s` of the face width
 * and `t` down the height (0 = top, 1 = bottom).
 */
function quadsGeometry(
  segments: readonly Segment[],
  yBottom: number,
  yTop: number,
  uvAt: (s: number, t: number) => [number, number],
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const { x0, z0, x1, z1, s0, s1 } of segments) {
    const first = positions.length / 3;
    // Outward normal = along × up (the run is left to right seen from outside).
    const length = Math.hypot(x1 - x0, z1 - z0);
    const normal = [-(z1 - z0) / length, 0, (x1 - x0) / length];
    // Vertices a (top left), b (bottom left), c (top right), d (bottom right).
    const corners: [x: number, y: number, z: number, s: number, t: number][] = [
      [x0, yTop, z0, s0, 0],
      [x0, yBottom, z0, s0, 1],
      [x1, yTop, z1, s1, 0],
      [x1, yBottom, z1, s1, 1],
    ];
    for (const [x, y, z, s, t] of corners) {
      positions.push(x, y, z);
      normals.push(...normal);
      uvs.push(...uvAt(s, t));
    }
    indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

const plainUv = (s: number, t: number): [number, number] => [s, 1 - t];

/** Maps the face's trim box (u across, v down) into the surface's dieline texture. */
function dielineUv(surface: PrintSurface): (s: number, t: number) => [number, number] {
  const [u0, u1] = surface.uRange;
  const [v0, v1] = surface.vRange;
  return (s, t) => {
    const flat = surface.toFlat(u0 + (u1 - u0) * s, v0 + (v1 - v0) * t);
    return surface.uvOf(flat.x, flat.y);
  };
}

/** A loop standing up from the mouth, in the plane `z`; round cord when twisted, a ribbon when flat. */
function handleGeometry(model: BagModel, z: number): BufferGeometry {
  const half = (model.widthMm * HANDLE_SPAN_RATIO) / 2;
  const rise = model.widthMm * HANDLE_RISE_RATIO;
  const mouth = model.heightMm;
  const anchor = mouth - model.topFoldMm / 2;
  const curve = new CatmullRomCurve3([
    new Vector3(-half, anchor, 0),
    new Vector3(-half, mouth + rise * 0.25, 0),
    new Vector3(-half * 0.85, mouth + rise * 0.8, 0),
    new Vector3(0, mouth + rise, 0),
    new Vector3(half * 0.85, mouth + rise * 0.8, 0),
    new Vector3(half, mouth + rise * 0.25, 0),
    new Vector3(half, anchor, 0),
  ]);
  const flat = model.handle === "flat";
  const geometry = new TubeGeometry(
    curve,
    HANDLE_TUBE_SEGMENTS,
    flat ? FLAT_THICKNESS_MM / 2 : TWISTED_RADIUS_MM,
    HANDLE_RADIAL_SEGMENTS,
    false,
  );
  // A ribbon is the round tube stretched across the loop's plane, before it moves to its face.
  if (flat) geometry.scale(1, 1, FLAT_WIDTH_MM / FLAT_THICKNESS_MM);
  geometry.translate(0, 0, z);
  return geometry;
}

/**
 * Builds the bag meshes. Each panel's UVs map its trim box into its surface's dieline texture
 * through `uvOf`, so the 3D print matches the 2D editor and the print output.
 */
export function buildBagGeometry(model: BagModel, surfaces: SurfaceSet): BagGeometry {
  const panelHeight = model.heightMm - model.topFoldMm;

  const panelFor = (code: FaceCode) => {
    const surface = surfaces.byCode[code];
    return quadsGeometry(
      segmentsOf(code, model),
      0,
      panelHeight,
      surface ? dielineUv(surface) : plainUv,
    );
  };

  const bottom = new PlaneGeometry(model.widthMm, model.gussetMm);
  bottom.rotateX(Math.PI / 2);

  const handleZ = model.gussetMm / 2 - HANDLE_INSET_MM;
  return {
    panels: {
      FRONT: panelFor("FRONT"),
      BACK: panelFor("BACK"),
      LEFT: panelFor("LEFT"),
      RIGHT: panelFor("RIGHT"),
    },
    bottom,
    fold: quadsGeometry(
      model.topFoldMm > 0 ? FACES.flatMap((code) => segmentsOf(code, model)) : [],
      panelHeight,
      model.heightMm,
      plainUv,
    ),
    handles:
      model.handle === "none"
        ? []
        : [handleGeometry(model, handleZ), handleGeometry(model, -handleZ)],
  };
}
