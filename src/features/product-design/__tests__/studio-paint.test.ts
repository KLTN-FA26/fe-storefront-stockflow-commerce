import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INTERACTIVE_WARP_BUDGET_PX } from "../components/studio/paint-schedule";
import { createLivePreview, createRepaintChannel } from "../components/studio/studio-context";
import { paintSurface, releaseScratchLayer, scratchLayer } from "../components/studio/studio-paint";
import { createEditor, createSurfaces, emptyDocument, ImageCache } from "../engine";
import {
  cup12oz,
  fakeMeasure,
  FONTS,
  imageEl,
  recordingCtx,
  sizer,
  type RecordingCtx,
} from "../engine/__tests__/fixtures";

beforeEach(() => {
  // jsdom has no canvas: hand out a context that records the clears.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
      }) as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => {
  releaseScratchLayer();
  vi.restoreAllMocks();
});

describe("the shared scratch composite (N2)", () => {
  it("is one canvas for every paint, grown to the largest asked for", () => {
    const first = scratchLayer(200, 100).source as HTMLCanvasElement;
    const second = scratchLayer(400, 50).source as HTMLCanvasElement;

    expect(second).toBe(first);
    expect([second.width, second.height]).toEqual([400, 100]);
  });

  it("hands its bitmap back when released, and starts afresh after", () => {
    const used = scratchLayer(2048, 2048).source as HTMLCanvasElement;
    releaseScratchLayer();

    expect([used.width, used.height]).toEqual([0, 0]);
    const next = scratchLayer(10, 10).source as HTMLCanvasElement;
    expect(next).not.toBe(used);
    expect([next.width, next.height]).toEqual([10, 10]);
  });

  it("does nothing when released with no composite drawn", () => {
    expect(() => releaseScratchLayer()).not.toThrow();
  });
});

describe("paintSurface", () => {
  /** The studio's paint services over a 12oz cup whose body holds one wrapped picture. */
  function cupServices() {
    const document = emptyDocument(cup12oz);
    const placement = { u: 140, v: 60, rotationDeg: 0, scale: 1 };
    document.surfaces.BODY = {
      background: { kind: "none" },
      elements: [imageEl("w", { wrap: true, widthMm: 221, heightMm: 97, placement })],
    };
    return {
      editor: createEditor({ template: cup12oz, document }),
      template: cup12oz,
      surfaces: createSurfaces(cup12oz),
      sizer,
      fonts: FONTS,
      measure: fakeMeasure,
      images: new ImageCache({ maxBytes: 1 }),
      layerCache: new Map<string, CanvasImageSource>(),
      livePreview: createLivePreview(createRepaintChannel()),
    };
  }

  it("keeps a wrapped picture's remap within the budget it is given mid-gesture", () => {
    const contexts: RecordingCtx[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      const rec = recordingCtx();
      contexts.push(rec);
      return rec.ctx as unknown as CanvasRenderingContext2D;
    });
    /** The size of every remap put into a layer since the last call. */
    const remaps = () =>
      contexts
        .splice(0)
        .flatMap((rec) => rec.calls.filter(([method]) => method === "createImageData"))
        .map(([, width, height]) => Number(width) * Number(height));
    const services = cupServices();
    // Each paint on its own cache: an unchanged picture's kept sharp layer would be reused.
    const paint = (warpBudgetPx?: number) =>
      paintSurface(
        document.createElement("canvas"),
        { ...services, layerCache: new Map() },
        "BODY",
        "editor",
        6,
        { ...(warpBudgetPx === undefined ? {} : { warpBudgetPx }) },
      );

    paint();
    const [sharp] = remaps();
    paint(INTERACTIVE_WARP_BUDGET_PX);
    const [coarse, ...others] = remaps();

    expect(sharp).toBeGreaterThan(INTERACTIVE_WARP_BUDGET_PX);
    expect(coarse).toBeLessThanOrEqual(INTERACTIVE_WARP_BUDGET_PX);
    expect(others).toEqual([]);
  });
});
