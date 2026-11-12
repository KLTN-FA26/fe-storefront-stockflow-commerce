import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE_MS, INTERACTIVE_WARP_BUDGET_PX } from "../components/studio/paint-schedule";
import {
  createLivePreview,
  createRepaintChannel,
  StudioProvider,
  type StudioServices,
} from "../components/studio/studio-context";
import { useSurfacePaint } from "../components/studio/use-surface-paint";
import { useSurfaceRenderer } from "../components/studio/use-surface-renderer";
import {
  createEditor,
  createSurfaces,
  emptyDocument,
  ImageCache,
  updateElement,
  type DesignElement,
} from "../engine";
import {
  cup12oz,
  fakeMeasure,
  FONTS,
  imageEl,
  recordingCtx,
  sizer,
  textEl,
  type RecordingCtx,
} from "../engine/__tests__/fixtures";

/** Frames asked for and not run yet, by id: `nextFrame` runs them, as the browser would. */
let frames: Map<number, FrameRequestCallback>;
let lastFrame = 0;
const nextFrame = () => {
  const due = [...frames.values()];
  frames.clear();
  for (const run of due) run(0);
};
/** Every 2D context handed out since the last `remaps()`. */
let contexts: RecordingCtx[];
/** The size in px of every remap put into a layer since the last call. */
const remaps = () =>
  contexts
    .splice(0)
    .flatMap((rec) => rec.calls.filter(([method]) => method === "createImageData"))
    .map(([, width, height]) => Number(width) * Number(height));
/** How often `picture` was drawn (rasterised into a source) since the last `remaps()`. */
const sourcePaints = (picture: CanvasImageSource) =>
  contexts.flatMap((rec) =>
    rec.calls.filter(([method, image]) => method === "drawImage" && image === picture),
  ).length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  frames = new Map();
  contexts = [];
  vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
    frames.set(++lastFrame, run);
    return lastFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const rec = recordingCtx();
    contexts.push(rec);
    return rec.ctx as unknown as CanvasRenderingContext2D;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const placement = { u: 140, v: 60, rotationDeg: 0, scale: 1 };

/**
 * What the paints read of the studio, over a 12oz cup whose body holds a wrapped, decoded
 * full-height picture `w` and a plain text `t`.
 */
async function cupStudio() {
  const document = emptyDocument(cup12oz);
  document.surfaces.BODY = {
    background: { kind: "none" },
    elements: [
      imageEl("w", { wrap: true, widthMm: 221, heightMm: 97, placement }),
      textEl("t", { placement: { ...placement, v: 30 } }),
    ],
  };
  const picture = { width: 1200, height: 527 } as unknown as CanvasImageSource;
  const images = new ImageCache({
    maxBytes: 1 << 30,
    decode: async () => ({ image: picture, width: 1200, height: 527, bytes: 1200 * 527 * 4 }),
  });
  await images.load("asset-1", new Blob(["png"]), "proxy");
  const repaint = createRepaintChannel();
  const layerCache = new Map<string, CanvasImageSource>();
  const editor = createEditor({ template: cup12oz, document });
  const surfaces = createSurfaces(cup12oz);
  const services = {
    editor,
    template: cup12oz,
    surfaces,
    sizer,
    fonts: FONTS,
    measure: fakeMeasure,
    images,
    layerCache,
    repaint,
    livePreview: createLivePreview(repaint),
  } as unknown as StudioServices;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StudioProvider value={services}>{children}</StudioProvider>
  );
  /** One edit of element `id`, as one frame of a drag or a keystroke makes. */
  const edit = (id: string, patch: Partial<DesignElement>) =>
    act(() => editor.apply((doc) => updateElement(doc, "BODY", id, patch)));
  return { wrapper, layerCache, editor, surfaces, edit, picture };
}

describe("useSurfacePaint", () => {
  async function stage(pxPerMm = 4) {
    const studio = await cupStudio();
    const canvasRef = { current: document.createElement("canvas") };
    const hook = renderHook(({ px }) => useSurfacePaint(canvasRef, "BODY", "editor", px), {
      wrapper: studio.wrapper,
      initialProps: { px: pxPerMm },
    });
    nextFrame();
    const [opened, ...more] = remaps();
    expect(opened).toBeGreaterThan(INTERACTIVE_WARP_BUDGET_PX);
    expect(more).toEqual([]);
    return { ...studio, rerender: (px: number) => hook.rerender({ px }) };
  }

  it("paints a drag within the remap budget, then once sharp when it settles", async () => {
    const { edit } = await stage();
    for (let frame = 1; frame <= 3; frame++) {
      edit("w", { placement: { ...placement, v: 60 + frame } });
      nextFrame();
      const [dragged, ...more] = remaps();
      expect(dragged).toBeLessThanOrEqual(INTERACTIVE_WARP_BUDGET_PX);
      expect(more).toEqual([]);
    }

    act(() => vi.advanceTimersByTime(IDLE_MS));
    nextFrame();
    const [settled, ...more] = remaps();
    expect(settled).toBeGreaterThan(INTERACTIVE_WARP_BUDGET_PX);
    expect(more).toEqual([]);
    expect(frames.size).toBe(0);
  });

  it("typing in another element draws the picture's kept sharp layer: no remap, entry kept", async () => {
    const { edit, layerCache } = await stage();
    const kept = layerCache.get("warp-image:w@4");
    expect(kept).toBeDefined();

    for (const content of ["X", "Xi", "Xin"]) {
      edit("t", { content });
      nextFrame();
      expect(remaps()).toEqual([]);
    }
    act(() => vi.advanceTimersByTime(IDLE_MS));
    nextFrame();
    expect(remaps()).toEqual([]);
    expect(layerCache.get("warp-image:w@4")).toBe(kept);
  });

  it("paints a zoom within the remap budget, keeps nothing at the resolutions it passes, then sharp", async () => {
    const { layerCache, rerender } = await stage();
    const warpKeys = (role: string) => [...layerCache.keys()].filter((k) => k.startsWith(role));
    expect(warpKeys("warp-image:")).toEqual(["warp-image:w@4"]);

    // A pinch: a new resolution every frame.
    for (const pxPerMm of [4.5, 5, 5.5, 6]) {
      rerender(pxPerMm);
      nextFrame();
      const [zooming, ...more] = remaps();
      expect(zooming).toBeLessThanOrEqual(INTERACTIVE_WARP_BUDGET_PX);
      expect(more).toEqual([]);
    }
    expect(warpKeys("warp-image:")).toEqual(["warp-image:w@4"]);
    // The picture's source changed size on the way: kept in the one slot a zoom has per element.
    expect(warpKeys("warp-source:").sort()).toEqual(["warp-source:w@4", "warp-source:w@transient"]);

    // Settled: one sharp paint at the final resolution, kept.
    act(() => vi.advanceTimersByTime(IDLE_MS));
    nextFrame();
    const [settled, ...again] = remaps();
    expect(settled).toBeGreaterThan(INTERACTIVE_WARP_BUDGET_PX);
    expect(again).toEqual([]);
    expect(warpKeys("warp-image:")).toEqual(["warp-image:w@4", "warp-image:w@6"]);
    expect(frames.size).toBe(0);
  });

  it("does not rasterise a picture again while a pinch keeps its source at the picture's own px", async () => {
    // From 6 px/mm up, the 1200 × 527 px picture over 221 × 97 mm is its own size in every frame.
    const { rerender, picture } = await stage(6);
    for (const pxPerMm of [7, 8, 9, 10]) {
      rerender(pxPerMm);
      nextFrame();
      expect(sourcePaints(picture)).toBe(0);
      const [zooming, ...more] = remaps();
      expect(zooming).toBeLessThanOrEqual(INTERACTIVE_WARP_BUDGET_PX);
      expect(more).toEqual([]);
    }
    act(() => vi.advanceTimersByTime(IDLE_MS));
    nextFrame();
    expect(sourcePaints(picture)).toBe(0);
    expect(remaps()).toHaveLength(1);
  });
});

describe("useSurfaceRenderer", () => {
  it("paints the 3D texture of a drag within the remap budget, then once sharp when it settles", async () => {
    const { wrapper, editor, surfaces, edit } = await cupStudio();
    const onTexture = vi.fn();
    renderHook(() => useSurfaceRenderer({ surfaces, editor, onTexture }), { wrapper });
    nextFrame();
    const [opened, ...more] = remaps();
    expect(opened).toBeGreaterThan(INTERACTIVE_WARP_BUDGET_PX);
    expect(more).toEqual([]);

    for (let frame = 1; frame <= 3; frame++) {
      edit("w", { placement: { ...placement, v: 60 + frame } });
      nextFrame();
      const [dragged, ...rest] = remaps();
      expect(dragged).toBeLessThanOrEqual(INTERACTIVE_WARP_BUDGET_PX);
      expect(rest).toEqual([]);
    }

    act(() => vi.advanceTimersByTime(IDLE_MS));
    nextFrame();
    const [settled, ...again] = remaps();
    expect(settled).toBeGreaterThan(INTERACTIVE_WARP_BUDGET_PX);
    expect(again).toEqual([]);
    expect(onTexture).toHaveBeenCalledTimes(5);
  });
});
