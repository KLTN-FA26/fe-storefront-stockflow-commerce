import { Box3, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { createSurfaces } from "../surfaces";
import type { CupModel } from "../template/schema";
import { buildModelScene } from "../viewer3d/scene-parts";
import { environmentYaw, FOV_DEG, frameModel, HOME_POLAR_RAD } from "../viewer3d/staging";
import { cup12oz } from "./fixtures";

/** The difference of two angles, wrapped into (-PI, PI]; +PI and -PI are the same direction. */
const angleGap = (a: number, b: number) => {
  const gap = (((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI);
  return Math.abs(gap - Math.PI);
};

describe("environmentYaw", () => {
  const target = new Vector3(0, 5, 0);
  const at = (x: number, z: number) => new Vector3(x, 12, z).add(target);

  it.each([
    ["front (+Z)", 0, 10, 0],
    ["right (+X)", 10, 0, Math.PI / 2],
    ["back (-Z)", 0, -10, Math.PI],
    ["left (-X)", -10, 0, -Math.PI / 2],
  ])("is the camera's azimuth around +Y at the %s", (_name, x, z, expected) => {
    expect(angleGap(environmentYaw(at(x, z), target), expected)).toBeLessThan(1e-9);
  });

  it("ignores the camera's height", () => {
    const low = new Vector3(3, 0, 4);
    const high = new Vector3(3, 50, 4);
    expect(environmentYaw(low, new Vector3())).toBeCloseTo(environmentYaw(high, new Vector3()));
  });
});

describe("the home view", () => {
  it("looks from 5 degrees above the middle with a 22 degree field of view", () => {
    expect(FOV_DEG).toBe(22);
    expect(HOME_POLAR_RAD).toBeCloseTo(((90 - 5) * Math.PI) / 180);
  });

  it("still fits the whole cup in view", () => {
    const model = cup12oz.model as CupModel;
    const { group } = buildModelScene(model, createSurfaces(cup12oz));
    const camera = new PerspectiveCamera(FOV_DEG, 1, 1, 10_000);
    const controls = {
      target: new Vector3(),
      minDistance: 0,
      maxDistance: 0,
      update: () => undefined,
      saveState: () => undefined,
    };
    frameModel(camera, controls as never, group, model.heightMm);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    const { min, max } = new Box3().setFromObject(group);
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          const ndc = new Vector3(x, y, z).project(camera);
          expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1);
        }
      }
    }
    // Home elevation: the camera is about 5 degrees above the target's height.
    const offset = camera.position.clone().sub(controls.target);
    expect((Math.atan2(offset.y, Math.hypot(offset.x, offset.z)) * 180) / Math.PI).toBeCloseTo(5);
  });
});
