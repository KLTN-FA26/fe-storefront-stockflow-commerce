import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

import {
  createCanvasExportRenderer,
  type PreviewViewer,
} from "../components/studio/export-renderer";
import { createLivePreview, createRepaintChannel } from "../components/studio/studio-context";
import {
  createEditor,
  createSurfaces,
  emptyDocument,
  ImageCache,
  MAX_BAND_PIXELS,
  type DesignDocument,
  type Model3dRef,
  type ProductViewer,
} from "../engine";
import {
  bagM,
  cup12oz,
  fakeMeasure,
  FONTS,
  imageEl,
  PNG_1x1,
  recordingCtx,
  sizer,
  type RecordingCtx,
} from "../engine/__tests__/fixtures";

/** Every decoded full-resolution image, in decode order, with its `close`. */
let decoded: { close: ReturnType<typeof vi.fn> }[];
/** The size of every canvas when it was encoded. */
let encoded: { width: number; height: number }[];
/** Every 2D context handed out, in order. */
let contexts: RecordingCtx[];

beforeEach(() => {
  decoded = [];
  encoded = [];
  contexts = [];
  // jsdom has no 2D context, no `toBlob` and no decoder: fakes that do what a browser would.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const rec = recordingCtx();
    contexts.push(rec);
    return rec.ctx as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    done: BlobCallback,
  ) {
    encoded.push({ width: this.width, height: this.height });
    done(new Blob([PNG_1x1.slice()], { type: "image/png" }));
  });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => {
      const image = { width: 1200, height: 800, close: vi.fn() };
      decoded.push(image);
      return image;
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("png")),
  );
  vi.spyOn(api, "get").mockResolvedValue({
    data: { url: "https://cdn.test/image.png", expiresAt: "2099-01-01T00:00:00Z" },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A bag with one image on its front and another on its back. */
function bagDesign(): DesignDocument {
  const doc = emptyDocument(bagM);
  doc.surfaces.FRONT = {
    background: { kind: "none" },
    elements: [imageEl("a", { assetId: "a1" })],
  };
  doc.surfaces.BACK = { background: { kind: "none" }, elements: [imageEl("b", { assetId: "a2" })] };
  return doc;
}

function renderer(
  doc: DesignDocument,
  offscreenViewer?: () => PreviewViewer | null,
  template = bagM,
  extra: { model3d?: Model3dRef | null; onScreen?: PreviewViewer } = {},
) {
  const repaint = createRepaintChannel();
  return createCanvasExportRenderer({
    ...(offscreenViewer ? { offscreenViewer } : {}),
    editor: createEditor({ template, document: doc }),
    template,
    surfaces: createSurfaces(template),
    sizer,
    fonts: FONTS,
    measure: fakeMeasure,
    images: new ImageCache({ maxBytes: 1 }),
    layerCache: new Map(),
    livePreview: createLivePreview(repaint),
    ...(extra.model3d !== undefined ? { model3d: extra.model3d } : {}),
    viewerRef: { current: extra.onScreen ? (extra.onScreen as unknown as ProductViewer) : null },
    designId: "7c1f0a00-0000-4000-8000-000000000001",
    client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  });
}

describe("the print surfaces", () => {
  it("draws a page over 16 MP in bands that each fit a canvas and keep the page's rows", async () => {
    const doc = bagDesign();
    // The bag front's bleed box is 266 × 286 mm: at 16 px/mm, 4256 × 4576 px (19.5 MP).
    const bands = await renderer(doc).printSurface("FRONT", doc, 16);

    expect(bands.map(({ heightPx }) => heightPx)).toEqual([2288, 2288]);
    // Each band holds its own rows only: no row is drawn twice in the PDF.
    expect(bands.every((band) => !("overlapPx" in band))).toBe(true);
    expect(encoded).toEqual([
      { width: 4256, height: 2288 },
      { width: 4256, height: 2288 },
    ]);
    expect(encoded.every(({ width, height }) => width * height <= MAX_BAND_PIXELS)).toBe(true);
  });

  it("draws a page a canvas can hold in one band", async () => {
    const doc = bagDesign();
    const bands = await renderer(doc).printSurface("FRONT", doc, 300 / 25.4);
    expect(bands).toHaveLength(1);
    expect(encoded).toHaveLength(1);
  });

  it("lets go of a surface's full-resolution images once that surface is drawn", async () => {
    const doc = bagDesign();
    const print = renderer(doc);
    await print.printSurface("FRONT", doc, 4);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]!.close).toHaveBeenCalled(); // before the back's images are loaded

    await print.printSurface("BACK", doc, 4);
    expect(decoded).toHaveLength(2);
    expect(decoded[1]!.close).toHaveBeenCalled();
  });

  it("lays a wrapped image of the cup on the page's own pixel grid, not turned", async () => {
    const doc = emptyDocument(cup12oz);
    const placement = { u: 140, v: 60, rotationDeg: 0, scale: 1 };
    doc.surfaces.BODY = {
      background: { kind: "none" },
      elements: [imageEl("w", { assetId: "a1", wrap: true, placement })],
    };
    await renderer(doc, undefined, cup12oz).printSurface("BODY", doc, 4);

    // The page is the canvas cleared before the paint; the remap's layers are the others.
    const page = contexts.find((rec) => rec.calls.some(([m]) => m === "clearRect"))!;
    expect(page.calls.some(([m]) => m === "rotate" || m === "transform")).toBe(false);
    const draws = page.calls.filter(([m]) => m === "drawImage");
    expect(draws).toHaveLength(1);
    for (const mm of draws[0]!.slice(2) as number[]) {
      expect(Math.abs(mm * 4 - Math.round(mm * 4))).toBeLessThan(1e-9);
    }
  });
});

describe("the customer preview", () => {
  /** A viewer that records what it is asked, and answers a screenshot of `bytes`. */
  function fakeViewer(bytes = new Uint8Array([1, 2, 3])) {
    return {
      setModel: vi.fn(),
      setSurfaceTexture: vi.fn(),
      resetView: vi.fn(),
      screenshot: vi.fn(async () => new Blob([bytes])),
      dispose: vi.fn(),
      whenModelReady: vi.fn(async () => undefined),
    } satisfies PreviewViewer;
  }

  it("shoots the model in an offscreen viewer when none is on screen (a phone in 2D)", async () => {
    const viewer = fakeViewer();
    const create = vi.fn(() => viewer);
    const bytes = await renderer(bagDesign(), create).preview(1600);

    expect([...bytes]).toEqual([1, 2, 3]);
    const [canvas] = create.mock.calls[0] as unknown as [HTMLCanvasElement];
    expect(canvas.isConnected).toBe(false);
    expect(viewer.setModel).toHaveBeenCalledWith(
      bagM,
      expect.objectContaining({ order: ["FRONT", "BACK", "LEFT", "RIGHT"] }),
      null,
    );
    expect(viewer.setSurfaceTexture.mock.calls.map(([code]) => code)).toEqual([
      "FRONT",
      "BACK",
      "LEFT",
      "RIGHT",
    ]);
    expect(viewer.resetView).toHaveBeenCalled();
    expect(viewer.screenshot).toHaveBeenCalledWith({ width: 1600, height: 1600 });
    expect(viewer.dispose).toHaveBeenCalled();
    expect(encoded).toEqual([]); // no flat picture was drawn
  });

  describe("with a .glb model", () => {
    const MODEL3D: Model3dRef = {
      url: "/models/sample-cup-12oz.glb",
      surfaces: [{ printAreaCode: "BODY", meshName: "print:BODY" }],
    };
    const cupDesign = () => emptyDocument(cup12oz);
    /** A viewer whose model is "swapped" only when its `whenModelReady` settles. */
    function swappingViewer(ready: Promise<void>) {
      const viewer = fakeViewer();
      const seen = { swappedAtShot: false, swapped: false };
      viewer.whenModelReady.mockImplementation(() => ready.then(() => void (seen.swapped = true)));
      viewer.screenshot.mockImplementation(async () => {
        seen.swappedAtShot = seen.swapped;
        return new Blob([new Uint8Array([9])]);
      });
      return { viewer, seen };
    }

    afterEach(() => vi.useRealTimers());

    it("gives the offscreen viewer the file and waits for it before the screenshot", async () => {
      let swap!: () => void;
      const { viewer, seen } = swappingViewer(new Promise<void>((done) => (swap = done)));
      const pending = renderer(cupDesign(), () => viewer, cup12oz, { model3d: MODEL3D }).preview(
        1600,
      );

      await vi.waitFor(() => expect(viewer.whenModelReady).toHaveBeenCalled());
      expect(viewer.setModel).toHaveBeenCalledWith(cup12oz, expect.anything(), MODEL3D);
      expect(viewer.screenshot).not.toHaveBeenCalled(); // still waiting
      swap(); // late, but inside the deadline
      expect([...(await pending)]).toEqual([9]);
      expect(seen.swappedAtShot).toBe(true);
      expect(viewer.dispose).toHaveBeenCalled();
    });

    it("waits in the viewer on screen too, and shoots the swapped model", async () => {
      let swap!: () => void;
      const { viewer, seen } = swappingViewer(new Promise<void>((done) => (swap = done)));
      const pending = renderer(cupDesign(), undefined, cup12oz, {
        model3d: MODEL3D,
        onScreen: viewer,
      }).preview(1600);

      await vi.waitFor(() => expect(viewer.whenModelReady).toHaveBeenCalled());
      expect(viewer.screenshot).not.toHaveBeenCalled();
      swap();
      expect([...(await pending)]).toEqual([9]);
      expect(seen.swappedAtShot).toBe(true);
      expect(viewer.resetView).toHaveBeenCalled();
      expect(viewer.dispose).not.toHaveBeenCalled(); // the studio's own viewer stays
    });

    it("shoots what is there after 15 s when the model never settles (offscreen)", async () => {
      vi.useFakeTimers();
      const viewer = fakeViewer();
      viewer.whenModelReady.mockReturnValue(new Promise<undefined>(() => undefined));
      const pending = renderer(cupDesign(), () => viewer, cup12oz, { model3d: MODEL3D }).preview(
        1600,
      );

      await vi.advanceTimersByTimeAsync(14_900);
      expect(viewer.screenshot).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      expect([...(await pending)]).toEqual([1, 2, 3]);
      expect(viewer.screenshot).toHaveBeenCalledTimes(1);
      expect(encoded).toEqual([]); // the 3D shot, not the flat one
    });

    it("shoots what is there after 15 s when the model never settles (on screen)", async () => {
      vi.useFakeTimers();
      const viewer = fakeViewer();
      viewer.whenModelReady.mockReturnValue(new Promise<undefined>(() => undefined));
      const pending = renderer(cupDesign(), undefined, cup12oz, {
        model3d: MODEL3D,
        onScreen: viewer,
      }).preview(1600);

      await vi.advanceTimersByTimeAsync(15_000);
      expect([...(await pending)]).toEqual([1, 2, 3]);
      expect(viewer.screenshot).toHaveBeenCalledTimes(1);
    });

    it("an abort ends the wait at once: no 15 s timer is left and the offscreen viewer is disposed", async () => {
      vi.useFakeTimers();
      const viewer = fakeViewer();
      viewer.whenModelReady.mockReturnValue(new Promise<undefined>(() => undefined));
      const cancel = new AbortController();
      const pending = renderer(cupDesign(), () => viewer, cup12oz, { model3d: MODEL3D }).preview(
        1600,
        cancel.signal,
      );
      const outcome = pending.catch((error: unknown) => error);
      await vi.waitFor(() => expect(viewer.whenModelReady).toHaveBeenCalled());

      cancel.abort(); // no timer advance: the abort alone ends it

      expect(await outcome).toBe(cancel.signal.reason);
      expect(viewer.dispose).toHaveBeenCalled();
      expect(viewer.screenshot).not.toHaveBeenCalled();
      expect(encoded).toEqual([]); // not redrawn flat either
      expect(vi.getTimerCount()).toBe(0);
    });

    it("leaves no timer after a normal settle", async () => {
      vi.useFakeTimers();
      const viewer = fakeViewer();
      await renderer(cupDesign(), () => viewer, cup12oz, { model3d: MODEL3D }).preview(1600);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("does not wait, and sends no file, for a print configuration without one", async () => {
      const viewer = fakeViewer();
      await renderer(cupDesign(), () => viewer, cup12oz, { model3d: null }).preview(1600);
      expect(viewer.whenModelReady).not.toHaveBeenCalled();
      expect(viewer.setModel.mock.calls[0]![2]).toBeNull();
      expect(viewer.screenshot).toHaveBeenCalled();
    });
  });

  it("draws the flat front only where there is no WebGL", async () => {
    await renderer(bagDesign(), () => null).preview(1600);
    expect(encoded).toEqual([{ width: 1600, height: 1600 }]);
  });

  it("falls back to the flat front when the offscreen render fails, and still disposes it", async () => {
    const viewer = fakeViewer();
    viewer.screenshot.mockRejectedValue(new Error("context lost"));
    await renderer(bagDesign(), () => viewer).preview(1600);
    expect(viewer.dispose).toHaveBeenCalled();
    expect(encoded).toEqual([{ width: 1600, height: 1600 }]);
  });
});
