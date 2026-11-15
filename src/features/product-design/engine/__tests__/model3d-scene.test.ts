// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Raycaster,
  Box3,
  Euler,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bakeMillimetres, loadGlb, Model3dError, resetGlbCacheForTests } from "../model3d/load";
import { printGeometry } from "../model3d/print-uv";
import { buildGlbScene, disposeGlbScene } from "../model3d/scene";
import type { Model3dRef } from "../model3d/schema";
import { createSurfaces } from "../surfaces";
import type { BagModel, CupModel } from "../template/schema";
import { buildModelScene } from "../viewer3d/scene-parts";
import { bagM, cup12oz } from "./fixtures";

vi.mock("../model3d/print-uv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../model3d/print-uv")>();
  return { ...actual, printGeometry: vi.fn(actual.printGeometry) };
});

const SAMPLE = path.resolve(process.cwd(), "public/models/sample-cup-12oz.glb");
const cupModel = cup12oz.model as CupModel;
const bagModel = bagM.model as BagModel;
const cupSurfaces = createSurfaces(cup12oz);
/** A bag template that prints only the given faces (every print area of the template must be mapped). */
const bagSurfacesOf = (...codes: string[]) =>
  createSurfaces({ ...bagM, printAreas: bagM.printAreas.filter((a) => codes.includes(a.code)) });
const bagSurfaces = bagSurfacesOf("FRONT");

beforeEach(() => resetGlbCacheForTests());
afterEach(() => resetGlbCacheForTests());

const bodyRef: Model3dRef = {
  url: "/models/sample-cup-12oz.glb",
  surfaces: [{ printAreaCode: "BODY", meshName: "print:BODY" }],
};

/** The sample file's bytes as an ArrayBuffer of its own. */
function sampleBytes(): ArrayBuffer {
  const file = readFileSync(SAMPLE);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

function expectCode(run: () => unknown, code: Model3dError["code"]) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(Model3dError);
    expect((error as Model3dError).code).toBe(code);
    return error as Model3dError;
  }
  throw new Error(`expected ${code}`);
}

async function rejection(promise: Promise<unknown>): Promise<Model3dError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Model3dError);
    return error as Model3dError;
  }
  throw new Error("expected a rejection");
}

function heightOf(mesh: Mesh): number {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox!;
  return box.max.y - box.min.y;
}

describe("loadGlb", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reads the sample file in millimetres, keeping the author's names in userData", async () => {
    const root = await loadGlb(sampleBytes());
    const body = root.getObjectByName("printBODY");
    expect(body?.userData.name).toBe("print:BODY");
    // 110 mm cup, rim tube included, not 0.11
    const geometry = (body as Mesh).geometry;
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.y).toBeGreaterThan(100);
    expect(geometry.boundingBox!.max.y).toBeLessThan(110);
    expect(root.getObjectByName("rim")).toBeInstanceOf(Mesh);
  });

  it("fetches a URL with the signal", async () => {
    const bytes = sampleBytes();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => bytes });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const root = await loadGlb("/models/sample-cup-12oz.glb", { signal: controller.signal });
    expect(root.getObjectByName("rim")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/models/sample-cup-12oz.glb",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects ABORTED when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await rejection(loadGlb(sampleBytes(), { signal: controller.signal }));
    expect(error.code).toBe("ABORTED");
  });

  it("rejects ABORTED when the signal aborts during the fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: { signal: AbortSignal }) => {
        return new Promise((_, reject) => {
          init.signal.addEventListener("abort", () => reject(new DOMException("x", "AbortError")));
        });
      }),
    );
    const controller = new AbortController();
    const pending = rejection(loadGlb("/m.glb", { signal: controller.signal }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    expect((await pending).code).toBe("ABORTED");
  });

  it("rejects LOAD_FAILED when fetch fails, answers an error status, or the bytes are not a glTF", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    expect((await rejection(loadGlb("/m-net.glb"))).code).toBe("LOAD_FAILED");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const notFound = await rejection(loadGlb("/m-404.glb"));
    expect(notFound.code).toBe("LOAD_FAILED");
    expect(notFound.message).toContain("404");

    const garbage = new TextEncoder().encode("not a model").buffer as ArrayBuffer;
    expect((await rejection(loadGlb(garbage))).code).toBe("LOAD_FAILED");
  });

  it("fails as LOAD_FAILED, not a hang, for a file that needs a Draco decoder", async () => {
    const json = JSON.stringify({
      asset: { version: "2.0" },
      extensionsUsed: ["KHR_draco_mesh_compression"],
      extensionsRequired: ["KHR_draco_mesh_compression"],
    });
    const bytes = new TextEncoder().encode(json).buffer as ArrayBuffer;
    expect((await rejection(loadGlb(bytes))).code).toBe("LOAD_FAILED");
  });

  it("gives up with LOAD_FAILED after 15 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    const pending = rejection(loadGlb("/slow.glb"));
    await vi.advanceTimersByTimeAsync(15_001);
    const error = await pending;
    expect(error.code).toBe("LOAD_FAILED");
    expect(error.message).toContain("15");
  });
});

describe("buildGlbScene (cup)", () => {
  it("builds the scene from the sample file against the real template", async () => {
    const root = await loadGlb(sampleBytes());
    const scene = buildGlbScene(root, bodyRef, cupModel, cupSurfaces);

    expect(scene.printMeshes).toHaveLength(1);
    const [print] = scene.printMeshes;
    expect(print?.code).toBe("BODY");
    expect(print?.surface).toBe(cupSurfaces.byCode.BODY);
    const geometry = print!.mesh.geometry;
    expect(geometry.getAttribute("uv")).toBeDefined();
    expect(geometry.getAttribute("uv").count).toBe(geometry.getAttribute("position").count);
    // millimetres: the printed band is about 96 mm tall
    expect(heightOf(print!.mesh)).toBeCloseTo(96.13, 0);
    expect(print!.mesh.matrixWorld.equals(new Mesh().matrixWorld)).toBe(true);
    expect(print!.mesh.parent).toBe(scene.group);
    expect(print!.mesh.material).toBe(scene.materials.base);

    expect(scene.meshes).toContain(print!.mesh);
    expect(scene.meshes.map((m) => m.name).sort()).toEqual([
      "bottom",
      "inner",
      "print:BODY",
      "rim",
      "wall",
    ]);
  });

  it("keeps the file's own materials and millimetre size on the meshes that are not printed", async () => {
    const root = await loadGlb(sampleBytes());
    const scene = buildGlbScene(root, bodyRef, cupModel, cupSurfaces);
    const rim = scene.meshes.find((m) => m.name === "rim")!;
    const bottom = scene.meshes.find((m) => m.name === "bottom")!;
    const inner = scene.meshes.find((m) => m.name === "inner")!;

    expect((rim.material as MeshStandardMaterial).name).toBe("paper-outer");
    expect((inner.material as MeshStandardMaterial).name).toBe("paper-inner");
    expect(rim.material).not.toBe(scene.materials.base);

    for (const mesh of [rim, inner]) mesh.geometry.computeBoundingBox();
    // the rim tube (3 mm) sits on the cone with its top at 110 mm, the cup's highest point
    expect(rim.geometry.boundingBox!.max.y).toBeCloseTo(110, 2);
    expect(rim.geometry.boundingBox!.max.x).toBeCloseTo(46.3, 1);
    // the inner wall starts inside the rim tube, whose centre is at 108.5 mm
    expect(inner.geometry.boundingBox!.max.y).toBeCloseTo(108.5, 1);
    bottom.geometry.computeBoundingBox();
    expect(bottom.geometry.boundingBox!.min.y).toBeCloseTo(0, 3);
    expect(bottom.geometry.boundingBox!.max.x).toBeCloseTo(30, 2);
  });

  it("gives the same shape as the parametric scene (group, meshes, materials, printMeshes)", async () => {
    const root = await loadGlb(sampleBytes());
    const scene = buildGlbScene(root, bodyRef, cupModel, cupSurfaces);
    expect(Object.keys(scene).sort()).toEqual(["group", "materials", "meshes", "printMeshes"]);
    expect(typeof scene.materials.print).toBe("function");
    expect(typeof scene.materials.onlySide).toBe("function");
    expect(scene.group).toBeInstanceOf(Group);
    for (const mesh of scene.meshes) {
      let ancestor: Object3D | null = mesh;
      while (ancestor && ancestor !== scene.group) ancestor = ancestor.parent;
      expect(ancestor).toBe(scene.group);
    }
  });

  it("MESH_MISSING when the ref points at a mesh the file does not have", async () => {
    const root = await loadGlb(sampleBytes());
    const ref: Model3dRef = {
      url: "x",
      surfaces: [{ printAreaCode: "BODY", meshName: "print:Cup_Body" }],
    };
    const error = expectCode(() => buildGlbScene(root, ref, cupModel, cupSurfaces), "MESH_MISSING");
    expect(error.message).toContain("print:Cup_Body");
  });

  it("MESH_MISSING when the mapped mesh is for another print area, or BODY is not mapped", async () => {
    const root = await loadGlb(sampleBytes());
    const wrongCode: Model3dRef = {
      url: "x",
      surfaces: [{ printAreaCode: "FRONT", meshName: "print:BODY" }],
    };
    expectCode(() => buildGlbScene(root, wrongCode, cupModel, cupSurfaces), "MESH_MISSING");
  });

  it("ignores a mapped print area that the template does not print", () => {
    const root = new Group();
    root.add(namedMesh("print:FRONT", frontQuad(260, 280)));
    root.add(namedMesh("print:BACK", frontQuad(260, 280, -60)));
    const ref: Model3dRef = {
      url: "x",
      surfaces: [
        { printAreaCode: "FRONT", meshName: "print:FRONT" },
        { printAreaCode: "BACK", meshName: "print:BACK" },
      ],
    };
    const scene = buildGlbScene(root, ref, bagModel, bagSurfacesOf("FRONT"));
    expect(scene.printMeshes.map((p) => p.code)).toEqual(["FRONT"]);
  });

  it("builds a file that differs from the template: the storefront no longer compares (checked at upload in the back-office)", async () => {
    const root = await loadGlb(sampleBytes());
    const taller: CupModel = { ...cupModel, heightMm: cupModel.heightMm + 5 };
    const scene = buildGlbScene(
      root,
      bodyRef,
      taller,
      createSurfaces({ ...cup12oz, model: taller }),
    );
    expect(scene.printMeshes.map((p) => p.code)).toEqual(["BODY"]);
  });

  it("maps the sample onto the print band where the code-built cup puts it, seam included", async () => {
    const root = await loadGlb(sampleBytes());
    const scene = buildGlbScene(root, bodyRef, cupModel, cupSurfaces);
    const built = buildModelScene(cupModel, cupSurfaces);
    const fromFile = scene.printMeshes[0]!.mesh;
    const fromCode = built.printMeshes.find((p) => p.code === "BODY")!.mesh;
    const widthMm = cupSurfaces.byCode.BODY!.flatBounds.width;
    const heightMm = cupSurfaces.byCode.BODY!.flatBounds.height;
    const radius = (cupModel.topDiameterMm + cupModel.bottomDiameterMm) / 4;
    const eps = 0.3 / radius; // 0.3 mm of arc each side of the seam
    // [angle round the axis from the seam, height]; the seam is the half-plane x = 0, z < 0
    const points: [number, number][] = [
      [eps, 50],
      [2 * Math.PI - eps, 50],
      [0.5, 20],
      [1.5, 50],
      [3, 70],
      [5, 95],
    ];
    const hit = (mesh: Mesh, angle: number, y: number) => {
      const origin = new Vector3(-200 * Math.sin(angle), y, -200 * Math.cos(angle));
      const direction = new Vector3(Math.sin(angle), 0, Math.cos(angle));
      mesh.updateMatrixWorld(true);
      const [first] = new Raycaster(origin, direction).intersectObject(mesh);
      return first;
    };
    for (const [angle, y] of points) {
      const a = hit(fromFile, angle, y);
      const b = hit(fromCode, angle, y);
      expect(a, `file at ${angle}`).toBeDefined();
      expect(b, `code at ${angle}`).toBeDefined();
      expect(a!.point.distanceTo(b!.point)).toBeLessThan(0.01);
      expect(Math.abs(a!.uv!.x - b!.uv!.x) * widthMm).toBeLessThan(0.01);
      expect(Math.abs(a!.uv!.y - b!.uv!.y) * heightMm).toBeLessThan(0.01);
    }
  });

  it("MESH_MISSING naming the print area when the file has no object for it", () => {
    const error = expectCode(
      () => buildGlbScene(new Group(), bodyRef, cupModel, cupSurfaces),
      "MESH_MISSING",
    );
    expect(error.message).toContain("BODY");
  });

  it("MESH_MISSING for an empty print group", () => {
    const root = new Group();
    const empty = new Group();
    empty.name = "print:BODY";
    root.add(empty);
    const error = expectCode(
      () => buildGlbScene(root, bodyRef, cupModel, cupSurfaces),
      "MESH_MISSING",
    );
    expect(error.message).toContain("BODY");
  });

  it("MESH_MISSING, asking for one material, for a print:BODY group of two meshes", async () => {
    const loaded = await loadGlb(sampleBytes());
    const body = loaded.getObjectByName("printBODY") as Mesh;
    const split = new Group();
    split.name = "print:BODY";
    split.userData.name = "print:BODY";
    split.add(
      new Mesh(body.geometry.clone(), body.material),
      new Mesh(body.geometry.clone(), body.material),
    );
    const root = new Group();
    root.add(split);
    const error = expectCode(
      () => buildGlbScene(root, bodyRef, cupModel, cupSurfaces),
      "MESH_MISSING",
    );
    expect(error.message).toContain("BODY");
    expect(error.message).toMatch(/một vật liệu/);
  });

  it("MESH_MISSING, asking for exactly one, when two objects carry the print name (as the loader names them)", async () => {
    const root = await loadGlb(sampleBytes());
    const body = root.getObjectByName("printBODY") as Mesh;
    const second = new Mesh(body.geometry.clone(), body.material);
    second.name = "printBODY_1";
    second.userData.name = "print:BODY";
    root.add(second);
    const children = [...root.children];
    const error = expectCode(
      () => buildGlbScene(root, bodyRef, cupModel, cupSurfaces),
      "MESH_MISSING",
    );
    expect(error.message).toContain("BODY");
    expect(error.message).toContain("print:BODY");
    expect(error.message).toMatch(/cùng tên/);
    expect(error.message).toMatch(/đúng một/);
    // nothing was touched: both objects are still in the tree
    expect(root.children).toEqual(children);
    expect(body.parent).toBe(root);
    expect(second.parent).toBe(root);
  });

  it("builds from a print name on a parent group when the mesh below it carries the same print name", async () => {
    const root = await loadGlb(sampleBytes());
    const body = root.getObjectByName("printBODY") as Mesh;
    const holder = new Group();
    holder.name = "printBODY";
    holder.userData.name = "print:BODY";
    root.add(holder);
    holder.add(body);
    const scene = buildGlbScene(root, bodyRef, cupModel, cupSurfaces);
    expect(scene.printMeshes).toHaveLength(1);
    expect(scene.printMeshes[0]?.mesh.name).toBe("print:BODY");
    // the file's own mesh left the holder; the holder stays where it was
    expect(holder.children).toHaveLength(0);
    expect(holder.parent).toBe(root);
    disposeGlbScene(scene);
  });

  it("MESH_MISSING when the print name sits on a group that holds only other print objects, and root stays as it was", () => {
    const root = new Group();
    const holder = new Group();
    holder.name = "print:FRONT";
    const other = new Mesh(new BufferGeometry(), new MeshStandardMaterial());
    other.name = "print:BACK";
    holder.add(other);
    root.add(holder);
    const ref: Model3dRef = {
      url: "x",
      surfaces: [{ printAreaCode: "FRONT", meshName: "print:FRONT" }],
    };
    const error = expectCode(() => buildGlbScene(root, ref, bagModel, bagSurfaces), "MESH_MISSING");
    expect(error.message).toContain("FRONT");
    expect(root.children).toEqual([holder]);
    expect(holder.children).toEqual([other]);
    expect(root.parent).toBeNull();
  });

  it("INVALID_MODEL, naming the print area, for a print mesh without positions, and root stays as it was", async () => {
    const root = await loadGlb(sampleBytes());
    const body = root.getObjectByName("printBODY") as Mesh;
    body.geometry.deleteAttribute("position");
    const children = [...root.children];
    const meshes: [Mesh, unknown, unknown][] = [];
    root.traverse((o) => {
      if (o instanceof Mesh) meshes.push([o, o.geometry, o.material]);
    });
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const error = expectCode(
      () => buildGlbScene(root, bodyRef, cupModel, cupSurfaces),
      "INVALID_MODEL",
    );
    expect(error.message).toContain("BODY");
    expect(root.children).toEqual(children);
    expect(root.parent).toBeNull();
    for (const [mesh, geometry, material] of meshes) {
      expect(mesh.geometry).toBe(geometry);
      expect(mesh.material).toBe(material);
    }
    expect(body.parent).toBe(root);
    expect(dispose).not.toHaveBeenCalled();
    dispose.mockRestore();
  });

  it("finds the mesh through userData.name when three has sanitised the node name", async () => {
    const root = await loadGlb(sampleBytes());
    expect(root.getObjectByName("print:BODY")).toBeUndefined();
    expect(root.getObjectByName("printBODY")).toBeDefined();
    expect(() => buildGlbScene(root, bodyRef, cupModel, cupSurfaces)).not.toThrow();
  });

  it("a mesh without UV in the file still gets UVs", async () => {
    const root = await loadGlb(sampleBytes());
    root.traverse((object) => {
      if (object instanceof Mesh) object.geometry.deleteAttribute("uv");
    });
    const scene = buildGlbScene(root, bodyRef, cupModel, cupSurfaces);
    expect(scene.printMeshes[0]!.mesh.geometry.getAttribute("uv")).toBeDefined();
  });

  it("disposeGlbScene frees geometries and materials, the file's included", async () => {
    const root = await loadGlb(sampleBytes());
    const scene = buildGlbScene(root, bodyRef, cupModel, cupSurfaces);
    const rim = scene.meshes.find((m) => m.name === "rim")!;
    const geometrySpies = scene.meshes.map((m) => vi.spyOn(m.geometry, "dispose"));
    const fileMaterial = vi.spyOn(rim.material as MeshStandardMaterial, "dispose");
    const base = vi.spyOn(scene.materials.base, "dispose");
    disposeGlbScene(scene);
    for (const spy of geometrySpies) expect(spy).toHaveBeenCalled();
    expect(fileMaterial).toHaveBeenCalled();
    expect(base).toHaveBeenCalled();
    expect(scene.group.parent).toBeNull();
  });

  it("materials.dispose() alone (what the viewer calls) frees the file's materials", async () => {
    const root = await loadGlb(sampleBytes());
    const scene = buildGlbScene(root, bodyRef, cupModel, cupSurfaces);
    const inner = scene.meshes.find((m) => m.name === "inner")!;
    const spy = vi.spyOn(inner.material as MeshStandardMaterial, "dispose");
    scene.materials.dispose();
    expect(spy).toHaveBeenCalled();
  });
});

function namedMesh(name: string, geometry: BufferGeometry): Mesh {
  const mesh = new Mesh(geometry, new MeshStandardMaterial());
  mesh.name = name;
  return mesh;
}

/** The front face of a bag: width x height, base at y = 0, plane z = +gusset / 2. */
function frontQuad(width: number, height: number, z = bagModel.gussetMm / 2): BufferGeometry {
  const g = new BufferGeometry();
  const w = width / 2;
  g.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-w, 0, z, w, 0, z, w, height, z, -w, height, z]), 3),
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

describe("buildGlbScene (bag)", () => {
  const frontRef: Model3dRef = {
    url: "x",
    surfaces: [{ printAreaCode: "FRONT", meshName: "print:FRONT" }],
  };

  it("does not block on warnings alone (a bag with one printed face)", () => {
    const root = new Group();
    root.add(namedMesh("print:FRONT", frontQuad(260, 280)));
    const scene = buildGlbScene(root, frontRef, bagModel, bagSurfaces);
    expect(scene.printMeshes.map((p) => p.code)).toEqual(["FRONT"]);
    const print = scene.printMeshes[0]!.mesh;
    expect(print.material).toBeDefined();
    expect((print.material as MeshStandardMaterial).side).toBe(FrontSide);
    // a printed face is a sheet: an inside twin on the same geometry
    const twin = scene.meshes.find((m) => m.name === "print:FRONT-inside")!;
    expect(twin.geometry).toBe(print.geometry);
    expect((twin.material as MeshStandardMaterial).side).toBe(BackSide);
    expect(scene.meshes).toContain(twin);
  });
});

/** Y interval of every triangle of a mesh, in world space. */
function triangleSpans(mesh: Mesh): [number, number][] {
  mesh.updateWorldMatrix(true, false);
  const position = mesh.geometry.getAttribute("position");
  const index = mesh.geometry.getIndex();
  const corners = index
    ? Array.from(index.array)
    : Array.from({ length: position.count }, (_, i) => i);
  const spans: [number, number][] = [];
  for (let k = 0; k + 2 < corners.length; k += 3) {
    const ys = [0, 1, 2].map(
      (c) =>
        new Vector3().fromBufferAttribute(position, corners[k + c]!).applyMatrix4(mesh.matrixWorld)
          .y,
    );
    spans.push([Math.min(...ys), Math.max(...ys)]);
  }
  return spans;
}

describe("the sample cup is a whole cup", () => {
  it("has its highest world point at Y 110 mm", async () => {
    const root = await loadGlb(sampleBytes());
    root.updateMatrixWorld(true);
    let top = -Infinity;
    root.traverse((o) => {
      if (o instanceof Mesh) top = Math.max(top, new Box3().setFromObject(o).max.y);
    });
    expect(Math.abs(top - 110)).toBeLessThan(0.01);
  });

  it("print:BODY, wall and the rim tube together cover the outer wall from the base to the top", async () => {
    const root = await loadGlb(sampleBytes());
    const meshes = ["printBODY", "wall", "rim"].map((name) => root.getObjectByName(name) as Mesh);
    expect(meshes.every((m) => m instanceof Mesh)).toBe(true);
    const spans = meshes.flatMap(triangleSpans).sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let worstGap = 0;
    for (const [from, to] of spans) {
      worstGap = Math.max(worstGap, from - covered);
      covered = Math.max(covered, to);
    }
    expect(spans[0]![0]).toBeCloseTo(0, 3);
    expect(worstGap).toBeLessThanOrEqual(0.1);
    expect(covered).toBeCloseTo(cupModel.heightMm, 2);
  });
});

describe("bakeMillimetres", () => {
  function triangle(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([0.1, 0, 0, 0, 0.2, 0, 0, 0, 0.3]), 3),
    );
    return g;
  }
  const worldVertex = (mesh: Mesh, i: number) => {
    mesh.updateWorldMatrix(true, false);
    return new Vector3()
      .fromBufferAttribute(mesh.geometry.getAttribute("position"), i)
      .applyMatrix4(mesh.matrixWorld);
  };

  function tree() {
    const shared = triangle();
    const root = new Group();
    const parent = new Group();
    parent.position.set(0.5, 0.25, -0.75);
    parent.rotation.set(0.4, 1.1, -0.3);
    parent.scale.set(2, 3, 4);
    const child = new Mesh(shared);
    child.position.set(0.1, -0.2, 0.3);
    child.rotation.set(-0.7, 0.2, 0.9);
    child.scale.set(1.5, 0.5, 2);
    parent.add(child);
    const twin = new Mesh(shared);
    twin.position.set(-0.3, 0.1, 0.2);
    root.add(parent, twin);
    return { root, parent, child, twin, shared };
  }
  const world = (t: ReturnType<typeof tree>) =>
    [t.child, t.twin].flatMap((m) => [0, 1, 2].map((i) => worldVertex(m, i)));

  it("ends at 1000 x the original world position of every vertex, nested nodes included", () => {
    const expected = world(tree()).map((v) => v.clone().multiplyScalar(1000));
    const after = tree();
    bakeMillimetres(after.root);
    world(after).forEach((v, i) => {
      expect(v.distanceTo(expected[i]!)).toBeLessThan(1e-3);
    });
  });

  it("scales a geometry shared by two nodes once", () => {
    const { root, shared } = tree();
    bakeMillimetres(root);
    expect(shared.getAttribute("position").getX(0)).toBeCloseTo(100, 3);
    expect(shared.getAttribute("position").getY(1)).toBeCloseTo(200, 3);
  });

  it("leaves node rotations and scales alone", () => {
    const { root, parent, child } = tree();
    const rotation = new Euler().copy(child.rotation);
    const [scale, parentScale] = [child.scale.clone(), parent.scale.clone()];
    bakeMillimetres(root);
    expect(child.rotation.toArray()).toEqual(rotation.toArray());
    expect(child.scale.equals(scale)).toBe(true);
    expect(parent.scale.equals(parentScale)).toBe(true);
    expect(child.position.x).toBeCloseTo(100, 3);
  });
});

describe("loadGlb abort during the parse", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is ABORTED and frees the parsed tree", async () => {
    const real = GLTFLoader.prototype.parse;
    const controller = new AbortController();
    vi.spyOn(GLTFLoader.prototype, "parse").mockImplementation(function (
      this: GLTFLoader,
      ...args
    ) {
      controller.abort();
      return real.apply(this, args);
    });
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const error = await rejection(loadGlb(sampleBytes(), { signal: controller.signal }));
    expect(error.code).toBe("ABORTED");
    // the parse finishes after the rejection; the tree is freed when it does
    await vi.waitFor(() => expect(dispose).toHaveBeenCalled());
  });
});

describe("buildGlbScene keeps the tree intact when it throws", () => {
  it("leaves root exactly as it was when printGeometry throws", async () => {
    const root = await loadGlb(sampleBytes());
    const children = [...root.children];
    const meshes: [Mesh, unknown, unknown][] = [];
    root.traverse((o) => {
      if (o instanceof Mesh) meshes.push([o, o.geometry, o.material]);
    });
    const dispose = vi.spyOn(BufferGeometry.prototype, "dispose");
    const materialDispose = vi.spyOn(MeshStandardMaterial.prototype, "dispose");
    vi.mocked(printGeometry).mockImplementationOnce(() => {
      throw new Error("boom");
    });

    const error = expectCode(
      () => buildGlbScene(root, bodyRef, cupModel, cupSurfaces),
      "INVALID_MODEL",
    );
    expect(error.message).toContain("boom");
    expect(root.children).toEqual(children);
    expect(root.parent).toBeNull();
    for (const [mesh, geometry, material] of meshes) {
      expect(mesh.geometry).toBe(geometry);
      expect(mesh.material).toBe(material);
    }
    expect(dispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    dispose.mockRestore();
    materialDispose.mockRestore();
  });
});

describe("a print node with children", () => {
  it("keeps the children in the tree, in place, instead of dropping them", () => {
    const root = new Group();
    const print = namedMesh("print:FRONT", frontQuad(260, 280));
    const child = new Mesh(new BufferGeometry(), new MeshStandardMaterial());
    child.name = "sticker";
    child.position.set(5, 6, 7);
    print.add(child);
    root.add(print);
    const ref: Model3dRef = {
      url: "x",
      surfaces: [{ printAreaCode: "FRONT", meshName: "print:FRONT" }],
    };
    const scene = buildGlbScene(root, ref, bagModel, bagSurfaces);
    expect(scene.meshes).toContain(child);
    expect(child.parent).toBe(root);
    expect(child.getWorldPosition(new Vector3()).toArray()).toEqual([5, 6, 7]);
  });
});

describe("loadGlb reasons", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("network: fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    const error = await rejection(loadGlb("/net.glb"));
    expect([error.code, error.reason]).toEqual(["LOAD_FAILED", "network"]);
  });

  it("http: an error status, with the status in the message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const error = await rejection(loadGlb("/http.glb"));
    expect([error.code, error.reason]).toEqual(["LOAD_FAILED", "http"]);
    expect(error.message).toContain("503");
  });

  it("parse: bytes that are not a glTF, and a file that needs a decoder", async () => {
    const garbage = new TextEncoder().encode("not a model").buffer as ArrayBuffer;
    expect((await rejection(loadGlb(garbage))).reason).toBe("parse");
    const draco = new TextEncoder().encode(
      JSON.stringify({
        asset: { version: "2.0" },
        extensionsUsed: ["KHR_draco_mesh_compression"],
        extensionsRequired: ["KHR_draco_mesh_compression"],
      }),
    ).buffer as ArrayBuffer;
    expect((await rejection(loadGlb(draco))).reason).toBe("parse");
  });

  it("timeout: a download that takes more than 15 s", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    const pending = rejection(loadGlb("/slow-reason.glb"));
    await vi.advanceTimersByTimeAsync(15_001);
    const error = await pending;
    expect([error.code, error.reason]).toEqual(["LOAD_FAILED", "timeout"]);
  });

  it("is not set on the other codes", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await rejection(loadGlb(sampleBytes(), { signal: controller.signal }));
    expect(error.reason).toBeUndefined();
  });
});

describe("loadGlb byte cache", () => {
  const okResponse = (bytes: ArrayBuffer) => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes,
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("two concurrent loads of one URL make one request and give two independent trees", async () => {
    const bytes = sampleBytes();
    const fetchMock = vi.fn().mockResolvedValue(okResponse(bytes));
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([loadGlb("/c1.glb"), loadGlb("/c1.glb")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).not.toBe(b);
    const [rimA, rimB] = [a, b].map((r) => r.getObjectByName("rim") as Mesh);
    expect(rimA).not.toBe(rimB);
    expect(rimA!.geometry).not.toBe(rimB!.geometry);
  });

  it("a second load makes no request and parses a copy, leaving the kept bytes alone", async () => {
    const bytes = sampleBytes();
    const size = bytes.byteLength;
    const fetchMock = vi.fn().mockResolvedValue(okResponse(bytes));
    vi.stubGlobal("fetch", fetchMock);
    const parse = vi.spyOn(GLTFLoader.prototype, "parse");

    const first = await loadGlb("/c2.glb");
    const second = await loadGlb("/c2.glb");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).not.toBe(first);
    expect(second.getObjectByName("rim")).toBeInstanceOf(Mesh);
    expect(bytes.byteLength).toBe(size);
    for (const call of parse.mock.calls) expect(call[0]).not.toBe(bytes);
    // the first tree keeps its own geometry even after the second was baked
    const rim = first.getObjectByName("rim") as Mesh;
    rim.geometry.computeBoundingBox();
    expect(rim.geometry.boundingBox!.max.y).toBeCloseTo(110, 1);
  });

  it("one caller aborting does not fail the other, and the download goes on", async () => {
    let release: (response: unknown) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise((resolve) => (release = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const quitter = new AbortController();
    const first = rejection(loadGlb("/c3.glb", { signal: quitter.signal }));
    const second = loadGlb("/c3.glb");
    await new Promise((resolve) => setTimeout(resolve, 20));
    quitter.abort();
    expect((await first).code).toBe("ABORTED");
    release(okResponse(sampleBytes()));
    expect((await second).getObjectByName("rim")).toBeInstanceOf(Mesh);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an aborted load is not remembered: the next call joins the running download", async () => {
    let release: (response: unknown) => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise((resolve) => (release = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const quitter = new AbortController();
    const first = rejection(loadGlb("/c4.glb", { signal: quitter.signal }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    quitter.abort();
    expect((await first).code).toBe("ABORTED");
    const again = loadGlb("/c4.glb");
    release(okResponse(sampleBytes()));
    expect((await again).getObjectByName("rim")).toBeInstanceOf(Mesh);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("remembers a 404 for 60 s, then tries again", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);
    const first = await rejection(loadGlb("/c5.glb"));
    expect(first.reason).toBe("http");
    const second = await rejection(loadGlb("/c5.glb"));
    expect([second.code, second.reason, second.message]).toEqual([
      "LOAD_FAILED",
      "http",
      first.message,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_001);
    fetchMock.mockResolvedValue(okResponse(sampleBytes()));
    const root = await loadGlb("/c5.glb");
    expect(root.getObjectByName("rim")).toBeInstanceOf(Mesh);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("remembers a timeout too, with the same reason", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const fetchMock = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const first = rejection(loadGlb("/c6.glb"));
    await vi.advanceTimersByTimeAsync(15_001);
    expect((await first).reason).toBe("timeout");
    const second = await rejection(loadGlb("/c6.glb"));
    expect(second.reason).toBe("timeout");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the last 4 URLs: the fifth evicts the first", async () => {
    const bytes = sampleBytes();
    const fetchMock = vi.fn().mockResolvedValue(okResponse(bytes));
    vi.stubGlobal("fetch", fetchMock);
    for (const n of [1, 2, 3, 4, 5]) await loadGlb(`/lru-${n}.glb`);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    await loadGlb("/lru-5.glb");
    await loadGlb("/lru-2.glb");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    await loadGlb("/lru-1.glb");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("does not touch an ArrayBuffer source", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const bytes = sampleBytes();
    await loadGlb(bytes);
    await loadGlb(bytes);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("buildGlbScene, template with several print areas", () => {
  const only = (...codes: string[]) =>
    createSurfaces({ ...bagM, printAreas: bagM.printAreas.filter((a) => codes.includes(a.code)) });
  const refFor = (...codes: ("FRONT" | "BACK")[]): Model3dRef => ({
    url: "x",
    surfaces: codes.map((code) => ({ printAreaCode: code, meshName: `print:${code}` })),
  });

  it("MESH_MISSING naming the print area of the template that the file does not have", () => {
    const root = new Group();
    root.add(namedMesh("print:FRONT", frontQuad(260, 280)));
    const error = expectCode(
      () => buildGlbScene(root, refFor("FRONT", "BACK"), bagModel, only("FRONT", "BACK")),
      "MESH_MISSING",
    );
    expect(error.message).toContain("BACK");
    expect(error.message).not.toContain("FRONT");
  });

  it("MESH_MISSING naming the print area of the template that the ref does not map", () => {
    const root = new Group();
    root.add(namedMesh("print:FRONT", frontQuad(260, 280)));
    root.add(namedMesh("print:BACK", frontQuad(260, 280, -60)));
    const error = expectCode(
      () => buildGlbScene(root, refFor("FRONT"), bagModel, only("FRONT", "BACK")),
      "MESH_MISSING",
    );
    expect(error.message).toContain("BACK");
  });
});
