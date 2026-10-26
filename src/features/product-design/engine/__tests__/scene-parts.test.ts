// @vitest-environment node
import { BackSide, DoubleSide, FrontSide, type Mesh } from "three";
import { describe, expect, it } from "vitest";

import { createSurfaces } from "../surfaces";
import type { BagModel, CupModel } from "../template/schema";
import { buildModelScene } from "../viewer3d/scene-parts";
import { bagM, cup12oz } from "./fixtures";

const cupModel = cup12oz.model as CupModel;
const bagModel = bagM.model as BagModel;
const FACES = ["FRONT", "BACK", "LEFT", "RIGHT"] as const;

const meshOf = (group: { children: unknown[] }, name: string) =>
  group.children.find((child) => (child as Mesh).name === name) as Mesh | undefined;

describe("buildModelScene: cup", () => {
  it("builds the cup parts on the base material and marks the band as the print mesh", () => {
    const { group, meshes, materials, printMeshes } = buildModelScene(
      cupModel,
      createSurfaces(cup12oz),
    );

    expect(meshes.map((mesh) => mesh.name)).toEqual(["body", "wall", "rim", "bottom", "inner"]);
    expect(group.children).toEqual(meshes);
    for (const mesh of meshes) expect(mesh.material).toBe(materials.base);
    expect(materials.base).toHaveProperty("side", FrontSide);
    expect(printMeshes.map(({ code, mesh }) => [code, mesh.name])).toEqual([["BODY", "body"]]);
    expect(printMeshes[0]?.surface.code).toBe("BODY");
  });

  it("refuses a cup template without a BODY print area", () => {
    expect(() => buildModelScene(cupModel, { order: [], byCode: {} })).toThrow(
      "A cup template needs a BODY print area",
    );
  });
});

describe("buildModelScene: bag", () => {
  it("splits each printed panel into a front-side outside and a back-side inside twin", () => {
    const { group, meshes, materials, printMeshes } = buildModelScene(
      bagModel,
      createSurfaces(bagM),
    );

    expect(group.children).toEqual(meshes);
    expect(printMeshes.map(({ code }) => code)).toEqual([...FACES]);
    for (const { code, mesh } of printMeshes) {
      const inside = meshOf(group, `${mesh.name}-inside`);
      expect(mesh.name).toBe(`panel-${code}`);
      expect(mesh.material).toBe(materials.onlySide(FrontSide));
      expect(inside?.geometry).toBe(mesh.geometry);
      expect(inside?.material).toBe(materials.onlySide(BackSide));
      expect(printMeshes.map((print) => print.mesh)).not.toContain(inside);
    }
    expect(materials.onlySide(FrontSide)).not.toBe(materials.base);
  });

  it("keeps the hem, bottom and handles on the double-sided base, without twins", () => {
    const { group, materials } = buildModelScene(bagModel, createSurfaces(bagM));

    expect(materials.base).toHaveProperty("side", DoubleSide);
    for (const name of ["fold", "bottom", "handle-0", "handle-1"]) {
      expect(meshOf(group, name)?.material).toBe(materials.base);
      expect(meshOf(group, `${name}-inside`)).toBeUndefined();
    }
  });

  it("leaves a face without a print area as one double-sided base mesh", () => {
    const frontOnly = { ...bagM, printAreas: bagM.printAreas.filter((a) => a.code === "FRONT") };
    const { group, materials, printMeshes } = buildModelScene(bagModel, createSurfaces(frontOnly));

    expect(printMeshes.map(({ code }) => code)).toEqual(["FRONT"]);
    expect(meshOf(group, "panel-FRONT-inside")).toBeDefined();
    expect(meshOf(group, "panel-LEFT")?.material).toBe(materials.base);
    expect(meshOf(group, "panel-LEFT-inside")).toBeUndefined();
  });
});
