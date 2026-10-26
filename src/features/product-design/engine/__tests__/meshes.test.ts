// @vitest-environment node
import type { BufferGeometry } from "three";
import { describe, expect, it } from "vitest";

import { createSurfaces, cupSector } from "../surfaces";
import type { BagModel, CupModel, CustomizationTemplate } from "../template/schema";
import { buildBagGeometry } from "../viewer3d/bag-mesh";
import { buildCupGeometry } from "../viewer3d/cup-mesh";
import { uvToSurfacePoint } from "../viewer3d/pick";
import { bagM, cup12oz } from "./fixtures";

type Vec3 = [number, number, number];

const xy = (p: { x: number; y: number }): [number, number] => [p.x, p.y];
const cupModel = cup12oz.model as CupModel;
const bagModel = bagM.model as BagModel;

function vec(g: BufferGeometry, name: "position" | "normal", i: number): Vec3 {
  const a = g.getAttribute(name);
  return [a.getX(i), a.getY(i), a.getZ(i)];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function range(g: BufferGeometry, axis: 0 | 1 | 2): [number, number] {
  const values = Array.from(
    { length: g.getAttribute("position").count },
    (_, i) => vec(g, "position", i)[axis],
  );
  return [Math.min(...values), Math.max(...values)];
}

/** Every non-degenerate triangle must be wound so its face normal agrees with its vertex normals. */
function expectWindingFollowsNormals(g: BufferGeometry) {
  const index = g.getIndex();
  expect(index).not.toBeNull();
  let checked = 0;
  for (let t = 0; t < index!.count; t += 3) {
    const [a, b, c] = [index!.getX(t), index!.getX(t + 1), index!.getX(t + 2)];
    const face = cross(
      sub(vec(g, "position", b), vec(g, "position", a)),
      sub(vec(g, "position", c), vec(g, "position", a)),
    );
    if (Math.hypot(...face) < 1e-9) continue; // collapsed triangle (e.g. at the lathe centre)
    for (const i of [a, b, c]) expect(dot(face, vec(g, "normal", i))).toBeGreaterThan(0);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
}

/** Float32 positions, and parts that are rotated into place, are only exact to a few digits. */
function expectRange(g: BufferGeometry, axis: 0 | 1 | 2, expected: [number, number]) {
  const [low, high] = range(g, axis);
  expect(low).toBeCloseTo(expected[0], 3);
  expect(high).toBeCloseTo(expected[1], 3);
}

function expectVec(actual: Vec3, expected: Vec3) {
  expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 6));
}

function uvRange(g: BufferGeometry): { x: [number, number]; y: [number, number] } {
  const uv = g.getAttribute("uv");
  const xs = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
  const ys = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
  return { x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] };
}

describe("cup meshes", () => {
  it("builds a cup body whose UVs follow the dieline", () => {
    const surface = createSurfaces(cup12oz).byCode.BODY!;
    const g = buildCupGeometry(cupModel, surface, {
      radialSegments: 64,
      heightSegments: 8,
    });
    expect(g.body.getAttribute("position").count).toBe(65 * 9);
    const uv = g.body.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
    }
    const s = cupSector(cupModel);
    const front = surface.uvOf(...xy(surface.toFlat((s.sweepRad * s.midRadiusMm) / 2, 6)));
    expect([uv.getX(32), uv.getY(32)]).toEqual([
      expect.closeTo(front[0], 6),
      expect.closeTo(front[1], 6),
    ]); // α = π, top ring
  });

  it("places the body on the frustum with the seam at the back and the print unmirrored", () => {
    const surface = createSurfaces(cup12oz).byCode.BODY!;
    const g = buildCupGeometry(cupModel, surface, { radialSegments: 64, heightSegments: 8 });
    const slant = Math.hypot(110, 15);
    const topT = 6 / slant;
    const topRadius = 45 + (30 - 45) * topT;
    const topY = 110 * (1 - topT);

    const [seam, front, right] = [0, 32, 48].map((i) => vec(g.body, "position", i));
    expect(seam).toEqual([
      expect.closeTo(0, 3),
      expect.closeTo(topY, 3),
      expect.closeTo(-topRadius, 3),
    ]);
    expect(front).toEqual([
      expect.closeTo(0, 3),
      expect.closeTo(topY, 3),
      expect.closeTo(topRadius, 3),
    ]);
    expect(right![0]).toBeCloseTo(topRadius, 3); // α = 3π/2 is on +X

    // Seen from the front (+Z, +X to the right), the print reads left to right.
    const uv = g.body.getAttribute("uv");
    expect(uv.getX(48)).toBeGreaterThan(uv.getX(32));
    expect(uv.getX(16)).toBeLessThan(uv.getX(32));

    const last = vec(g.body, "position", 8 * 65);
    const bottomT = (slant - 8) / slant;
    expect(last[1]).toBeCloseTo(110 * (1 - bottomT), 3);
    expect(Math.hypot(last[0], last[2])).toBeCloseTo(45 + (30 - 45) * bottomT, 3);
  });

  it("maps body UVs back to the surface angle and slant position", () => {
    const surface = createSurfaces(cup12oz).byCode.BODY!;
    const g = buildCupGeometry(cupModel, surface, { radialSegments: 64, heightSegments: 8 });
    const s = cupSector(cupModel);
    const uv = g.body.getAttribute("uv");
    const index = 4 * 65 + 40; // ring 4 of 8, α = 40/64 · 2π
    const p = uvToSurfacePoint(surface, [uv.getX(index), uv.getY(index)]);
    expect(p.u).toBeCloseTo((40 / 64) * s.sweepRad * s.midRadiusMm, 4);
    expect(p.v).toBeCloseTo(
      surface.vRange[0] + ((surface.vRange[1] - surface.vRange[0]) * 4) / 8,
      4,
    );
  });

  it("covers only the print band with the body and the rest of the wall with `wall`", () => {
    const surface = createSurfaces(cup12oz).byCode.BODY!;
    const g = buildCupGeometry(cupModel, surface);
    const slant = Math.hypot(110, 15);
    const [bodyLow, bodyHigh] = range(g.body, 1);
    expect(bodyHigh).toBeCloseTo(110 * (1 - 6 / slant), 3);
    expect(bodyLow).toBeCloseTo(110 * (1 - (slant - 8) / slant), 3);

    const [wallLow, wallHigh] = range(g.wall, 1);
    expect(wallHigh).toBeCloseTo(110, 3);
    expect(wallLow).toBeCloseTo(0, 3);
    const wall = g.wall.getAttribute("position");
    for (let i = 0; i < wall.count; i++) {
      const y = wall.getY(i);
      expect(y >= bodyHigh - 1e-6 || y <= bodyLow + 1e-6).toBe(true);
    }
    const { x, y } = uvRange(g.wall);
    expect([x[0], x[1], y[0], y[1]]).toEqual([0, 1, 0, 1]);
  });

  it("leaves no wall strip where the band starts at the rim", () => {
    const model: CupModel = { ...cupModel, bandTopOffsetMm: 0 };
    const surface = createSurfaces({ ...cup12oz, model }).byCode.BODY!;
    const g = buildCupGeometry(model, surface);
    expect(range(g.wall, 1)[1]).toBeLessThan(110 - 1);
    expect(range(g.body, 1)[1]).toBeCloseTo(110, 3);
  });

  it("winds every part consistently with its normals, outer faces outward and the inner wall inward", () => {
    const surface = createSurfaces(cup12oz).byCode.BODY!;
    const g = buildCupGeometry(cupModel, surface, { radialSegments: 32, heightSegments: 4 });
    for (const part of [g.body, g.wall, g.rim, g.bottom, g.inner])
      expectWindingFollowsNormals(part);

    for (const part of [g.body, g.wall]) {
      for (let i = 0; i < part.getAttribute("position").count; i++) {
        const [px, , pz] = vec(part, "position", i);
        const [nx, , nz] = vec(part, "normal", i);
        expect(px * nx + pz * nz).toBeGreaterThan(0);
      }
    }
    // The wall leans outward and down on a cup that widens upwards.
    expect(vec(g.body, "normal", 0)[1]).toBeLessThan(0);

    const inner = g.inner.getAttribute("position");
    let wallVertices = 0;
    for (let i = 0; i < inner.count; i++) {
      const [nx, ny, nz] = vec(g.inner, "normal", i);
      const [px, py, pz] = vec(g.inner, "position", i);
      if (ny > 0.99) continue; // the floor faces up
      wallVertices++;
      expect(px * nx + pz * nz).toBeLessThan(0);
      expect(Math.hypot(px, pz)).toBeLessThan(45 + (30 - 45) * ((110 - py) / 110) + 1e-6);
    }
    expect(wallVertices).toBeGreaterThan(0);
  });

  it("closes the base downwards and rolls a rim bead round the top edge", () => {
    const surface = createSurfaces(cup12oz).byCode.BODY!;
    const g = buildCupGeometry(cupModel, surface, { radialSegments: 32 });
    expectRange(g.bottom, 1, [0, 0]);
    for (let i = 0; i < g.bottom.getAttribute("position").count; i++) {
      expectVec(vec(g.bottom, "normal", i), [0, -1, 0]);
      const [x, , z] = vec(g.bottom, "position", i);
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(30 + 1e-6);
    }

    const [rimLow, rimHigh] = range(g.rim, 1);
    expect(rimLow).toBeCloseTo(110 - 1.5, 3);
    expect(rimHigh).toBeCloseTo(110 + 1.5, 3);
    expect(range(g.rim, 0)[1]).toBeCloseTo(45 + 1.5, 3);
  });

  it("unrolls a near-straight cup over its circumference", () => {
    const model: CupModel = { ...cupModel, bottomDiameterMm: 89.8 };
    const template: CustomizationTemplate = { ...cup12oz, model };
    const surface = createSurfaces(template).byCode.BODY!;
    expect(surface.kind).toBe("rect");
    const g = buildCupGeometry(model, surface, { radialSegments: 64, heightSegments: 4 });
    const uv = g.body.getAttribute("uv");

    const slant = Math.hypot(110, 0.1);
    expect(surface.vRange[0]).toBe(6);
    const front = surface.uvOf(...xy(surface.toFlat((Math.PI * 90) / 2, 6)));
    expect([uv.getX(32), uv.getY(32)]).toEqual([
      expect.closeTo(front[0], 6),
      expect.closeTo(front[1], 6),
    ]);
    // The glue flap sits past α = 2π.
    const end = surface.uvOf(...xy(surface.toFlat(Math.PI * 90, 6)));
    expect(uv.getX(64)).toBeCloseTo(end[0], 6);
    expect(uv.getX(64)).toBeLessThan(surface.uvOf(...xy(surface.toFlat(Math.PI * 90 + 8, 6)))[0]);
    expect(range(g.body, 1)[0]).toBeCloseTo(110 * (1 - (slant - 8) / slant), 3);
  });

  it("maps a picked UV back to surface coordinates", () => {
    const surface = createSurfaces(cup12oz).byCode.BODY!;
    const f = surface.toFlat(120, 40);
    const p = uvToSurfacePoint(surface, surface.uvOf(f.x, f.y));
    expect(p.u).toBeCloseTo(120, 6);
    expect(p.v).toBeCloseTo(40, 6);
  });
});

describe("bag meshes", () => {
  it("builds four bag panels and two handles", () => {
    const g = buildBagGeometry(bagModel, createSurfaces(bagM));
    expect(Object.keys(g.panels)).toEqual(["FRONT", "BACK", "LEFT", "RIGHT"]);
    expect(g.handles).toHaveLength(2);
  });

  it("maps each panel's trim box into its surface texture", () => {
    const surfaces = createSurfaces(bagM);
    const g = buildBagGeometry(bagModel, surfaces);
    const front = surfaces.byCode.FRONT!;
    const uv = g.panels.FRONT.getAttribute("uv");
    const corners = Array.from({ length: uv.count }, (_, i) => ({
      position: vec(g.panels.FRONT, "position", i),
      uv: [uv.getX(i), uv.getY(i)] as [number, number],
    }));
    const topLeft = corners.find((c) => c.position[0] < 0 && c.position[1] > 100)!;
    const bottomRight = corners.find((c) => c.position[0] > 0 && c.position[1] < 100)!;
    expect(topLeft.uv).toEqual([
      expect.closeTo(front.uvOf(...xy(front.toFlat(0, 0)))[0], 6),
      expect.closeTo(front.uvOf(...xy(front.toFlat(0, 0)))[1], 6),
    ]);
    expect(bottomRight.uv).toEqual([
      expect.closeTo(front.uvOf(...xy(front.toFlat(260, 280)))[0], 6),
      expect.closeTo(front.uvOf(...xy(front.toFlat(260, 280)))[1], 6),
    ]);
    for (const code of ["FRONT", "BACK", "LEFT", "RIGHT"] as const) {
      const { x, y } = uvRange(g.panels[code]);
      expect(Math.min(x[0], y[0])).toBeGreaterThan(0); // the bleed margin stays outside the trim
      expect(Math.max(x[1], y[1])).toBeLessThan(1);
    }
  });

  it("stands the four panels on a box facing outwards with the print unmirrored", () => {
    const g = buildBagGeometry(bagModel, createSurfaces(bagM));
    const half = { w: 130, g: 60 };
    const facing = {
      FRONT: [0, 0, 1],
      BACK: [0, 0, -1],
      LEFT: [-1, 0, 0],
      RIGHT: [1, 0, 0],
    } as const;
    for (const code of ["FRONT", "BACK", "LEFT", "RIGHT"] as const) {
      expectWindingFollowsNormals(g.panels[code]);
      expect(range(g.panels[code], 1)).toEqual([0, 280]);
      const position = g.panels[code].getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        expect(
          dot(vec(g.panels[code], "normal", i), facing[code] as unknown as Vec3),
        ).toBeGreaterThan(0.9);
      }
    }
    expect(range(g.panels.FRONT, 2)).toEqual([half.g, half.g]);
    expect(range(g.panels.BACK, 2)).toEqual([-half.g, -half.g]);
    expect(range(g.panels.FRONT, 0)).toEqual([-half.w, half.w]);
    expect(range(g.panels.LEFT, 0)[0]).toBe(-half.w);
    expect(range(g.panels.RIGHT, 0)[1]).toBe(half.w);

    // u grows to the right as seen from outside each face.
    const u = (code: "FRONT" | "BACK" | "LEFT" | "RIGHT", axis: 0 | 2, at: number) => {
      const position = g.panels[code].getAttribute("position");
      const uv = g.panels[code].getAttribute("uv");
      const i = Array.from({ length: position.count }, (_, k) => k).find(
        (k) => Math.abs(vec(g.panels[code], "position", k)[axis] - at) < 1e-9,
      )!;
      return uv.getX(i);
    };
    expect(u("FRONT", 0, half.w)).toBeGreaterThan(u("FRONT", 0, -half.w)); // +X is right
    expect(u("BACK", 0, -half.w)).toBeGreaterThan(u("BACK", 0, half.w));
    expect(u("LEFT", 2, half.g)).toBeGreaterThan(u("LEFT", 2, -half.g)); // towards the front
    expect(u("RIGHT", 2, -half.g)).toBeGreaterThan(u("RIGHT", 2, half.g));
  });

  it("folds each gusset inwards along its centre crease", () => {
    const surfaces = createSurfaces(bagM);
    const g = buildBagGeometry(bagModel, surfaces);
    const left = surfaces.byCode.LEFT!;
    const crease = left.uvOf(...xy(left.toFlat(60, 0)));
    const position = g.panels.LEFT.getAttribute("position");
    const uv = g.panels.LEFT.getAttribute("uv");
    const onCrease = Array.from({ length: position.count }, (_, i) => i).filter(
      (i) => Math.abs(position.getZ(i)) < 1e-9 && position.getY(i) === 280,
    );
    expect(onCrease.length).toBeGreaterThanOrEqual(2); // one vertex per quad, so the crease stays sharp
    for (const i of onCrease) {
      expect(position.getX(i)).toBeGreaterThan(-130 + 1);
      expect(position.getX(i)).toBeLessThan(0);
      expect([uv.getX(i), uv.getY(i)]).toEqual([
        expect.closeTo(crease[0], 6),
        expect.closeTo(crease[1], 6),
      ]);
    }
    expect(position.count).toBe(8);
    expect(g.panels.FRONT.getAttribute("position").count).toBe(4);
  });

  it("closes the base and folds the top hem over the printed height", () => {
    const g = buildBagGeometry(bagModel, createSurfaces(bagM));
    expectRange(g.bottom, 1, [0, 0]);
    expectRange(g.bottom, 0, [-130, 130]);
    expectRange(g.bottom, 2, [-60, 60]);
    expectVec(vec(g.bottom, "normal", 0), [0, -1, 0]);

    expect(range(g.fold, 1)).toEqual([280, 320]);
    expectWindingFollowsNormals(g.fold);
    expectWindingFollowsNormals(g.bottom);
    for (let i = 0; i < g.fold.getAttribute("position").count; i++) {
      const [x, , z] = vec(g.fold, "position", i);
      const [nx, , nz] = vec(g.fold, "normal", i);
      expect(x * nx + z * nz).toBeGreaterThan(0);
    }
  });

  it("raises the handles above the mouth, or omits them", () => {
    const surfaces = createSurfaces(bagM);
    for (const handle of ["twisted", "flat"] as const) {
      const g = buildBagGeometry({ ...bagModel, handle }, surfaces);
      expect(g.handles).toHaveLength(2);
      for (const h of g.handles) expect(range(h, 1)[1]).toBeGreaterThan(320);
      // One loop hangs on each of the front and back panels.
      expect(g.handles.map((h) => Math.sign(range(h, 2)[0] + range(h, 2)[1])).sort()).toEqual([
        -1, 1,
      ]);
    }
    expect(buildBagGeometry({ ...bagModel, handle: "none" }, surfaces).handles).toEqual([]);
  });

  it("keeps a plain 0..1 UV layout on faces that have no print area", () => {
    const frontOnly: CustomizationTemplate = { ...bagM, printAreas: bagM.printAreas.slice(0, 1) };
    const g = buildBagGeometry(bagModel, createSurfaces(frontOnly));
    const { x, y } = uvRange(g.panels.BACK);
    expect([x[0], x[1], y[0], y[1]]).toEqual([0, 1, 0, 1]);
    expect(Math.min(...Object.values(uvRange(g.panels.FRONT)).map((r) => r[0]))).toBeGreaterThan(0);
  });

  it("maps a picked UV back to the bag face", () => {
    const front = createSurfaces(bagM).byCode.FRONT!;
    const f = front.toFlat(200, 75);
    const p = uvToSurfacePoint(front, front.uvOf(f.x, f.y));
    expect(p.u).toBeCloseTo(200, 6);
    expect(p.v).toBeCloseTo(75, 6);
  });
});
