import {
  CanvasTexture,
  Mesh,
  NeutralToneMapping,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Spherical,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type Group,
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import type { SurfaceSet } from "../surfaces";
import type { CustomizationTemplate, PrintAreaCode } from "../template/schema";
import type { ProductMaterials } from "./materials";
import { uvToSurfacePoint } from "./pick";
import { buildModelScene, type PrintMesh } from "./scene-parts";
import {
  ContactShadow,
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
};

type ViewerEvent = "contextlost" | "error";
type Listener = (event?: unknown) => void;

/** A print area's texture and the size last uploaded for it (a resized canvas needs fresh GPU storage). */
type AreaTexture = { texture: CanvasTexture; width: number; height: number };

const MAX_PIXEL_RATIO = 2;
const AUTO_ROTATE_SPEED = 2;
/** Longest step fed to the controls, so a frame after idle time does not jump. */
const MAX_FRAME_SECONDS = 1 / 30;
/** The second lost context gives up on recovering and tells the caller to fall back. */
const CONTEXT_LOSSES_BEFORE_EVENT = 2;

/** Camera azimuth that faces each surface (0 = +Z, towards +X for positive angles). */
const FACE_AZIMUTH: Record<PrintAreaCode, number> = {
  BODY: 0,
  FRONT: 0,
  RIGHT: Math.PI / 2,
  BACK: Math.PI,
  LEFT: -Math.PI / 2,
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
  private readonly listeners: Record<ViewerEvent, Set<Listener>> = {
    contextlost: new Set(),
    error: new Set(),
  };
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
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Neutral (Khronos PBR Neutral, Q10) keeps base colours at their sRGB values below the
    // highlights, so a printed brand colour reads as chosen; ACES shifts hue and saturation.
    this.renderer.toneMapping = NeutralToneMapping;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.useEnvironment = opts.environment ?? true;
    this.lighting = lightScene(this.renderer, this.scene, this.useEnvironment);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = MIN_POLAR_RAD;
    this.controls.maxPolarAngle = MAX_POLAR_RAD;
    this.controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
    this.controls.addEventListener("change", this.invalidate);

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

  /** Replaces the model. Textures set earlier (or later) are applied to it by print area. */
  setModel(template: CustomizationTemplate, surfaces: SurfaceSet): void {
    const { model } = template;
    if (model.kind === "gltf") throw new Error("GLB models are not enabled");
    // Builds first: a template that cannot be built throws before the current model is touched.
    const { group, meshes, materials, printMeshes } = buildModelScene(model, surfaces);

    this.clearModel();
    this.materials = materials;
    this.printMeshes = printMeshes;
    this.modelMeshes = meshes;
    this.model = group;
    this.scene.add(group);
    for (const code of this.textures.keys()) this.applyTexture(code);

    const size = frameModel(this.camera, this.controls, group, model.heightMm);
    const shadow = this.contactShadow.create(size);
    if (shadow) group.add(shadow);
    this.invalidate();
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

  /** Back to the home view: front of the model, slightly above. */
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

  /** Subscribes to `contextlost` (the second lost WebGL context) or `error` (a failed render); returns the unsubscribe. */
  on(event: ViewerEvent, callback: Listener): () => void {
    this.listeners[event].add(callback);
    return () => void this.listeners[event].delete(callback);
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
    this.renderer.dispose();
  }

  private get paused(): boolean {
    return document.hidden || !this.onScreen;
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

  private emit(event: ViewerEvent, payload?: unknown) {
    for (const listener of this.listeners[event]) listener(payload);
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
    this.lighting = lightScene(this.renderer, this.scene, this.useEnvironment);
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

  private clearModel() {
    this.model?.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose();
    });
    if (this.model) this.scene.remove(this.model);
    this.model = null;
    this.materials?.dispose();
    this.materials = null;
    this.printMaterials.clear();
    this.printMeshes = [];
    this.modelMeshes = [];
  }
}
