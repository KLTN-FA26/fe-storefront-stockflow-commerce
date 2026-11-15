import {
  Box3,
  CanvasTexture,
  Mesh,
  NeutralToneMapping,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Spherical,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Group,
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { loadGlb, type Model3dRef } from "../model3d";
import type { SurfaceSet } from "../surfaces";
import type { CustomizationTemplate, PrintAreaCode } from "../template/schema";
import type { ProductMaterials } from "./materials";
import { Model3dSwap, type LoadModel3d, type Model3dState } from "./model3d-swap";
import { uvToSurfacePoint } from "./pick";
import { buildModelScene, type ModelScene, type PrintMesh } from "./scene-parts";
import {
  ContactShadow,
  environmentYaw,
  FOV_DEG,
  frameModel,
  lightScene,
  type Lighting,
  MAX_POLAR_RAD,
  MIN_POLAR_RAD,
} from "./staging";

export type ViewerOptions = {
  /** Test seam: builds the renderer for the canvas (default: antialiased, transparent `WebGLRenderer`). */
  createRenderer?: (canvas: HTMLCanvasElement) => WebGLRenderer;
  /** Light the scene with a `RoomEnvironment` (default true); false uses plain lights. */
  environment?: boolean;
  /** Test seam: loads a model's `.glb` (default `loadGlb`). */
  loadModel3d?: LoadModel3d;
};

export type { Model3dState };

type ViewerEvent = "contextlost" | "error" | "model3d";
type Listener = (event?: unknown) => void;
type ModelListener = (state: Model3dState) => void;

/** Where the camera was when a `.glb` came in, so the swap can keep the user's view. */
type ViewSnapshot = { position: Vector3; target: Vector3; homeDistance: number };

/** A print area's texture and the size last uploaded for it (a resized canvas needs fresh GPU storage). */
type AreaTexture = { texture: CanvasTexture; width: number; height: number };

const MAX_PIXEL_RATIO = 2;
const AUTO_ROTATE_SPEED = 2;
/** Longest step fed to the controls, so a frame after idle time does not jump. */
const MAX_FRAME_SECONDS = 1 / 30;
/** The second lost context gives up on recovering and tells the caller to fall back. */
const CONTEXT_LOSSES_BEFORE_EVENT = 2;

/**
 * A real model whose box is within this share of the height of the parametric one (size and centre)
 * leaves the camera exactly where it is; a bigger difference re-frames distance and target.
 */
const SWAP_REFRAME_SHARE = 0.02;

/** Camera azimuth that faces each surface (0 = +Z, towards +X for positive angles). */
const FACE_AZIMUTH: Record<PrintAreaCode, number> = {
  BODY: 0,
  FRONT: 0,
  RIGHT: Math.PI / 2,
  BACK: Math.PI,
  LEFT: -Math.PI / 2,
};

/** Calls every listener; one that throws is logged and never stops the others or the viewer. */
function notify<T>(listeners: Set<(payload: T) => void>, payload: T) {
  for (const listener of [...listeners]) {
    try {
      listener(payload);
    } catch (error) {
      console.error("A viewer listener threw", error);
    }
  }
}

/** What a swap must put back if it fails halfway: the model that was on show and the camera. */
type Detached = {
  model: Group | null;
  materials: ProductMaterials | null;
  printMeshes: PrintMesh[];
  modelMeshes: Mesh[];
  bounds: Box3 | null;
};
type Pose = {
  position: Vector3;
  target: Vector3;
  position0: Vector3;
  target0: Vector3;
  minDistance: number;
  maxDistance: number;
  near: number;
  far: number;
};

const createDefaultRenderer = (canvas: HTMLCanvasElement) =>
  new WebGLRenderer({ canvas, antialias: true, alpha: true });

/**
 * The live 3D preview: a plain three.js scene of the parametric cup or bag with the print areas'
 * canvases as textures. Frames are rendered on demand (texture, camera or size changes), never in
 * a free-running loop, and not at all while the page is hidden or the canvas is off screen.
 */
export class ProductViewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV_DEG, 1, 1, 10_000);
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly listeners: Record<"contextlost" | "error", Set<Listener>> = {
    contextlost: new Set(),
    error: new Set(),
  };
  private readonly modelListeners = new Set<ModelListener>();
  private readonly swap: Model3dSwap;
  /** The box of the model on show (without its contact shadow), to compare with the next one. */
  private modelBounds: Box3 | null = null;
  private readonly textures = new Map<PrintAreaCode, AreaTexture>();
  private readonly printMaterials = new Map<PrintAreaCode, Material>();
  private readonly pixelRatio: number;
  private printMeshes: PrintMesh[] = [];
  /** Every mesh of the model, for picking: whatever is nearest under the cursor decides. */
  private modelMeshes: Mesh[] = [];
  private model: Group | null = null;
  private materials: ProductMaterials | null = null;
  private readonly useEnvironment: boolean;
  private lighting: Lighting;
  private readonly contactShadow = new ContactShadow();
  private resizeObserver: ResizeObserver | undefined;
  private intersectionObserver: IntersectionObserver | undefined;
  private frameId: number | null = null;
  private lastFrameTime = 0;
  private onScreen = true;
  private contextLosses = 0;
  private disposed = false;
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement, opts: ViewerOptions = {}) {
    this.canvas = canvas;
    this.renderer = (opts.createRenderer ?? createDefaultRenderer)(canvas);
    this.swap = new Model3dSwap({
      load: opts.loadModel3d ?? loadGlb,
      emit: (state) => notify(this.modelListeners, state),
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Neutral (Khronos PBR Neutral, Q10) keeps base colours at their sRGB values below the
    // highlights, so a printed brand colour reads as chosen; ACES shifts hue and saturation.
    this.renderer.toneMapping = NeutralToneMapping;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.useEnvironment = opts.environment ?? true;
    this.lighting = lightScene(this.renderer, this.scene, this.camera, this.useEnvironment);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = MIN_POLAR_RAD;
    this.controls.maxPolarAngle = MAX_POLAR_RAD;
    this.controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
    this.controls.addEventListener("change", this.onControlsChange);
    this.syncEnvironment();

    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    // Without these observers the viewer simply never pauses and never resizes by itself.
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    }
    if (typeof IntersectionObserver !== "undefined") {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        const latest = entries.at(-1);
        if (!latest) return;
        this.onScreen = latest.isIntersecting;
        if (this.onScreen) this.invalidate();
      });
      this.intersectionObserver.observe(canvas);
    }
    this.resize();
  }

  /**
   * Replaces the model. Textures set earlier (or later) are applied to it by print area. The model
   * built from the template's figures is shown at once; with `model3d` its `.glb` loads in the
   * background and replaces it when ready (`model3d` events, `whenModelReady`). A failed load keeps
   * the parametric model.
   */
  setModel(
    template: CustomizationTemplate,
    surfaces: SurfaceSet,
    model3d?: Model3dRef | null,
  ): void {
    const { model } = template;
    if (model.kind === "gltf") throw new Error("GLB models are not enabled");
    // Builds first: a template that cannot be built throws before the current model is touched.
    const scene = buildModelScene(model, surfaces);

    this.swap.cancel();
    this.attachScene(scene, model.heightMm, false);
    if (model3d && !this.disposed) {
      this.swap.start({
        ref: model3d,
        model,
        surfaces,
        attach: (loaded) => this.attachScene(loaded, model.heightMm, true),
      });
    }
  }

  /** Resolves when the current model's `.glb` is in or has failed; at once without one. Never rejects. */
  whenModelReady(): Promise<void> {
    return this.swap.whenReady();
  }

  /** Uploads (or refreshes, in place) a print area's canvas as its texture; cheap enough to call every frame of a drag. */
  setSurfaceTexture(code: PrintAreaCode, source: HTMLCanvasElement): void {
    if (this.disposed) return;
    const { width, height } = source;
    const existing = this.textures.get(code);
    if (existing) {
      const { texture } = existing;
      texture.image = source;
      // A different size needs new GPU storage; the same size only needs the pixels re-sent.
      if (existing.width !== width || existing.height !== height) texture.dispose();
      existing.width = width;
      existing.height = height;
      texture.needsUpdate = true;
    } else {
      const texture = new CanvasTexture(source);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = this.renderer.capabilities?.getMaxAnisotropy() ?? 1;
      this.textures.set(code, { texture, width, height });
    }
    this.applyTexture(code);
    this.invalidate();
  }

  /** Turns the camera (keeping its height and distance) to face the surface. */
  focusSurface(code: PrintAreaCode): void {
    if (!this.model) return;
    const { target } = this.controls;
    const offset = this.camera.position.clone().sub(target);
    const spherical = new Spherical().setFromVector3(offset);
    spherical.theta = FACE_AZIMUTH[code];
    this.camera.position.copy(target).add(offset.setFromSpherical(spherical));
    this.controls.update();
  }

  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on;
    this.invalidate();
  }

  /** Back to the home view: front of the model, about 5 degrees above its middle. */
  resetView(): void {
    if (!this.model) return;
    this.controls.reset();
  }

  /**
   * The print surface point under the cursor, or null unless the nearest thing under it is a print
   * mesh: a hem, handle or the inside of a panel in front of the artwork is not a hit on it.
   */
  pick(
    clientX: number,
    clientY: number,
  ): { surfaceCode: PrintAreaCode; u: number; v: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || this.printMeshes.length === 0) return null;
    const pointer = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    );
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(pointer, this.camera);
    const [hit] = this.raycaster.intersectObjects(this.modelMeshes, false);
    const target = this.printMeshes.find(({ mesh }) => mesh === hit?.object);
    if (!hit?.uv || !target) return null;
    const { u, v } = uvToSurfacePoint(target.surface, [hit.uv.x, hit.uv.y]);
    return { surfaceCode: target.code, u, v };
  }

  /** The current view as a PNG of the given pixel size; the on-screen size is restored afterwards. */
  screenshot({ width, height }: { width: number; height: number }): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        this.renderer.setPixelRatio(1);
        this.applySize(width, height);
        this.renderer.render(this.scene, this.camera);
        // toBlob snapshots the canvas as it is now, so the size can be restored straight away.
        this.canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error("The 3D preview could not be encoded")),
          "image/png",
        );
      } catch (error) {
        reject(error);
      } finally {
        this.renderer.setPixelRatio(this.pixelRatio);
        this.resize(true);
        this.renderNow();
      }
    });
  }

  /**
   * Subscribes to `contextlost` (the second lost WebGL context), `error` (a failed render) or
   * `model3d` (the `.glb` is `loading`, `ready` or `failed` with a code); returns the unsubscribe.
   */
  on(event: "model3d", callback: ModelListener): () => void;
  on(event: "contextlost" | "error", callback: Listener): () => void;
  on(event: ViewerEvent, callback: Listener | ModelListener): () => void {
    const listeners = event === "model3d" ? this.modelListeners : this.listeners[event];
    listeners.add(callback);
    return () => void listeners.delete(callback);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.controls.dispose();

    this.clearModel();
    for (const { texture } of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.contactShadow.dispose();
    this.lighting.dispose();
    for (const listeners of Object.values(this.listeners)) listeners.clear();
    this.modelListeners.clear();
    this.renderer.dispose();
  }

  private get paused(): boolean {
    return document.hidden || !this.onScreen;
  }

  /** The camera moved: the light turns with it, and a frame follows. */
  private onControlsChange = () => {
    this.syncEnvironment();
    this.invalidate();
  };

  /** Turns the environment to the camera's azimuth, so the light keeps its side relative to the viewer. */
  private syncEnvironment() {
    this.scene.environmentRotation.y = environmentYaw(this.camera.position, this.controls.target);
  }

  /** Asks for one frame; any number of calls before it runs share it. */
  private invalidate = () => {
    if (this.disposed || this.frameId !== null) return;
    this.frameId = requestAnimationFrame(this.tick);
  };

  /** While damping or auto-rotate moves the camera, the controls' change events keep the frames coming. */
  private tick = (time: number) => {
    this.frameId = null;
    if (this.disposed || this.paused) return;
    const seconds = Math.min(Math.max((time - this.lastFrameTime) / 1000, 0), MAX_FRAME_SECONDS);
    this.lastFrameTime = time;
    this.controls.update(seconds);
    this.renderNow();
  };

  private renderNow() {
    if (this.disposed) return;
    try {
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      this.emit("error", error);
    }
  }

  private emit(event: "contextlost" | "error", payload?: unknown) {
    notify(this.listeners[event], payload);
  }

  private onContextLost = () => {
    this.contextLosses += 1;
    if (this.contextLosses === CONTEXT_LOSSES_BEFORE_EVENT) this.emit("contextlost");
  };

  /**
   * three re-initialises its GPU state and canvas textures re-upload from their images, but the
   * PMREM environment is a render target and is not regenerated: without lights the product would
   * stay black. So the lighting is rebuilt.
   */
  private onContextRestored = () => {
    this.lighting.dispose();
    this.lighting = lightScene(this.renderer, this.scene, this.camera, this.useEnvironment);
    this.syncEnvironment();
    this.invalidate();
  };

  private onVisibilityChange = () => {
    if (!document.hidden) this.invalidate();
  };

  /** Fits the renderer and camera to the canvas's laid-out size (`force` re-applies an unchanged size). */
  private resize(force = false) {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (width <= 0 || height <= 0) return;
    if (!force && width === this.width && height === this.height) return;
    this.applySize(width, height);
    this.invalidate();
  }

  private applySize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private applyTexture(code: PrintAreaCode) {
    const entry = this.textures.get(code);
    const targets = this.printMeshes.filter((target) => target.code === code);
    if (!entry || !this.materials || targets.length === 0) return;
    let material = this.printMaterials.get(code);
    if (!material) {
      material = this.materials.print(entry.texture);
      this.printMaterials.set(code, material);
    }
    for (const { mesh } of targets) mesh.material = material;
  }

  /** Puts a built scene in place: textures, frame, shadow, light and a frame (`keepView`: a swap that keeps the user's angles). */
  private attachScene(scene: ModelScene, heightMm: number, keepView: boolean) {
    const { group, meshes, materials, printMeshes } = scene;
    const before = keepView ? this.snapshotView() : null;
    const pose = this.snapshotPose();
    // The old model is only set aside: it is freed once the new one is fully in place, and put
    // back if anything throws, so the viewer is never left without a model.
    const previous = this.detachModel();
    try {
      this.materials = materials;
      this.printMeshes = printMeshes;
      this.modelMeshes = meshes;
      this.model = group;
      this.scene.add(group);
      for (const code of this.textures.keys()) this.applyTexture(code);

      const size = frameModel(this.camera, this.controls, group, heightMm);
      this.modelBounds = new Box3().setFromObject(group);
      if (before && previous.bounds) this.restoreView(before, previous.bounds, heightMm);
      // A camera already at the home pose fires no change event, so the yaw is set here as well.
      this.syncEnvironment();
      const shadow = this.contactShadow.create(size);
      if (shadow) group.add(shadow);
    } catch (error) {
      this.scene.remove(group);
      this.printMaterials.clear();
      this.reinstate(previous, pose);
      throw error;
    }
    this.freeModel(previous);
    this.invalidate();
  }

  private snapshotPose(): Pose {
    const { camera, controls } = this;
    return {
      position: camera.position.clone(),
      target: controls.target.clone(),
      position0: controls.position0.clone(),
      target0: controls.target0.clone(),
      minDistance: controls.minDistance,
      maxDistance: controls.maxDistance,
      near: camera.near,
      far: camera.far,
    };
  }

  private reinstate(previous: Detached, pose: Pose) {
    const { camera, controls } = this;
    this.model = previous.model;
    this.materials = previous.materials;
    this.printMeshes = previous.printMeshes;
    this.modelMeshes = previous.modelMeshes;
    this.modelBounds = previous.bounds;
    if (previous.model) this.scene.add(previous.model);
    for (const code of this.textures.keys()) this.applyTexture(code);
    camera.position.copy(pose.position);
    controls.target.copy(pose.target);
    controls.position0.copy(pose.position0);
    controls.target0.copy(pose.target0);
    controls.minDistance = pose.minDistance;
    controls.maxDistance = pose.maxDistance;
    camera.near = pose.near;
    camera.far = pose.far;
    camera.updateProjectionMatrix();
    this.syncEnvironment();
  }

  private snapshotView(): ViewSnapshot {
    return {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      homeDistance: this.controls.position0.distanceTo(this.controls.target0),
    };
  }

  /**
   * `frameModel` has put the camera at the new home pose. The user's angles always stay. When the
   * real model's box is within `SWAP_REFRAME_SHARE` of the height of the parametric one, position and
   * distance stay too; otherwise the target follows the new box and the distance keeps its ratio to
   * the home distance (a user who zoomed in stays zoomed in).
   */
  private restoreView(before: ViewSnapshot, previous: Box3, heightMm: number) {
    const bounds = this.modelBounds;
    if (!bounds) return;
    const limit = heightMm * SWAP_REFRAME_SHARE;
    const near = (a: Vector3, b: Vector3) => a.distanceTo(b) <= limit;
    const sameBox =
      near(previous.getSize(new Vector3()), bounds.getSize(new Vector3())) &&
      near(previous.getCenter(new Vector3()), bounds.getCenter(new Vector3()));
    const { controls, camera } = this;
    if (sameBox) {
      controls.target.copy(before.target);
      camera.position.copy(before.position);
    } else {
      const offset = before.position.clone().sub(before.target);
      const spherical = new Spherical().setFromVector3(offset);
      const home = controls.position0.distanceTo(controls.target0);
      const scaled =
        before.homeDistance > 0 ? (spherical.radius * home) / before.homeDistance : home;
      spherical.radius = Math.min(Math.max(scaled, controls.minDistance), controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
    }
    controls.update();
  }

  /** Takes the model out and frees it; aborts a `.glb` still loading (it would arrive at a model that is gone). */
  private clearModel() {
    this.swap.cancel();
    this.removeModel();
  }

  private removeModel() {
    this.freeModel(this.detachModel());
  }

  /** Takes the model out of the scene and the viewer's state without freeing it. */
  private detachModel(): Detached {
    const detached: Detached = {
      model: this.model,
      materials: this.materials,
      printMeshes: this.printMeshes,
      modelMeshes: this.modelMeshes,
      bounds: this.modelBounds,
    };
    if (this.model) this.scene.remove(this.model);
    this.model = null;
    this.modelBounds = null;
    this.materials = null;
    this.printMaterials.clear();
    this.printMeshes = [];
    this.modelMeshes = [];
    return detached;
  }

  private freeModel({ model, materials }: Detached) {
    model?.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
    materials?.dispose();
  }
}
