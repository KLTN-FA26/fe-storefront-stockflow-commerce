// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ImageElement, Stroke } from "../document/schema";
import { IDENTITY } from "../geometry/affine";
import { warpBounds, warpStretch, warpToLocal, type PolarWarp } from "../geometry/polar-warp";
import type { RectMm } from "../geometry/types";
import { compose } from "../render/compose";
import { execute, type Ctx2D, type RenderEnv } from "../render/execute";
import { rememberLayer } from "../render/layer-cache";
import type { DrawOp } from "../render/ops";
import { fitGrid, MAX_LAYER_EDGE_PX, type Grid } from "../render/raster";
import { renderSurface, surfacePx } from "../render/render-surface";
import { PLACEHOLDER_MAX_SIDE_PX } from "../render/warp-source";
import {
  cupBody,
  fakeMeasure,
  FONTS,
  imageEl,
  recordingCtx,
  sizer,
  type RecordedCall,
  type RecordingCtx,
} from "./fixtures";

type Rgba = readonly [number, number, number, number];
const RED: Rgba = [255, 0, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];
const PLACEHOLDER = "#808080";
const GREY: Rgba = [128, 128, 128, 255];

/** A decoded image as the fakes see it: `width × height` px, the colour at `(u, v)` ∈ [0, 1)². */
type FakeImage = { width: number; height: number; colourAt: (u: number, v: number) => Rgba };
const asImage = (image: FakeImage) => image as unknown as CanvasImageSource;
const fakeImage = (rgba: Rgba, width = 1200, height = 800) =>
  asImage({ width, height, colourAt: () => rgba });
/** `first` on the left (or top) half, `second` on the other. */
const twoColour = (first: Rgba, second: Rgba, axis: "x" | "y") =>
  asImage({
    width: 1200,
    height: 800,
    colourAt: (u, v) => ((axis === "x" ? u : v) < 0.5 ? first : second),
  });

const rgbaOf = (css: string): Rgba => [
  Number.parseInt(css.slice(1, 3), 16),
  Number.parseInt(css.slice(3, 5), 16),
  Number.parseInt(css.slice(5, 7), 16),
  255,
];

type Layer = {
  widthPx: number;
  heightPx: number;
  source: CanvasImageSource;
  rec: RecordingCtx;
  pixels: Uint8ClampedArray;
};

/**
 * A recorded layer with real RGBA pixels: `fillRect` and `drawImage` (of a `FakeImage`) fill whole
 * pixels, `getImageData` / `putImageData` copy them out and in, as a canvas would.
 */
function pixelLayer(widthPx: number, heightPx: number) {
  const pixels = new Uint8ClampedArray(widthPx * heightPx * 4);
  const fill = (x: number, y: number, w: number, h: number, colourAt: FakeImage["colourAt"]) => {
    const [x0, y0] = [Math.max(0, Math.round(x)), Math.max(0, Math.round(y))];
    const x1 = Math.min(widthPx, Math.round(x + w));
    const y1 = Math.min(heightPx, Math.round(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        pixels.set(colourAt((px + 0.5 - x) / w, (py + 0.5 - y) / h), (py * widthPx + px) * 4);
      }
    }
  };
  const rec: RecordingCtx = recordingCtx({
    methods: {
      fillRect: (x, y, w, h) => {
        const rgba = rgbaOf(String(rec.ctx.fillStyle));
        fill(Number(x), Number(y), Number(w), Number(h), () => rgba);
      },
      drawImage: (image, x, y, w, h) =>
        fill(Number(x), Number(y), Number(w), Number(h), (image as FakeImage).colourAt),
      getImageData: (sx, sy, sw, sh) => {
        const [x, y, width, height] = [sx, sy, sw, sh].map(Number) as [
          number,
          number,
          number,
          number,
        ];
        const data = new Uint8ClampedArray(width * height * 4);
        for (let row = 0; row < height; row++) {
          const from = ((y + row) * widthPx + x) * 4;
          data.set(pixels.subarray(from, from + width * 4), row * width * 4);
        }
        return { data, width, height };
      },
      putImageData: (image, dx, dy) => {
        const { data, width, height } = image as ImageData;
        for (let row = 0; row < height; row++) {
          const at = ((Number(dy) + row) * widthPx + Number(dx)) * 4;
          pixels.set(data.subarray(row * width * 4, (row + 1) * width * 4), at);
        }
      },
    },
  });
  return { rec, pixels };
}

/** An env whose layers hold real pixels; `images` is read at each paint (assign to "decode"). */
function makeEnv(
  over: Partial<RenderEnv> = {},
  images: Record<string, CanvasImageSource> = { "asset-1": fakeImage(RED) },
) {
  const layers: Layer[] = [];
  const env: RenderEnv = {
    pxPerMm: 4,
    chrome: {
      guide: "",
      safe: "",
      bleed: "",
      seam: "",
      crease: "",
      shade: "",
      placeholder: PLACEHOLDER,
    },
    image: (id) => images[id],
    createLayer: (widthPx, heightPx) => {
      const { rec, pixels } = pixelLayer(widthPx, heightPx);
      const source = { name: `layer-${layers.length}` } as unknown as CanvasImageSource;
      layers.push({ widthPx, heightPx, source, rec, pixels });
      return { source, ctx: rec.ctx };
    },
    ...over,
  };
  return { env, layers, images };
}

type WarpedImageOp = Extract<DrawOp, { op: "warpedImage" }>;

const placement = { u: 140, v: 60, rotationDeg: 0, scale: 1 };
const wrapped = (over: Partial<ImageElement> = {}) =>
  imageEl("img", { wrap: true, placement, ...over });

const opOf = (el: ImageElement): WarpedImageOp =>
  compose({
    surface: cupBody,
    content: { background: { kind: "none" }, elements: [el] },
    target: "print",
    material: "paper-white",
    sizer,
    fonts: FONTS,
    measure: fakeMeasure,
  }).find((o): o is WarpedImageOp => o.op === "warpedImage")!;

/** The stage remaps the warp as if at the top of the arc, then turns it into place. */
const upright = (op: WarpedImageOp): PolarWarp => ({ ...op.warp, angleRad: 0 });

const methodsOf = (rec: RecordingCtx, method: string) =>
  rec.calls.filter(([name]) => name === method);

/** The layers a source was painted into (the picture, or the placeholder colour). */
const painted = (layers: Layer[]) =>
  layers.filter((l) => l.rec.calls.some(([m]) => m === "drawImage" || m === "fillRect"));
/** The layers a remap was put into. */
const destinations = (layers: Layer[]) =>
  layers.filter((l) => l.rec.calls.some(([m]) => m === "putImageData"));

/** The one `drawImage(layer, dx, dy, dw, dh)` of a paint, its rectangle in mm. */
function drawnRect(rec: RecordingCtx) {
  const draws = methodsOf(rec, "drawImage");
  expect(draws).toHaveLength(1);
  const [, image, x, y, width, height] = draws[0]! as [string, unknown, ...number[]];
  return { image, x: x!, y: y!, width: width!, height: height! };
}

/** The same rectangle on the grid at `k` px per mm, rounded (the exact path lands on whole px). */
const onGrid = (r: ReturnType<typeof drawnRect>, k: number) => ({
  x: Math.round(r.x * k),
  y: Math.round(r.y * k),
  width: Math.round(r.width * k),
  height: Math.round(r.height * k),
});

/**
 * Checks a destination layer drawn at `rect` (mm, in the frame of warp `w`) pixel by pixel: `rgba`
 * wherever the pixel centre maps a source px or more inside the box, clear a source px or more
 * outside it (between the two is the anti-aliased edge). `kSrc` is the source's px per local mm.
 * With `radii`, only pixels a destination px or more inside those radii about the apex count.
 */
function coverage(
  dest: Layer,
  rect: ReturnType<typeof drawnRect>,
  w: PolarWarp,
  kSrc: number,
  radii?: readonly [number, number],
) {
  const { box, apex } = w;
  const k = dest.widthPx / rect.width;
  const tally = { inside: 0, outside: 0, wrongInside: 0, wrongOutside: 0, colour: [] as number[] };
  for (let j = 0; j < dest.heightPx; j++) {
    for (let i = 0; i < dest.widthPx; i++) {
      const fx = rect.x + ((i + 0.5) * rect.width) / dest.widthPx;
      const fy = rect.y + ((j + 0.5) * rect.height) / dest.heightPx;
      const r = Math.hypot(fx - apex.x, fy - apex.y);
      if (radii !== undefined && (r < radii[0] + 1 / k || r > radii[1] - 1 / k)) continue;
      const p = warpToLocal(w, fx, fy);
      const marginPx =
        Math.min(p.x - box.x, box.x + box.width - p.x, p.y - box.y, box.y + box.height - p.y) *
        kSrc;
      const at = (j * dest.widthPx + i) * 4;
      if (marginPx >= 1) {
        tally.inside++;
        if (tally.colour.length === 0) tally.colour = [...dest.pixels.subarray(at, at + 4)];
        if (dest.pixels[at + 3] !== 255) tally.wrongInside++;
      } else if (marginPx <= -1) {
        tally.outside++;
        if (dest.pixels[at + 3] !== 0) tally.wrongOutside++;
      }
    }
  }
  return tally;
}

/** Source px per local mm along the tighter axis, read off the source layer's size. */
const sourceScale = (source: Layer, w: PolarWarp) =>
  Math.min(source.widthPx / w.box.width, source.heightPx / w.box.height);

/** How many bytes of two pixel arrays differ (`toEqual` crawls over large typed arrays). */
const differing = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
  a.length === b.length ? a.reduce((n, byte, i) => (byte === b[i] ? n : n + 1), 0) : Infinity;

const turns = (rec: RecordingCtx) =>
  rec.calls.filter(([m]) => m === "translate" || m === "rotate" || m === "transform");

const area = ({ widthPx, heightPx }: Layer) => widthPx * heightPx;

/** `px` rounded up to the next power of √2, as whole px: the stage's source sizes. */
const pxStep = (px: number) => Math.ceil(2 ** (Math.ceil(2 * Math.log2(px)) / 2));

/** The stage's source entry of `assetId`, whatever its size. */
/** The stage's source entries of element `id`. */
const sourceKeys = (cache: Map<string, CanvasImageSource>, id = "img") =>
  [...cache.keys()].filter((key) => key.startsWith(`warp-source:${id}@`));

/** Paints `op` once on a fresh env: its layers, the destination and where it was drawn. */
function paintOnce(
  op: WarpedImageOp,
  over: Partial<RenderEnv> = {},
  images?: Record<string, CanvasImageSource>,
) {
  const { env, layers } = makeEnv(over, images);
  const rec = recordingCtx();
  execute([op], rec.ctx, env);
  return { rec, layers, dest: destinations(layers)[0]!, rect: drawnRect(rec) };
}

describe("execute: wrapped images (warpedImage)", () => {
  it("remaps the image into one destination layer, drawn once at its opacity, no strips", () => {
    const op = opOf(wrapped({ opacity: 0.6 }));
    const rec = recordingCtx();
    const { env, layers } = makeEnv();
    execute([op], rec.ctx, env);

    // The source raster, then the destination it is remapped into.
    expect(layers).toHaveLength(2);
    const [source, dest] = [layers[0]!, layers[1]!];
    expect(methodsOf(dest.rec, "putImageData")).toHaveLength(1);
    // A fresh pixel buffer: nothing is read back from the blank destination.
    expect(methodsOf(dest.rec, "createImageData")).toEqual([
      ["createImageData", dest.widthPx, dest.heightPx],
    ]);
    expect(methodsOf(dest.rec, "getImageData")).toHaveLength(0);
    const rect = drawnRect(rec);
    expect(rect.image).toBe(dest.source);
    expect(rec.sets.globalAlpha).toEqual([0.6]);
    expect(methodsOf(rec, "fillRect")).toHaveLength(0);
    expect(methodsOf(rec, "transform")).toHaveLength(0);

    // The stage's destination is the warp at angle 0, turned into place when drawn.
    const tally = coverage(dest, rect, upright(op), sourceScale(source, op.warp));
    expect(tally).toMatchObject({ wrongInside: 0, wrongOutside: 0, colour: [...RED] });
    expect(tally.inside).toBeGreaterThan(20_000);
    expect(tally.outside).toBeGreaterThan(1_000);
  });

  it("rasterises the source for its most stretched column, smoothly, never past the image's own px", () => {
    const sourceOf = (
      el: ImageElement,
      over: Partial<RenderEnv> = {},
      images?: Record<string, CanvasImageSource>,
    ) => {
      const op = opOf(el);
      return { op, source: painted(paintOnce(op, over, images).layers)[0]! };
    };

    for (const scale of [1, 2]) {
      // Print: exactly the most stretched column's px per local mm.
      const el = wrapped({ placement: { ...placement, scale } });
      const { op, source } = sourceOf(el, { exactWarp: true });
      const k = 4 * scale * warpStretch(op.warp);
      expect(warpStretch(op.warp)).toBeGreaterThan(1);
      expect([source.widthPx, source.heightPx]).toEqual([Math.ceil(60 * k), Math.ceil(40 * k)]);
      expect(source.rec.sets.imageSmoothingQuality).toEqual(["high"]);
      // The image fills the layer exactly, unflipped: the warp mirrors it.
      expect(methodsOf(source.rec, "drawImage")).toEqual([
        ["drawImage", expect.anything(), 0, 0, source.widthPx, source.heightPx],
      ]);

      // The stage rounds each side up to a step of √2 px, so a scale or resize drag keeps it.
      const stage = sourceOf(el).source;
      expect([stage.widthPx, stage.heightPx]).toEqual([pxStep(60 * k), pxStep(40 * k)]);
      expect(stage.widthPx).toBeLessThan(60 * k * Math.SQRT2 + 1);
    }

    // A 120 × 80 px picture over 60 × 40 mm has 2 px per mm: no finer raster than that.
    for (const over of [{}, { exactWarp: true }]) {
      const coarse = sourceOf(wrapped(), over, { "asset-1": fakeImage(RED, 120, 80) }).source;
      expect([coarse.widthPx, coarse.heightPx]).toEqual([120, 80]);
    }
  });

  it("on the stage: sliding along the arc reuses the destination, turned about the apex", () => {
    const cache = new Map<string, CanvasImageSource>();
    const { env, layers } = makeEnv({ layerCache: cache });
    const first = opOf(wrapped({ placement: { ...placement, u: 120 } }));
    const moved = opOf(wrapped({ placement: { ...placement, u: 170 } }));
    expect(moved.warp.angleRad - first.warp.angleRad).toBeGreaterThan(0.1);

    const [a, b] = [recordingCtx(), recordingCtx()];
    execute([first], a.ctx, env);
    execute([moved], b.ctx, env);

    expect(destinations(layers)).toHaveLength(1);
    expect(painted(layers)).toHaveLength(1);
    expect(drawnRect(b)).toEqual(drawnRect(a));
    expect(drawnRect(b).image).toBe(destinations(layers)[0]!.source);
    const { x, y } = cupBody.apexMm!;
    const turn = (angle: number): RecordedCall[] => [
      ["translate", x, y],
      ["rotate", angle],
      ["translate", -x, -y],
    ];
    expect(turns(a)).toEqual(turn(first.warp.angleRad));
    expect(turns(b)).toEqual(turn(moved.warp.angleRad));
  });

  it("for print: remaps every paint on the output's pixel grid, drawn unturned at whole px", () => {
    const op = opOf(wrapped({ opacity: 0.5, flipX: true }));
    const cache = new Map<string, CanvasImageSource>();
    const { env, layers } = makeEnv({ layerCache: cache, exactWarp: true });
    const [a, b] = [recordingCtx(), recordingCtx()];
    execute([op], a.ctx, env);
    execute([op], b.ctx, env);

    // One source raster (kept), one destination per paint.
    expect(painted(layers)).toHaveLength(1);
    const source = painted(layers)[0]!;
    const dests = destinations(layers);
    expect(dests).toHaveLength(2);
    for (const [rec, dest] of [
      [a, dests[0]!],
      [b, dests[1]!],
    ] as const) {
      expect(turns(rec)).toEqual([]);
      expect(rec.sets.globalAlpha).toEqual([0.5]);
      const rect = drawnRect(rec);
      expect(rect.image).toBe(dest.source);
      for (const mm of [rect.x, rect.y, rect.width, rect.height]) {
        expect(Math.abs(mm * 4 - Math.round(mm * 4))).toBeLessThan(1e-9);
      }
      expect([rect.width * 4, rect.height * 4].map(Math.round)).toEqual([
        dest.widthPx,
        dest.heightPx,
      ]);
      // On the flat sheet itself, through the element's own (flipped) warp.
      const tally = coverage(dest, rect, op.warp, sourceScale(source, op.warp));
      expect(tally).toMatchObject({ wrongInside: 0, wrongOutside: 0, colour: [...RED] });
      expect(tally.inside).toBeGreaterThan(20_000);
    }
    expect(differing(dests[1]!.pixels, dests[0]!.pixels)).toBe(0);
  });

  it("keeps a source as its pixels only: a 1 px layer stands for it in the cache", () => {
    const cache = new Map<string, CanvasImageSource>();
    const { env, layers } = makeEnv({ layerCache: cache });
    execute([opOf(wrapped())], recordingCtx().ctx, env);

    expect([...cache.keys()]).toEqual(["warp-source:img@4", "warp-image:img@4"]);
    const kept = layers.find((l) => l.source === cache.get("warp-source:img@4"))!;
    expect([kept.widthPx, kept.heightPx]).toEqual([1, 1]);
    expect(kept.rec.calls).toEqual([]);
    expect([...cache.values()]).not.toContain(painted(layers)[0]!.source);
  });

  it("a new picture (assetId) misses the cache and replaces the element's entries", () => {
    const cache = new Map<string, CanvasImageSource>();
    const { env, layers } = makeEnv(
      { layerCache: cache },
      { "asset-1": fakeImage(RED), "asset-2": fakeImage(BLUE) },
    );
    execute([opOf(wrapped())], recordingCtx().ctx, env);
    const replaced = recordingCtx();
    const op = opOf(wrapped({ assetId: "asset-2" }));
    execute([op], replaced.ctx, env);

    expect(painted(layers)).toHaveLength(2);
    expect(destinations(layers)).toHaveLength(2);
    expect([...cache.keys()]).toEqual(["warp-source:img@4", "warp-image:img@4"]);
    const dest = destinations(layers)[1]!;
    expect(drawnRect(replaced).image).toBe(dest.source);
    expect(coverage(dest, drawnRect(replaced), upright(op), 1).colour).toEqual([...BLUE]);
  });

  it("paints the placeholder colour over the same warped region while loading, replaced once decoded", () => {
    const cache = new Map<string, CanvasImageSource>();
    const { env, layers, images } = makeEnv({ layerCache: cache }, {});
    const op = opOf(wrapped({ opacity: 0.8 }));
    const loading = recordingCtx();
    execute([op], loading.ctx, env);

    const source = painted(layers)[0]!;
    expect(methodsOf(source.rec, "fillRect")).toEqual([
      ["fillRect", 0, 0, source.widthPx, source.heightPx],
    ]);
    expect(methodsOf(loading, "fillRect")).toHaveLength(0);
    expect(loading.sets.globalAlpha).toEqual([0.8]);
    const placeholder = destinations(layers)[0]!;
    expect(drawnRect(loading).image).toBe(placeholder.source);
    const kSrc = sourceScale(source, op.warp);
    const tally = coverage(placeholder, drawnRect(loading), upright(op), kSrc);
    expect(tally).toMatchObject({ wrongInside: 0, wrongOutside: 0, colour: [...GREY] });

    // Still loading: the repaint draws what was kept.
    execute([op], recordingCtx().ctx, env);
    expect(painted(layers)).toHaveLength(1);
    expect(destinations(layers)).toHaveLength(1);

    // Decoded: the picture replaces both entries, over exactly the same pixels.
    images["asset-1"] = fakeImage(RED);
    const decoded = recordingCtx();
    execute([op], decoded.ctx, env);
    const dest = destinations(layers)[1]!;
    expect(painted(layers)).toHaveLength(2);
    expect([...cache.keys()]).toEqual(["warp-source:img@4", "warp-image:img@4"]);
    expect(drawnRect(decoded)).toEqual({ ...drawnRect(loading), image: dest.source });
    expect(coverage(dest, drawnRect(decoded), upright(op), kSrc).colour).toEqual([...RED]);
    const alpha = (layer: Layer) => layer.pixels.filter((_, i) => i % 4 === 3);
    expect(differing(alpha(dest), alpha(placeholder))).toBe(0);
  });

  it("keeps a big picture's placeholder small, and paints it once for every repaint", () => {
    const cache = new Map<string, CanvasImageSource>();
    const { env, layers } = makeEnv({ layerCache: cache, pxPerMm: 6 }, {});
    // 60 × 40 mm × 20: its source would be 8192 px on a side if it were sized like a picture.
    const op = opOf(wrapped({ placement: { ...placement, scale: 20 } }));
    execute([op], recordingCtx().ctx, env);
    execute([op], recordingCtx().ctx, env);

    const sources = painted(layers);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.widthPx).toBeLessThanOrEqual(PLACEHOLDER_MAX_SIDE_PX);
    expect(sources[0]!.heightPx).toBeLessThanOrEqual(PLACEHOLDER_MAX_SIDE_PX);
    expect(destinations(layers)).toHaveLength(1);
  });

  describe("the stage cache", () => {
    it("draws the kept sharp layer for a gesture elsewhere on the surface: no remap, entry kept", () => {
      const cache = new Map<string, CanvasImageSource>();
      const { env, layers } = makeEnv({ layerCache: cache });
      const budgeted = { ...env, warpBudgetPx: 5_000 };
      const op = opOf(wrapped());
      const sharp = recordingCtx();
      execute([op], sharp.ctx, env);
      const kept = cache.get("warp-image:img@4");

      // Typing in another element: the surface paints with the budget, this picture is unchanged.
      for (let frame = 0; frame < 3; frame++) {
        const busy = recordingCtx();
        execute([op], busy.ctx, budgeted);
        expect(drawnRect(busy)).toEqual(drawnRect(sharp));
      }
      expect(destinations(layers)).toHaveLength(1);
      expect(cache.get("warp-image:img@4")).toBe(kept);

      // Dragging this picture: its own budgeted remap replaces the stale entry, then is reused…
      const moved = opOf(wrapped({ placement: { ...placement, v: 50 } }));
      execute([moved], recordingCtx().ctx, budgeted);
      execute([moved], recordingCtx().ctx, budgeted);
      expect(destinations(layers)).toHaveLength(2);
      expect(area(destinations(layers)[1]!)).toBeLessThanOrEqual(5_000);
      // …until the sharp paint once the gesture ends.
      execute([moved], recordingCtx().ctx, env);
      expect(destinations(layers)).toHaveLength(3);
      expect(area(destinations(layers)[2]!)).toBeGreaterThan(5_000);
    });

    it("keeps one source entry per element through a scale drag across several steps", () => {
      const cache = new Map<string, CanvasImageSource>();
      const { env, layers } = makeEnv({ layerCache: cache });
      for (const scale of [0.5, 0.7, 0.9, 1.1, 1.3, 1.5]) {
        execute([opOf(wrapped({ placement: { ...placement, scale } }))], recordingCtx().ctx, env);
      }
      expect(painted(layers).length).toBeGreaterThan(2);
      expect(sourceKeys(cache)).toEqual(["warp-source:img@4"]);
    });

    it("misses when flipX, flipY, the radius, the scale or the resolution changes", () => {
      const cache = new Map<string, CanvasImageSource>();
      // A 2 px/mm picture: its source resolution is capped, so it says nothing of scale or zoom.
      const lowRes = { "asset-1": fakeImage(RED, 120, 80) };
      const { env, layers } = makeEnv({ layerCache: cache }, lowRes);
      const built = (over: Partial<ImageElement>, envOver: Partial<RenderEnv> = {}) => {
        const rec = recordingCtx();
        execute([opOf(wrapped(over))], rec.ctx, { ...env, ...envOver });
        const dests = destinations(layers);
        expect(drawnRect(rec).image).toBe(dests.at(-1)!.source);
        return dests.length;
      };

      expect(built({})).toBe(1);
      expect(built({})).toBe(1);
      expect(built({ flipX: true })).toBe(2);
      expect(built({ flipY: true })).toBe(3);
      expect(built({ placement: { ...placement, v: 50 } })).toBe(4);
      expect(built({ placement: { ...placement, scale: 1.5 } })).toBe(5);
      expect(built({}, { pxPerMm: 5 })).toBe(6);
      expect(built({}, { pxPerMm: 5 })).toBe(6);
    });

    it("keeps one source and one destination per element through a drag across 20 radii", () => {
      const cache = new Map<string, CanvasImageSource>();
      const { env } = makeEnv({ layerCache: cache });
      const stroke: Stroke = {
        mode: "draw",
        color: "#123456",
        sizeMm: 2,
        points: [
          [0, 0, 0.5],
          [20, 5, 0.5],
        ],
      };
      const pen: DrawOp = {
        op: "drawing",
        id: "pen",
        matrix: IDENTITY,
        box: { x: -2, y: -2, width: 26, height: 12 },
        strokes: [stroke],
        opacity: 1,
      };
      execute([pen], recordingCtx().ctx, env);
      // The other layers of a busy design fill most of the cache.
      for (let i = 0; i < 50; i++) {
        rememberLayer(cache, `other-${i}`, { name: `other-${i}` } as unknown as CanvasImageSource);
      }

      for (let frame = 0; frame < 20; frame++) {
        const op = opOf(wrapped({ placement: { ...placement, v: 40 + frame } }));
        execute([op], recordingCtx().ctx, env);
      }
      const own = [...cache.keys()].filter((key) => key.startsWith("warp-"));
      expect(own).toEqual([...sourceKeys(cache), "warp-image:img@4"]);
      expect(sourceKeys(cache)).toHaveLength(1);
      expect(cache.has("drawing:pen@4")).toBe(true);
      expect(cache.size).toBe(53);
    });

    it("re-rasterises the source only when a scale drag crosses a √2 step", () => {
      const cache = new Map<string, CanvasImageSource>();
      const { env, layers } = makeEnv({ layerCache: cache });
      const scales = [1, 1.01, 1.02, 1.03, 1.04];
      for (const scale of scales) {
        execute([opOf(wrapped({ placement: { ...placement, scale } }))], recordingCtx().ctx, env);
      }
      expect(destinations(layers)).toHaveLength(scales.length);
      expect(painted(layers)).toHaveLength(1);
    });

    it("re-rasterises the source only when a resize drag crosses a √2 step of its px size", () => {
      const cache = new Map<string, CanvasImageSource>();
      const { env, layers } = makeEnv({ layerCache: cache });
      // Shift-resizing a picture: each side follows the pointer on its own.
      const sizes = [
        [60, 40],
        [61, 40.25],
        [62, 40.5],
        [63, 40.75],
        [64, 41],
      ] as const;
      let last = recordingCtx();
      for (const [widthMm, heightMm] of sizes) {
        last = recordingCtx();
        execute([opOf(wrapped({ widthMm, heightMm }))], last.ctx, env);
      }
      expect(destinations(layers)).toHaveLength(sizes.length);
      expect(painted(layers)).toHaveLength(1);
      expect(sourceKeys(cache)).toHaveLength(1);

      // The raster painted for 60 × 40 mm is read over the 64 × 41 mm box: edges where they belong.
      const op = opOf(wrapped({ widthMm: 64, heightMm: 41 }));
      const dest = destinations(layers).at(-1)!;
      const source = painted(layers)[0]!;
      const tally = coverage(dest, drawnRect(last), upright(op), sourceScale(source, op.warp));
      expect(tally).toMatchObject({ wrongInside: 0, wrongOutside: 0, colour: [...RED] });

      // Wide enough to need the next step: painted again, at the larger size.
      execute([opOf(wrapped({ widthMm: 90, heightMm: 41 }))], recordingCtx().ctx, env);
      expect(painted(layers)).toHaveLength(2);
      expect(painted(layers)[1]!.widthPx).toBeGreaterThan(source.widthPx);
    });
  });

  describe("a zoom (a new resolution every frame)", () => {
    /** One frame of a pinch: a passing resolution, remapped within the gesture budget. */
    const zoomFrame = (op: WarpedImageOp, env: RenderEnv, pxPerMm: number) =>
      execute([op], recordingCtx().ctx, {
        ...env,
        pxPerMm,
        transientResolution: true,
        warpBudgetPx: 5_000,
      });
    const destinationKeys = (cache: Map<string, CanvasImageSource>) =>
      [...cache.keys()].filter((key) => key.startsWith("warp-image:"));

    it("does not rasterise the source again while its px size stays the picture's own", () => {
      const cache = new Map<string, CanvasImageSource>();
      // 4 px per mm over 60 × 40 mm: from 4 px/mm up, the source is the picture's own 240 × 160 px.
      const lowRes = { "asset-1": fakeImage(RED, 240, 160) };
      const { env, layers } = makeEnv({ layerCache: cache, pxPerMm: 8 }, lowRes);
      const op = opOf(wrapped());
      execute([op], recordingCtx().ctx, env);
      const source = painted(layers)[0]!;
      expect([source.widthPx, source.heightPx]).toEqual([240, 160]);
      const before = [...cache.keys()].sort();

      for (const pxPerMm of [9, 10, 11, 12]) zoomFrame(op, env, pxPerMm);
      // One remap per frame and none kept: the next frame asks for another resolution.
      expect(painted(layers)).toHaveLength(1);
      expect(destinations(layers)).toHaveLength(5);
      expect([...cache.keys()].sort()).toEqual(before);

      // Settled: painted sharp at the last resolution and kept, still from the same source.
      execute([op], recordingCtx().ctx, { ...env, pxPerMm: 12 });
      expect(painted(layers)).toHaveLength(1);
      expect(sourceKeys(cache)).toEqual(["warp-source:img@8"]);
      expect(destinationKeys(cache)).toEqual(["warp-image:img@8", "warp-image:img@12"]);
    });

    it("rasterises the source again only when its px size crosses a step, in one more slot", () => {
      const cache = new Map<string, CanvasImageSource>();
      const { env, layers } = makeEnv({ layerCache: cache });
      const op = opOf(wrapped());
      execute([op], recordingCtx().ctx, env);

      const pinch = [4.2, 4.4, 4.6, 4.8, 5, 5.2, 5.4, 5.6, 5.8, 6];
      // The stage's source size at each resolution: the 1200 × 800 px picture caps none of them.
      const sizeAt = (pxPerMm: number) => {
        const k = pxPerMm * warpStretch(op.warp);
        return `${pxStep(60 * k)}x${pxStep(40 * k)}`;
      };
      const sizes = [env.pxPerMm, ...pinch].map(sizeAt);
      const steps = sizes.filter((size, i) => i > 0 && size !== sizes[i - 1]).length;
      expect(steps).toBeGreaterThan(0);
      expect(steps).toBeLessThan(pinch.length / 2);

      for (const pxPerMm of pinch) zoomFrame(op, env, pxPerMm);
      expect(painted(layers)).toHaveLength(1 + steps);
      // The stage's own slot and one for the resolutions a zoom passes: no entry per frame or step.
      expect(sourceKeys(cache).sort()).toEqual(["warp-source:img@4", "warp-source:img@transient"]);
      expect(destinationKeys(cache)).toEqual(["warp-image:img@4"]);

      // Settled at the last resolution: the zoom's source, not a new one.
      execute([op], recordingCtx().ctx, { ...env, pxPerMm: 6 });
      expect(painted(layers)).toHaveLength(1 + steps);
      expect(sourceKeys(cache)).toHaveLength(2);
    });
  });

  describe("bounded destinations on the stage", () => {
    it("while a gesture lasts, stays within the env's budget over the same region; print ignores it", () => {
      const op = opOf(wrapped());
      const budget = 5_000;
      const sharp = paintOnce(op);
      const coarse = paintOnce(op, { warpBudgetPx: budget });

      expect(area(sharp.dest)).toBeGreaterThan(4 * budget);
      expect(area(coarse.dest)).toBeLessThanOrEqual(budget);
      // Drawn scaled up over (at least) the same rectangle, and right at its own resolution.
      expect(coarse.rect.x).toBeLessThanOrEqual(sharp.rect.x);
      expect(coarse.rect.y).toBeLessThanOrEqual(sharp.rect.y);
      expect(coarse.rect.x + coarse.rect.width).toBeGreaterThanOrEqual(
        sharp.rect.x + sharp.rect.width,
      );
      expect(coarse.rect.y + coarse.rect.height).toBeGreaterThanOrEqual(
        sharp.rect.y + sharp.rect.height,
      );
      const kSrc = sourceScale(painted(coarse.layers)[0]!, op.warp);
      const tally = coverage(coarse.dest, coarse.rect, upright(op), kSrc);
      expect(tally).toMatchObject({ wrongInside: 0, wrongOutside: 0, colour: [...RED] });

      const print = paintOnce(op, { exactWarp: true });
      const printBudgeted = paintOnce(op, { exactWarp: true, warpBudgetPx: budget });
      expect(printBudgeted.rect).toEqual({ ...print.rect, image: printBudgeted.dest.source });
      expect(differing(printBudgeted.dest.pixels, print.dest.pixels)).toBe(0);
    });

    it("a picture scaled ×5 or ×20 is remapped no finer than its source, within the sheet's radii", () => {
      for (const scale of [5, 20]) {
        const op = opOf(wrapped({ placement: { ...placement, scale } }));
        const [inner, outer] = op.sheetRadiiMm;
        const { layers, dest, rect } = paintOnce(op, { pxPerMm: 6 });
        const kDst = dest.widthPx / rect.width;

        // Its whole warped box at the stage's 6 px/mm would be millions of pixels.
        const whole = warpBounds(upright(op));
        expect(whole.width * whole.height * 36).toBeGreaterThan(2_500_000);
        expect(area(dest)).toBeLessThan(1_500_000);
        // The picture has 20 px per mm over 60 mm: spread over `scale` times that, it has fewer.
        expect(kDst).toBeLessThan(6);
        // Cut to the sheet: at angle 0 the outer radius is the top, apex.y − outer.
        expect(rect.y).toBeGreaterThanOrEqual(cupBody.apexMm!.y - outer - 2 / kDst);
        expect(inner).toBeLessThan(outer);
        // ...and all of the picture that lies on the sheet is there.
        const kSrc = sourceScale(painted(layers)[0]!, op.warp);
        const tally = coverage(dest, rect, upright(op), kSrc, op.sheetRadiiMm);
        expect(tally).toMatchObject({ wrongInside: 0, colour: [...RED] });
        expect(tally.inside).toBeGreaterThan(10_000);
      }
    });
  });

  describe("mirroring", () => {
    /** Colours of the opaque destination pixels farthest left, right, up and down (unturned). */
    function extremes(op: WarpedImageOp, image: CanvasImageSource) {
      const { dest, rect } = paintOnce(op, {}, { "asset-1": image });
      const far = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
      const colours: Record<keyof typeof far, number[]> = {
        left: [],
        right: [],
        top: [],
        bottom: [],
      };
      for (let j = 0; j < dest.heightPx; j++) {
        for (let i = 0; i < dest.widthPx; i++) {
          const at = (j * dest.widthPx + i) * 4;
          if (dest.pixels[at + 3] !== 255) continue;
          const rgba = [...dest.pixels.subarray(at, at + 4)];
          const x = rect.x + ((i + 0.5) * rect.width) / dest.widthPx;
          const y = rect.y + ((j + 0.5) * rect.height) / dest.heightPx;
          if (x < far.left) [far.left, colours.left] = [x, rgba];
          if (x > far.right) [far.right, colours.right] = [x, rgba];
          if (y < far.top) [far.top, colours.top] = [y, rgba];
          if (y > far.bottom) [far.bottom, colours.bottom] = [y, rgba];
        }
      }
      return colours;
    }

    it("flipX swaps left and right, flipY top and bottom, pixel for pixel", () => {
      const sideBySide = twoColour(RED, BLUE, "x");
      const stacked = twoColour(RED, BLUE, "y");
      const at = (over: Partial<ImageElement>, image: CanvasImageSource) =>
        extremes(opOf(wrapped(over)), image);
      const [red, blue] = [[...RED], [...BLUE]];

      expect(at({}, sideBySide)).toMatchObject({ left: red, right: blue });
      expect(at({ flipX: true }, sideBySide)).toMatchObject({ left: blue, right: red });
      expect(at({ flipY: true }, sideBySide)).toMatchObject({ left: red, right: blue });
      expect(at({}, stacked)).toMatchObject({ top: red, bottom: blue });
      expect(at({ flipY: true }, stacked)).toMatchObject({ top: blue, bottom: red });
      expect(at({ flipX: true }, stacked)).toMatchObject({ top: red, bottom: blue });
    });
  });

  describe("print bands", () => {
    const { flatBounds } = cupBody;
    const sheet = surfacePx(flatBounds, 4);
    const fakeCanvas = (ctx: Ctx2D) =>
      ({
        width: 0,
        height: 0,
        getContext: (kind: string) => (kind === "2d" ? ctx : null),
      }) as unknown as HTMLCanvasElement;

    /** Renders `op` (exact) over `rows` of the sheet; the destination and where it landed, in px. */
    function band(op: WarpedImageOp, rows?: { y0Px: number; heightPx: number }) {
      const rec = recordingCtx();
      const { env, layers } = makeEnv({ exactWarp: true });
      renderSurface(fakeCanvas(rec.ctx), [op], env, flatBounds, rows);
      return { dest: layers.at(-1)!, at: onGrid(drawnRect(rec), 4) };
    }

    /** Whether `part`'s pixels are `whole`'s at the same sheet px. */
    function sameAsWhole(part: ReturnType<typeof band>, whole: ReturnType<typeof band>) {
      let differing = 0;
      for (let row = 0; row < part.at.height; row++) {
        for (let col = 0; col < part.at.width; col++) {
          const [x, y] = [part.at.x + col - whole.at.x, part.at.y + row - whole.at.y];
          const a = (row * part.dest.widthPx + col) * 4;
          const b = (y * whole.dest.widthPx + x) * 4;
          for (let c = 0; c < 4; c++) {
            if (part.dest.pixels[a + c] !== whole.dest.pixels[b + c]) differing++;
          }
        }
      }
      return differing;
    }

    it("each band remaps only its own rows, and two bands join without a seam", () => {
      const op = opOf(wrapped({ opacity: 0.7 }));
      const whole = band(op);
      const split = whole.at.y + Math.floor(whole.at.height / 2);
      const top = band(op, { y0Px: 0, heightPx: split });
      const bottom = band(op, { y0Px: split, heightPx: sheet.height - split });

      expect(top.at).toEqual({ ...whole.at, height: split - whole.at.y });
      expect(bottom.at).toEqual({
        ...whole.at,
        y: split,
        height: whole.at.y + whole.at.height - split,
      });
      expect([top.dest.heightPx, bottom.dest.heightPx]).toEqual([top.at.height, bottom.at.height]);
      expect(sameAsWhole(top, whole)).toBe(0);
      expect(sameAsWhole(bottom, whole)).toBe(0);

      // A band the image does not reach remaps nothing.
      const rec = recordingCtx();
      const { env, layers } = makeEnv({ exactWarp: true });
      renderSurface(fakeCanvas(rec.ctx), [op], env, flatBounds, { y0Px: 0, heightPx: 8 });
      expect(layers).toHaveLength(0);
      expect(methodsOf(rec, "drawImage")).toHaveLength(0);
    });

    it("never remaps past the sheet: an image hanging off its edge is cut there", () => {
      const op = opOf(wrapped({ placement: { ...placement, u: 5 } }));
      const { env, layers } = makeEnv({ exactWarp: true });
      const free = recordingCtx();
      execute([op], free.ctx, env);
      const loose = { dest: layers[1]!, at: onGrid(drawnRect(free), 4) };
      expect(loose.at.x).toBeLessThan(0);

      const cut = band(op);
      expect(cut.at).toEqual({ ...loose.at, x: 0, width: loose.at.width + loose.at.x });
      expect(sameAsWhole(cut, loose)).toBe(0);
    });
  });
});

describe("fitGrid", () => {
  const bounds: RectMm = { x: 10.3, y: -4.2, width: 2, height: 200 };
  const covers = (grid: Grid, b: RectMm) => {
    expect(grid.x / grid.k).toBeLessThanOrEqual(b.x);
    expect(grid.y / grid.k).toBeLessThanOrEqual(b.y);
    expect((grid.x + grid.width) / grid.k).toBeGreaterThanOrEqual(b.x + b.width);
    expect((grid.y + grid.height) / grid.k).toBeGreaterThanOrEqual(b.y + b.height);
  };

  it("snaps the bounds outward to whole px at the given resolution, cut to the target", () => {
    expect(fitGrid(bounds, 4)).toEqual({ x: 41, y: -17, width: 9, height: 801, k: 4 });
    const target = { x: 0, y: 0, width: 45, height: 100 };
    expect(fitGrid(bounds, 4, { target })).toEqual({ x: 41, y: 0, width: 4, height: 100, k: 4 });
    expect(fitGrid(bounds, 4, { target: { x: 100, y: 0, width: 10, height: 10 } })).toBeUndefined();
  });

  it("lays a rectangle longer than a layer may be on a coarser grid that still covers it", () => {
    // 200 mm at 45 px/mm is 9000 px: past the layer edge limit.
    expect(200 * 45).toBeGreaterThan(MAX_LAYER_EDGE_PX);
    const grid = fitGrid(bounds, 45)!;
    expect(Math.max(grid.width, grid.height)).toBeLessThanOrEqual(MAX_LAYER_EDGE_PX);
    expect(grid.k).toBeLessThan(45);
    expect(grid.k).toBeGreaterThan(45 * 0.9);
    covers(grid, bounds);

    const small = fitGrid(bounds, 45, { maxEdgePx: 100 })!;
    expect(Math.max(small.width, small.height)).toBeLessThanOrEqual(100);
    covers(small, bounds);
  });

  it("keeps the area within a budget, still covering the bounds", () => {
    for (const maxAreaPx of [1_000, 5_000, 77_777]) {
      const grid = fitGrid(bounds, 45, { maxAreaPx })!;
      expect(grid.width * grid.height).toBeLessThanOrEqual(maxAreaPx);
      expect(grid.k).toBeLessThan(45);
      covers(grid, bounds);
    }
  });
});
