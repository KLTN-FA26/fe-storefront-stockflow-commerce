import { readFileSync } from "node:fs";
import path from "node:path";

import {
  BackSide,
  BufferGeometry,
  Color,
  type DirectionalLight,
  DoubleSide,
  FrontSide,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  type Object3D,
  PlaneGeometry,
  PMREMGenerator,
  SRGBColorSpace,
  Spherical,
  Texture,
  Vector3,
  type CanvasTexture,
  type Group,
  type Scene,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadGlb, Model3dError, type Model3dRef } from "../model3d";
import { createSurfaces, cupSector } from "../surfaces";
import type { CupModel, CustomizationTemplate } from "../template/schema";
import { createMaterials, printUnderlay } from "../viewer3d/materials";
import type { LoadModel3d, Model3dState } from "../viewer3d/model3d-swap";
import { ProductViewer, type ViewerOptions } from "../viewer3d/product-viewer";
import { buildModelScene } from "../viewer3d/scene-parts";
import { isWebGLAvailable } from "../viewer3d/webgl";
import { bagM, cup12oz } from "./fixtures";

// jsdom has no WebGL, and `getContext` logs a "not implemented" error before returning null.
let getContext: ReturnType<typeof stubGetContext>;
const stubGetContext = () => vi.spyOn(HTMLCanvasElement.prototype, "getContext");

beforeEach(() => {
  getContext = stubGetContext();
  getContext.mockReturnValue(null);
});

const viewers: ProductViewer[] = [];

afterEach(() => {
  for (const viewer of viewers.splice(0)) viewer.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  setDevicePixelRatio(1);
});

function setDevicePixelRatio(value: number) {
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value });
}

function fakeRenderer() {
  const renderer = {
    outputColorSpace: "",
    toneMapping: 0,
    capabilities: { getMaxAnisotropy: () => 8 },
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  };
  return renderer as unknown as typeof renderer & WebGLRenderer;
}

function setup(opts: ViewerOptions = {}) {
  const renderer = fakeRenderer();
  const canvas = document.createElement("canvas");
  const viewer = new ProductViewer(canvas, {
    createRenderer: () => renderer,
    environment: false,
    ...opts,
  });
  viewers.push(viewer);
  return { renderer, canvas, viewer };
}

/** Replaces requestAnimationFrame with a queue the test flushes by hand. */
function stubFrames() {
  const queue = new Map<number, FrameRequestCallback>();
  let next = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queue.set(next, callback);
    return next++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
  return {
    pending: () => queue.size,
    flush(time = 1000) {
      const due = [...queue.values()];
      queue.clear();
      for (const callback of due) callback(time);
    },
  };
}

function renderedScene(renderer: { render: { mock: { calls: unknown[][] } } }): Scene {
  return renderer.render.mock.calls[0]![0] as Scene;
}

function meshNamed(scene: Scene, name: string): Mesh {
  const mesh = scene.getObjectByName(name);
  if (!(mesh instanceof Mesh)) throw new Error(`No mesh named ${name}`);
  return mesh;
}

const gltfTemplate: CustomizationTemplate = {
  ...cup12oz,
  model: { kind: "gltf", url: "/models/cup.glb", surfaces: [] },
};

const flatRect = (width: number, height: number) =>
  ({ left: 0, top: 0, right: width, bottom: height, width, height }) as DOMRect;

/** A 2D context that accepts every drawing call, enough for the procedural textures. */
function fakeContext2d() {
  const gradient = { addColorStop: vi.fn() };
  const context = new Proxy(
    {},
    { get: (_target, name) => (name === "createRadialGradient" ? () => gradient : vi.fn()) },
  );
  return context as unknown as RenderingContext;
}

function setLayout(canvas: HTMLCanvasElement, width: number, height: number) {
  Object.defineProperty(canvas, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(canvas, "clientHeight", { configurable: true, value: height });
}

describe("isWebGLAvailable", () => {
  it("reports no WebGL in jsdom", () => expect(isWebGLAvailable()).toBe(false));

  it("is true when webgl2 or, failing that, webgl yields a context", () => {
    const context = { getExtension: () => null } as unknown as WebGL2RenderingContext;
    getContext.mockImplementation(((type: string) =>
      type === "webgl2" ? context : null) as HTMLCanvasElement["getContext"]);
    expect(isWebGLAvailable()).toBe(true);

    getContext.mockImplementation(((type: string) =>
      type === "webgl" ? context : null) as HTMLCanvasElement["getContext"]);
    expect(isWebGLAvailable()).toBe(true);
  });

  it("is false when creating a context throws", () => {
    getContext.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(isWebGLAvailable()).toBe(false);
  });
});

describe("createMaterials", () => {
  const printTexture = () => new Texture() as CanvasTexture;

  it("makes paper a rough standard material and prints the texture on it", () => {
    const { base, print } = createMaterials("paper-white");
    const texture = printTexture();
    expect(base.type).toBe("MeshStandardMaterial");
    expect((base as MeshStandardMaterial).roughness).toBe(0.85);
    const printed = print(texture) as MeshStandardMaterial;
    expect(printed.type).toBe("MeshStandardMaterial");
    expect(printed.map).toBe(texture);
  });

  it("gives kraft a procedural fibre texture and tolerates a missing 2D context", () => {
    expect((createMaterials("kraft").base as MeshStandardMaterial).map).toBeNull();

    getContext.mockReturnValue(fakeContext2d());
    const { base, print } = createMaterials("kraft-brown");
    const fibre = (base as MeshStandardMaterial).map;
    expect(fibre).not.toBeNull();
    const texture = printTexture();
    const printed = print(texture) as MeshStandardMaterial;
    expect(printed.map).toBe(texture);
    expect(printed.bumpMap).toBe(fibre);
  });

  it("makes PET a visible see-through wall, not a transmissive one that vanishes on a plain backdrop", () => {
    const { base, print } = createMaterials("pet-clear");
    const clear = base as MeshPhysicalMaterial;
    expect(clear).toBeInstanceOf(MeshPhysicalMaterial);
    expect(clear.transmission).toBe(0);
    expect(clear.transparent).toBe(true);
    expect(clear.opacity).toBeGreaterThan(0.1);
    expect(clear.opacity).toBeLessThan(0.6);
    expect(clear.depthWrite).toBe(false);
    expect(clear.roughness).toBe(0.15);
    const texture = printTexture();
    const decal = print(texture) as MeshPhysicalMaterial;
    expect(decal.map).toBe(texture);
    expect(decal.transparent).toBe(true);
    expect(decal.transmission).toBe(0);
  });

  it("applies the requested side to the base only: prints are always front-side", () => {
    const { base, print } = createMaterials("kraft-white", { side: DoubleSide });
    expect(base.side).toBe(DoubleSide);
    expect(print(printTexture()).side).toBe(FrontSide);
    expect(createMaterials("paper-white").base.side).toBe(FrontSide);
    expect(createMaterials("pet-clear", { side: DoubleSide }).print(printTexture()).side).toBe(
      FrontSide,
    );
  });

  it("draws the base stock on one face only for the two sides of a sheet", () => {
    const materials = createMaterials("paper-white", { side: DoubleSide });
    const front = materials.onlySide(FrontSide) as MeshStandardMaterial;
    const back = materials.onlySide(BackSide) as MeshStandardMaterial;
    expect([front.side, back.side]).toEqual([FrontSide, BackSide]);
    expect(materials.onlySide(BackSide)).toBe(back);
    for (const sheet of [front, back]) {
      expect(sheet).not.toBe(materials.base);
      expect(sheet.roughness).toBe(0.85);
      expect(sheet.color.equals((materials.base as MeshStandardMaterial).color)).toBe(true);
    }

    const plain = createMaterials("paper-white");
    expect(plain.onlySide(FrontSide)).toBe(plain.base);
  });

  it("names the stock colour an opaque stock's print texture is painted on", () => {
    // The base material's own colour, so the printed band meets the unprinted wall without a seam.
    for (const kind of ["paper-white", "kraft-white"] as const) {
      const base = createMaterials(kind).base as MeshStandardMaterial;
      expect(new Color(printUnderlay(kind) ?? "").equals(base.color)).toBe(true);
    }
    // `compose` already multiplies kraft-brown artwork onto kraft.
    expect(printUnderlay("kraft")).toBeNull();
    expect(printUnderlay("kraft-brown")).toBeNull();
  });

  it("paints a PET print texture's empty pixels as the wall: its tint at its opacity", () => {
    // Without it the printed band would be ink alone, floating, while the unprinted wall shows.
    const base = createMaterials("pet-clear").base as MeshPhysicalMaterial;
    const underlay = printUnderlay("pet-clear") ?? "";
    const alpha = Number(/,\s*([\d.]+)\)$/.exec(underlay)?.[1]);
    expect(alpha).toBe(base.opacity);
    expect(
      new Color(underlay.replace("hsla(", "hsl(").replace(/,\s*[\d.]+\)$/, ")")).equals(base.color),
    ).toBe(true);
  });

  it("disposes the base, every print material and the one-sided variants", () => {
    const materials = createMaterials("paper-white", { side: DoubleSide });
    const printed = materials.print(printTexture());
    const inside = materials.onlySide(BackSide);
    const baseDispose = vi.spyOn(materials.base, "dispose");
    const printDispose = vi.spyOn(printed, "dispose");
    const insideDispose = vi.spyOn(inside, "dispose");
    materials.dispose();
    expect(baseDispose).toHaveBeenCalled();
    expect(printDispose).toHaveBeenCalled();
    expect(insideDispose).toHaveBeenCalled();
  });
});

describe("ProductViewer", () => {
  it("applies a texture set before the model and disposes everything", () => {
    const renderer = fakeRenderer();
    const viewer = new ProductViewer(document.createElement("canvas"), {
      createRenderer: () => renderer,
      environment: false,
    });
    viewer.setSurfaceTexture("BODY", document.createElement("canvas"));
    viewer.setModel(cup12oz, createSurfaces(cup12oz));
    expect(viewer["printMaterials"].get("BODY")).toBeDefined(); // internal map name fixed here
    viewer.dispose();
    expect(renderer.dispose).toHaveBeenCalled();
  });

  it("refuses GLB models", () => {
    const viewer = new ProductViewer(document.createElement("canvas"), {
      createRenderer: () => fakeRenderer(),
      environment: false,
    });
    expect(() => viewer.setModel(gltfTemplate, { order: [], byCode: {} })).toThrow(
      "GLB models are not enabled",
    );
  });

  it("configures the renderer for sRGB output, Neutral tone mapping and a capped pixel ratio", () => {
    setDevicePixelRatio(3);
    const { renderer } = setup();
    expect(renderer.outputColorSpace).toBe(SRGBColorSpace);
    expect(renderer.toneMapping).toBe(NeutralToneMapping);
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(2);
  });

  it("disposes geometries, materials, textures and controls", () => {
    const geometry = vi.spyOn(BufferGeometry.prototype, "dispose");
    const material = vi.spyOn(Material.prototype, "dispose");
    const texture = vi.spyOn(Texture.prototype, "dispose");
    const controls = vi.spyOn(OrbitControls.prototype, "dispose");
    const { viewer } = setup();
    viewer.setSurfaceTexture("BODY", document.createElement("canvas"));
    viewer.setModel(cup12oz, createSurfaces(cup12oz));
    viewer.dispose();
    expect(geometry).toHaveBeenCalled();
    expect(material).toHaveBeenCalled();
    expect(texture).toHaveBeenCalled();
    expect(controls).toHaveBeenCalled();
  });

  it("lays a contact shadow under the model, and only where a 2D context can paint it", () => {
    const frames = stubFrames();
    const { viewer, renderer } = setup();
    viewer.setModel(cup12oz, createSurfaces(cup12oz));
    frames.flush();
    const [model] = renderedScene(renderer).children.filter((child) => child.type === "Group");
    expect(model?.children.map((child) => child.renderOrder)).not.toContain(-1);

    getContext.mockReturnValue(fakeContext2d());
    const withShadow = setup();
    withShadow.viewer.setModel(cup12oz, createSurfaces(cup12oz));
    frames.flush();
    const group = renderedScene(withShadow.renderer).children.find(
      (child) => child.type === "Group",
    );
    const shadow = group?.children.find((child) => child.renderOrder === -1);
    expect(shadow).toBeInstanceOf(Mesh);
    expect(shadow?.position.y).toBeLessThan(0);
    expect(group?.children.filter((child) => child.renderOrder === -1)).toHaveLength(1);

    const gradient = ((shadow as Mesh).material as MeshBasicMaterial).map as Texture;
    const dispose = vi.spyOn(gradient, "dispose");
    withShadow.viewer.dispose();
    expect(dispose).toHaveBeenCalled();
  });

  it("gives the print band the artwork and every other cup part the base material", () => {
    const frames = stubFrames();
    const { viewer, renderer } = setup();
    viewer.setSurfaceTexture("BODY", document.createElement("canvas"));
    viewer.setModel(cup12oz, createSurfaces(cup12oz));
    frames.flush();
    const scene = renderedScene(renderer);

    const printed = viewer["printMaterials"].get("BODY");
    const body = meshNamed(scene, "body");
    expect(body.material).toBe(printed);
    const base = meshNamed(scene, "wall").material;
    expect(base).not.toBe(printed);
    for (const name of ["rim", "bottom", "inner"])
      expect(meshNamed(scene, name).material).toBe(base);
    expect(body.material).toHaveProperty("side", FrontSide);
    expect(meshNamed(scene, "inner").material).toHaveProperty("side", FrontSide);
  });

  it("prints the outside of each bag panel and gives it a back-side twin for the inside", () => {
    const frames = stubFrames();
    const { viewer, renderer } = setup();
    for (const code of bagM.printAreas.map((area) => area.code)) {
      viewer.setSurfaceTexture(code, document.createElement("canvas"));
    }
    viewer.setModel(bagM, createSurfaces(bagM));
    frames.flush();
    const scene = renderedScene(renderer);

    const printMaterials = viewer["printMaterials"];
    expect([...printMaterials.keys()].sort()).toEqual(["BACK", "FRONT", "LEFT", "RIGHT"]);
    for (const code of ["FRONT", "BACK", "LEFT", "RIGHT"] as const) {
      expect(meshNamed(scene, `panel-${code}`).material).toBe(printMaterials.get(code));
    }
    const base = meshNamed(scene, "fold").material;
    for (const name of ["bottom", "handle-0", "handle-1"]) {
      expect(meshNamed(scene, name).material).toBe(base);
    }
    expect(base).toHaveProperty("side", DoubleSide);

    for (const code of ["FRONT", "BACK", "LEFT", "RIGHT"] as const) {
      const [outside, inside] = [`panel-${code}`, `panel-${code}-inside`].map((name) =>
        meshNamed(scene, name),
      );
      expect(printMaterials.get(code)).toHaveProperty("side", FrontSide);
      expect(inside?.geometry).toBe(outside?.geometry);
      expect(inside?.material).toHaveProperty("side", BackSide);
      expect(inside?.material).not.toBe(printMaterials.get(code));
      expect(inside?.material).not.toBe(base);
    }
  });

  it("updates an area's texture in place instead of creating a new material", () => {
    const { viewer } = setup();
    viewer.setModel(cup12oz, createSurfaces(cup12oz));
    const first = document.createElement("canvas");
    viewer.setSurfaceTexture("BODY", first);
    const material = viewer["printMaterials"].get("BODY") as MeshStandardMaterial;
    const texture = material.map as CanvasTexture;
    const version = texture.version;

    viewer.setSurfaceTexture("BODY", first);
    expect(viewer["printMaterials"].get("BODY")).toBe(material);
    expect(material.map).toBe(texture);
    expect(texture.version).toBeGreaterThan(version);

    const second = document.createElement("canvas");
    viewer.setSurfaceTexture("BODY", second);
    expect(texture.image).toBe(second);
    expect(viewer["printMaterials"].get("BODY")).toBe(material);
  });

  it("re-allocates the texture when the canvas size changes", () => {
    const { viewer } = setup();
    viewer.setModel(cup12oz, createSurfaces(cup12oz));
    const source = document.createElement("canvas");
    viewer.setSurfaceTexture("BODY", source);
    const dispose = vi.spyOn(Texture.prototype, "dispose");

    viewer.setSurfaceTexture("BODY", source);
    expect(dispose).not.toHaveBeenCalled();
    source.width = 2048;
    viewer.setSurfaceTexture("BODY", source);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("renders once per frame however often it is invalidated, and then stops", () => {
    const frames = stubFrames();
    const { viewer, renderer } = setup();
    viewer.setModel(cup12oz, createSurfaces(cup12oz));
    viewer.setSurfaceTexture("BODY", document.createElement("canvas"));
    viewer.setSurfaceTexture("BODY", document.createElement("canvas"));
    expect(renderer.render).not.toHaveBeenCalled();

    frames.flush();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(frames.pending()).toBe(0);
  });

  it("keeps rendering while auto-rotate is on and stops when it is off", () => {
    const frames = stubFrames();
    const { viewer, renderer } = setup();
    viewer.setModel(cup12oz, createSurfaces(cup12oz));
    frames.flush();
    viewer.setAutoRotate(true);
    for (let i = 1; i <= 3; i++) frames.flush(1000 + i * 16);
    expect(renderer.render).toHaveBeenCalledTimes(4);
    expect(frames.pending()).toBe(1);

    // Damping lets the camera coast to a halt, which takes a while, but it does halt.
    viewer.setAutoRotate(false);
    for (let i = 1; i <= 1000 && frames.pending() > 0; i++) frames.flush(2000 + i * 16);
    expect(frames.pending()).toBe(0);
  });

  it("does not render while the canvas is off screen or the page is hidden", () => {
    const frames = stubFrames();
    let intersect: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof intersect) {
          intersect = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { viewer, renderer } = setup();
    viewer.setModel(cup12oz, createSurfaces(cup12oz));

    intersect!([{ isIntersecting: false }]);
    frames.flush();
    expect(renderer.render).not.toHaveBeenCalled();
    intersect!([{ isIntersecting: true }]);
    frames.flush();
    expect(renderer.render).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    viewer.setAutoRotate(true);
    frames.flush();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    frames.flush();
    expect(renderer.render).toHaveBeenCalledTimes(2);
  });

  it("resizes the renderer and camera when the canvas changes size", () => {
    const frames = stubFrames();
    let resize: (() => void) | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { viewer, renderer, canvas } = setup();
    expect(renderer.setSize).not.toHaveBeenCalled(); // jsdom lays nothing out

    setLayout(canvas, 400, 200);
    resize!();
    expect(renderer.setSize).toHaveBeenCalledWith(400, 200, false);
    expect(viewer["camera"].aspect).toBe(2);
    frames.flush();
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it("emits contextlost on the second lost WebGL context only", () => {
    const { viewer, canvas } = setup();
    const lost = vi.fn();
    const off = viewer.on("contextlost", lost);

    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(lost).not.toHaveBeenCalled();
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(lost).toHaveBeenCalledTimes(1);

    off();
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(lost).toHaveBeenCalledTimes(1);
  });

  describe("after a lost WebGL context is restored", () => {
    const lose = (canvas: HTMLCanvasElement) => {
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
      canvas.dispatchEvent(new Event("webglcontextrestored"));
    };

    it("regenerates the environment, which the restore does not bring back, and renders", () => {
      const frames = stubFrames();
      const targets: { texture: Texture; dispose: ReturnType<typeof vi.fn> }[] = [];
      vi.spyOn(PMREMGenerator.prototype, "fromScene").mockImplementation(() => {
        const target = { texture: new Texture(), dispose: vi.fn() };
        targets.push(target);
        return target as unknown as WebGLRenderTarget;
      });
      const { viewer, renderer, canvas } = setup({ environment: true });
      viewer.setModel(cup12oz, createSurfaces(cup12oz));
      frames.flush();
      renderer.render.mockClear();
      const scene = viewer["scene"];
      expect(scene.environment).toBe(targets[0]?.texture);

      lose(canvas);

      expect(targets).toHaveLength(2);
      expect(targets[0]?.dispose).toHaveBeenCalled();
      expect(scene.environment).toBe(targets[1]?.texture);
      frames.flush();
      expect(renderer.render).toHaveBeenCalledTimes(1);
    });

    it("replaces the plain lights instead of stacking them", () => {
      const frames = stubFrames();
      const { viewer, renderer, canvas } = setup();
      const scene = viewer["scene"];
      const lights = () => {
        const found: Object3D[] = [];
        scene.traverse((child) => "isLight" in child && found.push(child));
        return found;
      };
      const before = lights();
      expect(before).toHaveLength(2);

      lose(canvas);

      const after = lights();
      expect(after).toHaveLength(2);
      for (const light of after) expect(before).not.toContain(light);
      frames.flush();
      expect(renderer.render).toHaveBeenCalledTimes(1);
    });

    it("keeps contextlost for the second loss", () => {
      const { viewer, canvas } = setup();
      const lost = vi.fn();
      viewer.on("contextlost", lost);
      lose(canvas);
      expect(lost).not.toHaveBeenCalled();
    });
  });

  it("emits error when rendering throws", () => {
    const frames = stubFrames();
    const { viewer, renderer } = setup();
    const failure = new Error("shader failed");
    renderer.render.mockImplementation(() => {
      throw failure;
    });
    const onError = vi.fn();
    viewer.on("error", onError);
    viewer.setModel(cup12oz, createSurfaces(cup12oz));
    frames.flush();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("turns to the requested face and resets to the front", () => {
    const { viewer } = setup();
    viewer.setModel(bagM, createSurfaces(bagM));
    const { position, target } = {
      position: viewer["camera"].position,
      target: viewer["controls"].target,
    };
    const front = position.z - target.z;
    expect(front).toBeGreaterThan(0);

    viewer.focusSurface("BACK");
    expect(position.z - target.z).toBeLessThan(0);
    viewer.focusSurface("RIGHT");
    expect(position.x - target.x).toBeGreaterThan(0);
    expect(Math.abs(position.z - target.z)).toBeLessThan(1e-6);

    viewer.resetView();
    expect(position.z - target.z).toBeCloseTo(front, 6);
    expect(Math.abs(position.x - target.x)).toBeLessThan(1e-6);
  });

  describe("light that follows the viewer", () => {
    it("turns the environment to the camera's azimuth after each controls change", () => {
      const { viewer } = setup();
      viewer.setModel(cup12oz, createSurfaces(cup12oz));
      const scene = viewer["scene"];
      const controls = viewer["controls"];
      expect(scene.environmentRotation.y).toBeCloseTo(0);

      viewer.focusSurface("RIGHT");
      expect(scene.environmentRotation.y).toBeCloseTo(Math.PI / 2);

      // A change event alone (the camera moved by the controls) also turns it.
      controls.object.position.set(-1, 0, 0).add(controls.target);
      controls.dispatchEvent({ type: "change" });
      expect(scene.environmentRotation.y).toBeCloseTo(-Math.PI / 2);

      viewer.resetView();
      expect(scene.environmentRotation.y).toBeCloseTo(0);
    });

    it("renders after a controls change", () => {
      const frames = stubFrames();
      const { viewer, renderer } = setup();
      viewer.setModel(cup12oz, createSurfaces(cup12oz));
      frames.flush();
      renderer.render.mockClear();
      viewer["controls"].dispatchEvent({ type: "change" });
      frames.flush();
      expect(renderer.render).toHaveBeenCalledTimes(1);
    });

    it("hangs the key light on the camera, which is in the scene, when there is no environment", () => {
      const { viewer } = setup({ environment: false });
      const camera = viewer["camera"];
      expect(camera.parent).toBe(viewer["scene"]);
      const key = camera.children.find((child) => "isDirectionalLight" in child);
      expect(key).toBeDefined();
      expect((key as DirectionalLight).target.parent).toBe(camera);
    });

    it("takes the key light and the camera out of the scene on dispose", () => {
      const { viewer } = setup({ environment: false });
      const camera = viewer["camera"];
      viewer["lighting"].dispose();
      expect(camera.children).toHaveLength(0);
      expect(camera.parent).toBeNull();
    });
  });

  it("limits the orbit as specified", () => {
    const { viewer } = setup();
    viewer.setModel(cup12oz, createSurfaces(cup12oz));
    const controls = viewer["controls"];
    const height = (cup12oz.model as CupModel).heightMm;
    expect(controls.enablePan).toBe(false);
    expect(controls.enableDamping).toBe(true);
    expect(controls.minPolarAngle).toBeCloseTo(0.15 * Math.PI);
    expect(controls.maxPolarAngle).toBeCloseTo(0.85 * Math.PI);
    expect(controls.minDistance).toBeCloseTo(1.2 * height);
    expect(controls.maxDistance).toBeCloseTo(4 * height);
    const distance = viewer["camera"].position.distanceTo(controls.target);
    expect(distance).toBeGreaterThanOrEqual(controls.minDistance);
    expect(distance).toBeLessThanOrEqual(controls.maxDistance);
  });

  it("picks the surface point under the cursor, and nothing off the product", () => {
    const { viewer, canvas } = setup();
    canvas.getBoundingClientRect = () => flatRect(100, 100);
    viewer.setSurfaceTexture("BODY", document.createElement("canvas"));
    viewer.setModel(cup12oz, createSurfaces(cup12oz));

    const hit = viewer.pick(50, 50);
    const { sweepRad, midRadiusMm } = cupSector(cup12oz.model as CupModel);
    expect(hit?.surfaceCode).toBe("BODY");
    // The view looks at the cup's front, the middle of the printed width.
    expect(hit?.u).toBeCloseTo((sweepRad * midRadiusMm) / 2, 1);
    expect(hit?.v).toBeGreaterThan(0);
    expect(viewer.pick(1, 1)).toBeNull();
  });

  it("picks a bag face by its code", () => {
    const { viewer, canvas } = setup();
    canvas.getBoundingClientRect = () => flatRect(100, 100);
    viewer.setModel(bagM, createSurfaces(bagM));
    expect(viewer.pick(50, 50)?.surfaceCode).toBe("FRONT");
    viewer.focusSurface("BACK");
    expect(viewer.pick(50, 50)?.surfaceCode).toBe("BACK");
  });

  describe("pick", () => {
    /** Client coordinates (on a 100 x 100 canvas) of a world point as the camera sees it. */
    function screenPointOf(viewer: ProductViewer, world: Vector3): [number, number] {
      const camera = viewer["camera"];
      camera.updateMatrixWorld();
      const ndc = world.clone().project(camera);
      return [((ndc.x + 1) / 2) * 100, ((1 - ndc.y) / 2) * 100];
    }

    function setupBag() {
      const { viewer, canvas } = setup();
      canvas.getBoundingClientRect = () => flatRect(100, 100);
      viewer.setModel(bagM, createSurfaces(bagM));
      return viewer;
    }

    it("is null where the nearest thing is the hem in front of the artwork", () => {
      const viewer = setupBag();
      // The front of the top fold (z = half the gusset): the BACK panel lies behind it on the same ray.
      const [x, y] = screenPointOf(viewer, new Vector3(0, 300, 60));
      expect(viewer.pick(x, y)).toBeNull();
      expect(viewer.pick(50, 50)?.surfaceCode).toBe("FRONT");
    });

    it("is null where the nearest thing is a handle", () => {
      const viewer = setupBag();
      const handle = viewer["model"]?.getObjectByName("handle-0") as Mesh;
      const positions = handle.geometry.getAttribute("position");
      // The centre of one ring of the tube, a quarter of the way along the loop.
      const ring = new Vector3();
      const [ringSize, ringIndex] = [9, 12];
      for (let j = 0; j < ringSize; j++) {
        ring.add(new Vector3().fromBufferAttribute(positions, ringIndex * ringSize + j));
      }
      const [x, y] = screenPointOf(viewer, ring.divideScalar(ringSize));
      expect(viewer.pick(x, y)).toBeNull();
    });

    it("is null whenever anything that is not artwork is nearer than the artwork", () => {
      const viewer = setupBag();
      expect(viewer.pick(50, 50)?.surfaceCode).toBe("FRONT");

      // The geometry never puts a mesh in front of a front-side print face, so stand one there.
      const blocker = new Mesh(
        new PlaneGeometry(600, 600),
        new MeshBasicMaterial({ side: DoubleSide }),
      );
      blocker.position.set(0, 150, 100);
      viewer["model"]?.add(blocker);
      viewer["modelMeshes"].push(blocker);
      expect(viewer.pick(50, 50)).toBeNull();
    });

    it("is null when the ray reaches only the inside of a panel through the open mouth", () => {
      const viewer = setupBag();
      const camera = viewer["camera"];
      camera.position.set(0, 900, 150);
      camera.lookAt(0, 100, -60); // the BACK panel's inner face, seen over the open top
      expect(viewer.pick(50, 50)).toBeNull();
    });
  });

  it("renders a screenshot at the requested size and then restores the view size", async () => {
    const frames = stubFrames();
    setDevicePixelRatio(2);
    const { viewer, renderer, canvas } = setup();
    canvas.toBlob = (callback) => callback(new Blob(["png"], { type: "image/png" }));
    setLayout(canvas, 400, 300);
    viewer["resize"]();
    viewer.setModel(cup12oz, createSurfaces(cup12oz));
    frames.flush();
    renderer.setSize.mockClear();
    renderer.setPixelRatio.mockClear();
    renderer.render.mockClear();

    const blob = await viewer.screenshot({ width: 1600, height: 1200 });

    expect(blob.type).toBe("image/png");
    expect(renderer.setSize.mock.calls).toEqual([
      [1600, 1200, false],
      [400, 300, false],
    ]);
    expect(renderer.setPixelRatio.mock.calls).toEqual([[1], [2]]);
    expect(renderer.render.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(viewer["camera"].aspect).toBeCloseTo(4 / 3);
  });

  it("rejects the screenshot when the canvas cannot be encoded", async () => {
    const { viewer, canvas } = setup();
    canvas.toBlob = (callback) => callback(null);
    viewer.setModel(cup12oz, createSurfaces(cup12oz));
    await expect(viewer.screenshot({ width: 10, height: 10 })).rejects.toThrow();
  });

  it("stops rendering after dispose and ignores later calls", () => {
    const frames = stubFrames();
    const { viewer, renderer, canvas } = setup();
    viewer.setModel(cup12oz, createSurfaces(cup12oz));
    expect(frames.pending()).toBe(1);

    viewer.dispose();
    expect(frames.pending()).toBe(0);
    viewer.setAutoRotate(true);
    canvas.dispatchEvent(new Event("webglcontextlost"));
    frames.flush();
    expect(renderer.render).not.toHaveBeenCalled();
    expect(() => viewer.dispose()).not.toThrow();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });
});

describe("ProductViewer with a .glb model", () => {
  const SAMPLE = path.resolve(process.cwd(), "public/models/sample-cup-12oz.glb");
  const ref: Model3dRef = {
    url: "/models/sample-cup-12oz.glb",
    surfaces: [{ printAreaCode: "BODY", meshName: "print:BODY" }],
  };
  const surfaces = createSurfaces(cup12oz);
  const later = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** The sample file through the real loader, from the bytes of a fresh ArrayBuffer each time. */
  function loadSample(): Promise<Group> {
    const file = readFileSync(SAMPLE);
    // jsdom's ArrayBuffer is not Node's, and GLTFLoader tells bytes from JSON by `instanceof`.
    const bytes = new ArrayBuffer(file.byteLength);
    new Uint8Array(bytes).set(file);
    return loadGlb(bytes);
  }

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  /** A viewer whose loader the test settles by hand; `events` records the `model3d` states. */
  function setupLoading() {
    const gates: ReturnType<typeof deferred<Group>>[] = [];
    const signals: (AbortSignal | undefined)[] = [];
    const loadModel3d = vi.fn<LoadModel3d>((_source, opts) => {
      const gate = deferred<Group>();
      gates.push(gate);
      signals.push(opts?.signal);
      return gate.promise;
    });
    const harness = setup({ loadModel3d });
    const events: Model3dState[] = [];
    harness.viewer.on("model3d", (state) => events.push(state));
    return { ...harness, gates, signals, events, loadModel3d };
  }

  const printMeshOf = (viewer: ProductViewer) =>
    viewer["printMeshes"].find(({ code }) => code === "BODY")?.mesh;

  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("shows the parametric model at once, emits loading, then swaps the meshes when the file is ready", async () => {
    const { viewer, gates, events, loadModel3d } = setupLoading();
    const texture = document.createElement("canvas");
    viewer.setSurfaceTexture("BODY", texture);
    viewer.setModel(cup12oz, surfaces, ref);

    expect(events).toEqual([{ status: "loading" }]);
    expect(loadModel3d).toHaveBeenCalledWith(
      ref.url,
      expect.objectContaining({ signal: expect.anything() }),
    );
    const parametric = viewer["model"];
    expect(parametric?.getObjectByName("body")).toBeDefined();
    const ready = viewer.whenModelReady();

    gates[0]!.resolve(await loadSample());
    await ready;

    expect(events).toEqual([{ status: "loading" }, { status: "ready" }]);
    const group = viewer["model"];
    expect(group).not.toBe(parametric);
    expect(group?.getObjectByName("body")).toBeUndefined();
    const printed = printMeshOf(viewer);
    expect(printed?.name).toBe("print:BODY");
    expect(viewer["modelMeshes"]).toContain(printed);
    expect(printed?.geometry.getAttribute("uv")).toBeDefined();
    // The canvas set before the swap is on the new print mesh.
    expect(printed?.material).toBe(viewer["printMaterials"].get("BODY"));
    expect((printed?.material as MeshStandardMaterial).map?.image).toBe(texture);
    expect(viewer["scene"].children).toContain(group);
    expect(viewer["scene"].children).not.toContain(parametric);
    expect(warn).not.toHaveBeenCalled();
  });

  it("works end to end with the real loader on the sample file", async () => {
    const { viewer } = setup({ loadModel3d: () => loadSample() });
    const events: Model3dState[] = [];
    viewer.on("model3d", (state) => events.push(state));
    viewer.setModel(cup12oz, surfaces, ref);
    await viewer.whenModelReady();
    expect(events.map((e) => e.status)).toEqual(["loading", "ready"]);
  });

  it("emits no model3d event without a model3d", async () => {
    const { viewer, loadModel3d, events } = setupLoading();
    viewer.setModel(cup12oz, surfaces);
    viewer.setModel(cup12oz, surfaces, null);
    await viewer.whenModelReady();
    expect(events).toEqual([]);
    expect(loadModel3d).not.toHaveBeenCalled();
  });

  it("keeps the parametric model and emits failed with the code when the load fails", async () => {
    const { viewer, gates, events } = setupLoading();
    viewer.setModel(cup12oz, surfaces, ref);
    const parametric = viewer["model"];
    const ready = viewer.whenModelReady();
    gates[0]!.reject(new Model3dError("LOAD_FAILED", "HTTP 404"));
    await expect(ready).resolves.toBeUndefined();

    expect(events).toEqual([{ status: "loading" }, { status: "failed", code: "LOAD_FAILED" }]);
    expect(viewer["model"]).toBe(parametric);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("LOAD_FAILED");
    expect(warn.mock.calls[0]?.[0]).toContain("HTTP 404");
  });

  it("treats an exception that is not a Model3dError as LOAD_FAILED", async () => {
    const { viewer, gates, events } = setupLoading();
    viewer.setModel(cup12oz, surfaces, ref);
    gates[0]!.reject(new TypeError("boom"));
    await viewer.whenModelReady();
    expect(events.at(-1)).toEqual({ status: "failed", code: "LOAD_FAILED" });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("keeps the parametric model when the file has no mesh for a print area of the template", async () => {
    const { viewer, gates, events } = setupLoading();
    const missing: Model3dRef = {
      url: ref.url,
      surfaces: [{ printAreaCode: "BODY", meshName: "print:Cup_Body" }],
    };
    viewer.setModel(cup12oz, surfaces, missing);
    const parametric = viewer["model"];
    const tree = await loadSample();
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    gates[0]!.resolve(tree);
    await viewer.whenModelReady();

    expect(events.at(-1)?.status).toBe("failed");
    expect(events.at(-1)?.code).toBe("MESH_MISSING");
    expect(viewer["model"]).toBe(parametric);
    expect(dispose).toHaveBeenCalled(); // the rejected tree is freed
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("aborts the load on dispose and frees a file that arrives late", async () => {
    const { viewer, gates, signals, events } = setupLoading();
    viewer.setModel(cup12oz, surfaces, ref);
    const ready = viewer.whenModelReady();
    viewer.dispose();
    expect(signals[0]?.aborted).toBe(true);
    await expect(ready).resolves.toBeUndefined();

    const tree = await loadSample();
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    gates[0]!.resolve(tree);
    await later();
    expect(dispose).toHaveBeenCalled();
    expect(events).toEqual([{ status: "loading" }]);
  });

  it("lets only the later of two setModel calls take effect", async () => {
    const { viewer, gates, signals, events } = setupLoading();
    viewer.setModel(cup12oz, surfaces, ref);
    const first = viewer.whenModelReady();
    viewer.setModel(cup12oz, surfaces, ref);
    const second = viewer.whenModelReady();
    expect(signals.map((signal) => signal?.aborted)).toEqual([true, false]);
    await expect(first).resolves.toBeUndefined(); // an earlier promise does not hang

    const [staleTree, freshTree] = [await loadSample(), await loadSample()];
    const parametric = viewer["model"];
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    gates[0]!.resolve(staleTree);
    await later();
    staleTree.traverse((object) => {
      if (object instanceof Mesh) expect(geometryDispose.mock.contexts).toContain(object.geometry);
    });
    expect(viewer["model"]).toBe(parametric);
    expect(events).toEqual([{ status: "loading" }, { status: "loading" }]);

    gates[1]!.resolve(freshTree);
    await second;
    expect(events).toEqual([{ status: "loading" }, { status: "loading" }, { status: "ready" }]);
    expect(viewer["model"]?.children).toContain(freshTree);
  });

  it("drops and frees a file that arrives after clearModel, and emits nothing for it", async () => {
    const { viewer, gates, events } = setupLoading();
    viewer.setModel(cup12oz, surfaces, ref);
    const ready = viewer.whenModelReady();
    viewer["clearModel"]();
    await expect(ready).resolves.toBeUndefined();
    expect(viewer["model"]).toBeNull();

    const tree = await loadSample();
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    gates[0]!.resolve(tree);
    await later();
    expect(dispose).toHaveBeenCalled();
    expect(viewer["model"]).toBeNull();
    expect(events).toEqual([{ status: "loading" }]);
  });

  it("does not report a stale failure as the new model's", async () => {
    const { viewer, gates, events } = setupLoading();
    viewer.setModel(cup12oz, surfaces, ref);
    viewer.setModel(cup12oz, surfaces, ref);
    gates[0]!.reject(new Model3dError("LOAD_FAILED", "late"));
    await later();
    expect(events).toEqual([{ status: "loading" }, { status: "loading" }]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("is silent when the loader itself reports ABORTED", async () => {
    const { viewer, gates, events } = setupLoading();
    viewer.setModel(cup12oz, surfaces, ref);
    gates[0]!.reject(new Model3dError("ABORTED", "aborted"));
    await viewer.whenModelReady();
    expect(events).toEqual([{ status: "loading" }]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("answers whenModelReady for the latest setModel, and at once without a file", async () => {
    const { viewer } = setupLoading();
    await expect(viewer.whenModelReady()).resolves.toBeUndefined();
    viewer.setModel(cup12oz, surfaces, ref);
    let settled = false;
    void viewer.whenModelReady().then(() => (settled = true));
    await later();
    expect(settled).toBe(false);

    viewer.setModel(cup12oz, surfaces); // no file now
    await expect(viewer.whenModelReady()).resolves.toBeUndefined();
    expect(settled).toBe(true);
  });

  it("keeps the angle and distance the user chose when the file comes in", async () => {
    const { viewer, gates } = setupLoading();
    viewer.setModel(cup12oz, surfaces, ref);
    viewer.focusSurface("RIGHT");
    const { camera, controls } = { camera: viewer["camera"], controls: viewer["controls"] };
    camera.position.sub(controls.target).multiplyScalar(0.8).add(controls.target);
    const offset = () =>
      new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const before = offset();

    gates[0]!.resolve(await loadSample());
    await viewer.whenModelReady();

    const after = offset();
    expect(after.theta).toBeCloseTo(before.theta, 4);
    expect(after.phi).toBeCloseTo(before.phi, 4);
    expect(after.radius).toBeCloseTo(before.radius, 1);
  });

  it("re-frames target and distance, but keeps the angles, when the real box is much bigger", () => {
    const { viewer } = setup();
    viewer.setModel(cup12oz, surfaces);
    viewer.focusSurface("BACK");
    const { camera, controls } = { camera: viewer["camera"], controls: viewer["controls"] };
    const offset = () =>
      new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const homeDistance = () => controls.position0.distanceTo(controls.target0);
    const before = offset();
    const ratio = before.radius / homeDistance();
    const targetBefore = controls.target.clone();

    const model = cup12oz.model as CupModel;
    const bigger: CupModel = { ...model, heightMm: model.heightMm * 1.5 };
    viewer["attachScene"](
      buildModelScene(bigger, createSurfaces({ ...cup12oz, model: bigger })),
      bigger.heightMm,
      true,
    );

    const after = offset();
    expect(after.theta).toBeCloseTo(before.theta, 4);
    expect(after.phi).toBeCloseTo(before.phi, 4);
    expect(controls.target.y).toBeGreaterThan(targetBefore.y + 1);
    expect(after.radius / homeDistance()).toBeCloseTo(ratio, 3);
  });

  it("exports the swapped scene in a screenshot", async () => {
    const { viewer, renderer, canvas, gates } = setupLoading();
    canvas.toBlob = (callback) => callback(new Blob(["png"], { type: "image/png" }));
    viewer.setModel(cup12oz, surfaces, ref);
    gates[0]!.resolve(await loadSample());
    await viewer.whenModelReady();
    renderer.render.mockClear();

    await viewer.screenshot({ width: 64, height: 64 });
    const scene = renderer.render.mock.calls[0]![0] as Scene;
    expect(scene.getObjectByName("print:BODY")).toBeInstanceOf(Mesh);
    expect(scene.getObjectByName("body")).toBeUndefined();
  });

  it("frees the loaded file's materials and geometry when the model is replaced", async () => {
    const { viewer, gates } = setupLoading();
    viewer.setModel(cup12oz, surfaces, ref);
    gates[0]!.resolve(await loadSample());
    await viewer.whenModelReady();
    const geometry = vi.spyOn(BufferGeometry.prototype, "dispose");
    const material = vi.spyOn(Material.prototype, "dispose");
    viewer.setModel(cup12oz, surfaces);
    expect(geometry).toHaveBeenCalled();
    expect(material).toHaveBeenCalled();
  });

  it("is not stopped by a model3d listener that throws: the load, the swap and whenModelReady go on", async () => {
    const { viewer, gates, loadModel3d } = setupLoading();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const seen: Model3dState[] = [];
    viewer.on("model3d", () => {
      throw new Error("listener");
    });
    viewer.on("model3d", (state) => seen.push(state));

    expect(() => viewer.setModel(cup12oz, surfaces, ref)).not.toThrow();
    expect(loadModel3d).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ status: "loading" }]); // the listener after the throwing one
    const before = viewer["model"];
    gates[0]!.resolve(await loadSample());
    await expect(viewer.whenModelReady()).resolves.toBeUndefined();
    expect(viewer["model"]).not.toBe(before);
    expect(seen.map((s) => s.status)).toEqual(["loading", "ready"]);
    expect(error).toHaveBeenCalled();
  });

  it("treats a throwing error or contextlost listener the same way", () => {
    const { viewer, canvas } = setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lost = vi.fn();
    viewer.on("contextlost", () => {
      throw new Error("listener");
    });
    viewer.on("contextlost", lost);
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(() =>
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    ).not.toThrow();
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it("hits the file's own print mesh, and no print area where another mesh of the file is nearer", async () => {
    const { viewer, canvas, gates } = setupLoading();
    canvas.getBoundingClientRect = () => flatRect(100, 100);
    viewer.setModel(cup12oz, surfaces, ref);
    gates[0]!.resolve(await loadSample());
    await viewer.whenModelReady();

    const [printed] = viewer["printMeshes"];
    expect(printed?.mesh.name).toBe("print:BODY");
    expect(viewer["model"]?.getObjectByName("print:BODY")).toBe(printed?.mesh);
    const raycast = vi.spyOn(viewer["raycaster"], "intersectObjects");
    expect(viewer.pick(50, 50)?.surfaceCode).toBe("BODY");
    expect(raycast.mock.results[0]?.value[0].object).toBe(printed?.mesh);

    // The front of the file's rim: a mesh that is not a print mesh, nearest on that ray.
    const rim = viewer["model"]?.getObjectByName("rim") as Mesh;
    rim.updateWorldMatrix(true, false);
    const positions = rim.geometry.getAttribute("position");
    let front = new Vector3().fromBufferAttribute(positions, 0).applyMatrix4(rim.matrixWorld);
    for (let i = 1; i < positions.count; i++) {
      const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(rim.matrixWorld);
      if (point.z > front.z) front = point;
    }
    const camera = viewer["camera"];
    camera.updateMatrixWorld();
    const ndc = front.clone().project(camera);
    const [x, y] = [((ndc.x + 1) / 2) * 100, ((1 - ndc.y) / 2) * 100];
    expect(viewer.pick(x, y)).toBeNull();
    expect(raycast.mock.results.at(-1)?.value[0].object).toBe(rim);
  });

  it("frees the parametric scene once on swap and leaves the artwork texture alone", async () => {
    const { viewer, gates } = setupLoading();
    viewer.setSurfaceTexture("BODY", document.createElement("canvas"));
    viewer.setModel(cup12oz, surfaces, ref);
    const geometries = viewer["modelMeshes"].map((mesh) => mesh.geometry);
    const materials = viewer["materials"]!;
    const bundleDispose = vi.spyOn(materials, "dispose");
    const artwork = viewer["textures"].get("BODY")!.texture;
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const textureDispose = vi.spyOn(Texture.prototype, "dispose");

    gates[0]!.resolve(await loadSample());
    await viewer.whenModelReady();

    for (const geometry of geometries) {
      expect(geometryDispose.mock.contexts.filter((c) => c === geometry)).toHaveLength(1);
    }
    expect(bundleDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose.mock.contexts).not.toContain(artwork);
  });

  it("puts a texture set after the swap on the file's print mesh", async () => {
    const { viewer, gates } = setupLoading();
    viewer.setModel(cup12oz, surfaces, ref);
    gates[0]!.resolve(await loadSample());
    await viewer.whenModelReady();
    const canvas = document.createElement("canvas");
    viewer.setSurfaceTexture("BODY", canvas);
    const printed = viewer["printMeshes"][0]?.mesh;
    expect(printed?.name).toBe("print:BODY");
    expect((printed?.material as MeshStandardMaterial).map?.image).toBe(canvas);
  });

  it("keeps the parametric model, and fails with LOAD_FAILED, when the swap throws midway", async () => {
    const { viewer, gates, events } = setupLoading();
    viewer.setSurfaceTexture("BODY", document.createElement("canvas"));
    viewer.setModel(cup12oz, surfaces, ref);
    const parametric = viewer["model"];
    const meshes = viewer["modelMeshes"];
    const camera = viewer["camera"];
    const position = camera.position.clone();
    const near = camera.near;
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const parametricGeometries = meshes.map((mesh) => mesh.geometry);
    vi.spyOn(OrbitControls.prototype, "update").mockImplementationOnce(() => {
      throw new Error("update failed");
    });

    gates[0]!.resolve(await loadSample());
    await viewer.whenModelReady();

    expect(events.at(-1)).toEqual({ status: "failed", code: "LOAD_FAILED" });
    expect(viewer["model"]).toBe(parametric);
    expect(viewer["scene"].children).toContain(parametric);
    expect(viewer["modelMeshes"]).toBe(meshes);
    expect(viewer["printMaterials"].get("BODY")).toBeDefined();
    expect(camera.position.distanceTo(position)).toBeLessThan(1e-6);
    expect(camera.near).toBe(near);
    for (const geometry of parametricGeometries) {
      expect(geometryDispose.mock.contexts).not.toContain(geometry);
    }
  });
});
