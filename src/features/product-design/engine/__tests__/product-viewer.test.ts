import {
  BackSide,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PlaneGeometry,
  PMREMGenerator,
  SRGBColorSpace,
  Texture,
  Vector3,
  type CanvasTexture,
  type Scene,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSurfaces, cupSector } from "../surfaces";
import type { CupModel, CustomizationTemplate } from "../template/schema";
import { createMaterials, printUnderlay } from "../viewer3d/materials";
import { ProductViewer, type ViewerOptions } from "../viewer3d/product-viewer";
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

  it("makes PET a transmissive physical material and its print a transparent decal", () => {
    const { base, print } = createMaterials("pet-clear");
    const clear = base as MeshPhysicalMaterial;
    expect(clear).toBeInstanceOf(MeshPhysicalMaterial);
    expect(clear.transmission).toBe(0.9);
    expect(clear.roughness).toBe(0.15);
    const texture = printTexture();
    const decal = print(texture) as MeshPhysicalMaterial;
    expect(decal.map).toBe(texture);
    expect(decal.transparent).toBe(true);
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
    // `compose` already multiplies kraft-brown artwork onto kraft; a PET decal stays see-through.
    expect(printUnderlay("kraft")).toBeNull();
    expect(printUnderlay("kraft-brown")).toBeNull();
    expect(printUnderlay("pet-clear")).toBeNull();
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
      const lights = () => scene.children.filter((child) => "isLight" in child);
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
