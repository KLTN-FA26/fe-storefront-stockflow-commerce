import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Spherical,
  Vector3,
  type Group,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { createContactShadowTexture } from "./materials";

export const FOV_DEG = 30;
export const MIN_POLAR_RAD = 0.15 * Math.PI;
export const MAX_POLAR_RAD = 0.85 * Math.PI;
/** Orbit distance limits and framing margin, as multiples of the model height. */
const MIN_DISTANCE_RATIO = 1.2;
const MAX_DISTANCE_RATIO = 4;
const FIT_MARGIN = 1.15;
/** The home view sits a little above the front (+Z) of the model. */
const HOME_POLAR_RAD = 0.42 * Math.PI;
const ENVIRONMENT_BLUR_SIGMA = 0.04;
const SHADOW_SPREAD = 1.8;
const SHADOW_LIFT_MM = 0.1;

export type Lighting = { dispose(): void };

/**
 * Lights the scene: a `RoomEnvironment` through `PMREMGenerator` (image-based lighting), or plain
 * ambient + key lights when `environment` is false. `dispose` takes the lighting out again, so
 * it can be built anew (a restored WebGL context loses the generated environment).
 */
export function lightScene(renderer: WebGLRenderer, scene: Scene, environment: boolean): Lighting {
  if (!environment) {
    const key = new DirectionalLight("white", 2);
    key.position.set(1, 2, 3);
    const fill = new AmbientLight("white", 1.2);
    scene.add(fill, key);
    return { dispose: () => scene.remove(fill, key) };
  }
  const generator = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = generator.fromScene(room, ENVIRONMENT_BLUR_SIGMA);
  scene.environment = target.texture;
  room.dispose();
  generator.dispose();
  return {
    dispose: () => {
      scene.environment = null;
      target.dispose();
    },
  };
}

/**
 * Frames the whole model from the front (slightly above), limits the orbit distance to 1.2 to 4
 * times its nominal height, and remembers that view as the controls' home (`controls.reset()`).
 * Returns the model's size, which the contact shadow is sized from.
 */
export function frameModel(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  group: Group,
  heightMm: number,
): Vector3 {
  const box = new Box3().setFromObject(group);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const halfFov = (FOV_DEG * Math.PI) / 360;
  const fitHeight = size.y / 2 / Math.tan(halfFov);
  const fitWidth = Math.max(size.x, size.z) / 2 / (Math.tan(halfFov) * camera.aspect);

  controls.minDistance = MIN_DISTANCE_RATIO * heightMm;
  controls.maxDistance = MAX_DISTANCE_RATIO * heightMm;
  const distance = Math.min(
    Math.max(FIT_MARGIN * Math.max(fitHeight, fitWidth), controls.minDistance),
    controls.maxDistance,
  );
  camera.near = heightMm / 20;
  camera.far = heightMm * 20;
  camera.updateProjectionMatrix();
  controls.target.copy(centre);
  camera.position.setFromSpherical(new Spherical(distance, HOME_POLAR_RAD, 0)).add(centre);
  controls.update();
  controls.saveState();
  return size;
}

/** The soft ground shadow under the product; its material is built once, on first use. */
export class ContactShadow {
  /** undefined until first needed; null when there is no 2D context to paint the gradient with. */
  private material: MeshBasicMaterial | null | undefined;

  /** A ground plane sized for the model's footprint, or null where no gradient can be drawn. */
  create(size: Vector3): Mesh | null {
    if (this.material === undefined) this.material = this.createMaterial();
    if (!this.material) return null;
    const side = Math.max(size.x, size.z) * SHADOW_SPREAD;
    const shadow = new Mesh(new PlaneGeometry(side, side), this.material);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -SHADOW_LIFT_MM;
    shadow.renderOrder = -1;
    return shadow;
  }

  dispose(): void {
    this.material?.map?.dispose();
    this.material?.dispose();
  }

  private createMaterial(): MeshBasicMaterial | null {
    const map = createContactShadowTexture();
    return map && new MeshBasicMaterial({ map, transparent: true, depthWrite: false });
  }
}
