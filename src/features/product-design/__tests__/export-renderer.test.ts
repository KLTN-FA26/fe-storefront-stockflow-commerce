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
} from "../engine";
import {
  bagM,
  fakeMeasure,
  FONTS,
  imageEl,
  PNG_1x1,
  recordingCtx,
  sizer,
} from "../engine/__tests__/fixtures";

/** Every decoded full-resolution image, in decode order, with its `close`. */
let decoded: { close: ReturnType<typeof vi.fn> }[];
/** The size of every canvas when it was encoded. */
let encoded: { width: number; height: number }[];

beforeEach(() => {
  decoded = [];
  encoded = [];
  // jsdom has no 2D context, no `toBlob` and no decoder: fakes that do what a browser would.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => recordingCtx().ctx as unknown as CanvasRenderingContext2D,
  );
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

function renderer(doc: DesignDocument, offscreenViewer?: () => PreviewViewer | null) {
  const repaint = createRepaintChannel();
  return createCanvasExportRenderer({
    ...(offscreenViewer ? { offscreenViewer } : {}),
    editor: createEditor({ template: bagM, document: doc }),
    template: bagM,
    surfaces: createSurfaces(bagM),
    sizer,
    fonts: FONTS,
    measure: fakeMeasure,
    images: new ImageCache({ maxBytes: 1 }),
    layerCache: new Map(),
    livePreview: createLivePreview(repaint),
    viewerRef: { current: null },
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
    expect(bands.map(({ overlapPx }) => overlapPx)).toEqual([1, 0]);
    // The top band also draws the bottom band's first row, which that band covers again (N5).
    expect(encoded).toEqual([
      { width: 4256, height: 2289 },
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
