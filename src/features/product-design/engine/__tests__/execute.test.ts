// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { PATTERN_IDS, type ImageElement, type Stroke } from "../document/schema";
import { applyToPoint, IDENTITY, type Mat2D } from "../geometry/affine";
import type { PathCmd, RectMm } from "../geometry/types";
import { strokePolygon } from "../render/brush";
import { compose } from "../render/compose";
import { execute, type RenderEnv } from "../render/execute";
import type { ComposeTarget, DrawOp } from "../render/ops";
import { drawPattern } from "../render/patterns";
import { renderSurface } from "../render/render-surface";
import { layoutText } from "../render/text-layout";
import {
  cupBody,
  drawingEl,
  fakeMeasure,
  FONTS,
  imageEl,
  recordingCtx,
  sizer,
  textEl,
  type RecordingCtx,
} from "./fixtures";

type Layer = { widthPx: number; heightPx: number; source: CanvasImageSource; rec: RecordingCtx };

const photo = { name: "photo" } as unknown as CanvasImageSource;

/** Distinct fake strings: the executor owns no colours, the studio supplies them from CSS. */
const chrome: RenderEnv["chrome"] = {
  guide: "chrome-guide",
  safe: "chrome-safe",
  bleed: "chrome-bleed",
  seam: "chrome-seam",
  crease: "chrome-crease",
  shade: "chrome-shade",
  placeholder: "chrome-placeholder",
};

/** An env whose layers are recorded fakes; `images` is the asset id → decoded image lookup. */
function makeEnv(over: Partial<RenderEnv> = {}, images: Record<string, CanvasImageSource> = {}) {
  const layers: Layer[] = [];
  const env: RenderEnv = {
    pxPerMm: 4,
    chrome,
    image: (id) => images[id],
    createLayer: (widthPx, heightPx) => {
      const rec = recordingCtx();
      const source = { name: `layer-${layers.length}` } as unknown as CanvasImageSource;
      layers.push({ widthPx, heightPx, source, rec });
      return { source, ctx: rec.ctx };
    },
    ...over,
  };
  return { env, layers };
}

const placed: Mat2D = [1, 0, 0, 1, 10, 20];

const twoLines = layoutText(
  textEl("t", { content: "Xin chào\nThế giới", sizePt: 24 }),
  FONTS,
  fakeMeasure,
);
const textOp = (over: Partial<Extract<DrawOp, { op: "text" }>> = {}): DrawOp => ({
  op: "text",
  matrix: placed,
  layout: twoLines,
  color: "#112233",
  opacity: 0.5,
  ...over,
});

const imageOp = (assetId = "asset-1"): DrawOp => ({
  op: "image",
  matrix: placed,
  box: { x: -30, y: -20, width: 60, height: 40 },
  assetId,
  opacity: 0.75,
});

const sq = (x: number, y: number, s: number): PathCmd[] => [
  { c: "M", x, y },
  { c: "L", x: x + s, y },
  { c: "L", x: x + s, y: y + s },
  { c: "L", x, y: y + s },
  { c: "Z" },
];

const methodsOf = (rec: RecordingCtx, method: string) =>
  rec.calls.filter(([name]) => name === method);

describe("execute: base transform, structure and paths", () => {
  it("scales mm to px and wraps the whole run in save/restore", () => {
    const rec = recordingCtx();
    execute([], rec.ctx, makeEnv({ pxPerMm: 4 }).env);
    expect(rec.calls).toEqual([["save"], ["scale", 4, 4], ["restore"]]);
  });

  it("replays save and restore ops onto the context", () => {
    const rec = recordingCtx();
    execute([{ op: "save" }, { op: "restore" }], rec.ctx, makeEnv().env);
    expect(rec.calls.map(([m]) => m)).toEqual(["save", "scale", "save", "restore", "restore"]);
  });

  it("clips along the path, replaying arcs with canvas arc semantics", () => {
    const rec = recordingCtx();
    const path: PathCmd[] = [
      { c: "M", x: 1, y: 2 },
      { c: "L", x: 3, y: 4 },
      { c: "A", cx: 5, cy: 6, r: 7, start: 0.5, end: 1.5, ccw: true },
      { c: "Z" },
    ];
    execute([{ op: "clip", path }], rec.ctx, makeEnv().env);
    expect(rec.calls.slice(2, -1)).toEqual([
      ["beginPath"],
      ["moveTo", 1, 2],
      ["lineTo", 3, 4],
      ["arc", 5, 6, 7, 0.5, 1.5, true],
      ["closePath"],
      ["clip"],
    ]);
  });

  it("fills a path with its colour", () => {
    const rec = recordingCtx();
    execute([{ op: "fill", path: sq(0, 0, 5), color: "#AABBCC" }], rec.ctx, makeEnv().env);
    expect(rec.sets.fillStyle).toEqual(["#AABBCC"]);
    expect(methodsOf(rec, "fill")).toHaveLength(1);
  });

  it("multiplies the tint inside a save/restore pair", () => {
    const rec = recordingCtx();
    execute([{ op: "multiply", path: sq(0, 0, 5), color: "#B4875A" }], rec.ctx, makeEnv().env);
    expect(rec.sets.globalCompositeOperation).toEqual(["multiply"]);
    expect(rec.sets.fillStyle).toEqual(["#B4875A"]);
    const names = rec.calls.map(([m]) => m);
    expect(names.indexOf("fill")).toBeGreaterThan(names.indexOf("save", 1));
    expect(names.at(-2)).toBe("restore");
  });

  it("draws guides over the shaded outside of the trim without throwing", () => {
    const rec = recordingCtx();
    const guides = [
      { kind: "trim" as const, path: sq(2, 2, 6) },
      { kind: "seam" as const, path: sq(3, 3, 1) },
    ];
    expect(() =>
      execute([{ op: "guides", guides, shadeOutside: sq(2, 2, 6) }], rec.ctx, makeEnv().env),
    ).not.toThrow();
    expect(methodsOf(rec, "fill")).toEqual([["fill", "evenodd"]]);
    expect(methodsOf(rec, "stroke")).toHaveLength(2);
    expect(rec.sets.lineWidth).toEqual([0.25]);
  });

  it("takes every guide and shade colour from the environment", () => {
    const rec = recordingCtx();
    const kinds = ["bleed", "trim", "safe", "seam", "crease"] as const;
    const guides = kinds.map((kind) => ({ kind, path: sq(2, 2, 6) }));
    execute([{ op: "guides", guides, shadeOutside: sq(2, 2, 6) }], rec.ctx, makeEnv().env);
    expect(rec.sets.fillStyle).toEqual(["chrome-shade"]);
    expect(rec.sets.strokeStyle).toEqual([
      "chrome-bleed",
      "chrome-guide",
      "chrome-safe",
      "chrome-seam",
      "chrome-crease",
    ]);
  });

  it("skips the outside shade when there is no outline to shade around", () => {
    const rec = recordingCtx();
    execute([{ op: "guides", guides: [], shadeOutside: [] }], rec.ctx, makeEnv().env);
    expect(methodsOf(rec, "fill")).toEqual([]);
  });
});

describe("execute: text", () => {
  it("scales mm to px and draws text lines with the layout font", () => {
    const rec = recordingCtx();
    execute([textOp()], rec.ctx, makeEnv({ pxPerMm: 4 }).env);
    expect(rec.calls).toContainEqual(["scale", 4, 4]);
    expect(rec.calls).toContainEqual(["transform", ...placed]);
    expect(rec.sets.font).toHaveLength(1);
    expect(rec.sets.font?.[0]).toContain("Be Vietnam Pro");
    expect(rec.sets.font?.[0]).toContain(`${twoLines.fontSizeMm}px`);
    expect(rec.sets.fillStyle).toEqual(["#112233"]);
    expect(rec.sets.globalAlpha).toEqual([0.5]);
    expect(rec.sets.textBaseline).toEqual(["alphabetic"]);
    expect(methodsOf(rec, "fillText")).toEqual(
      twoLines.lines.map((l) => ["fillText", l.text, l.xMm, l.baselineMm]),
    );
    expect(methodsOf(rec, "strokeText")).toHaveLength(0);
  });

  it("uses the italic and bold faces the layout resolved", () => {
    const rec = recordingCtx();
    const styled = layoutText(textEl("t", { bold: true, italic: true }), FONTS, fakeMeasure);
    execute([textOp({ layout: styled })], rec.ctx, makeEnv().env);
    expect(rec.sets.font?.[0]).toMatch(/^italic 700 /);
    const rec2 = recordingCtx();
    execute([textOp()], rec2.ctx, makeEnv().env);
    expect(rec2.sets.font?.[0]).toMatch(/^400 /);
  });

  it("strokes the outline before filling each line, drawing both visibly outside the glyph", () => {
    const rec = recordingCtx();
    execute([textOp({ outline: { color: "#FFFFFF", widthMm: 0.5 } })], rec.ctx, makeEnv().env);
    const drawn = rec.calls.map(([m]) => m).filter((m) => m === "strokeText" || m === "fillText");
    expect(drawn).toEqual(["strokeText", "fillText", "strokeText", "fillText"]);
    expect(rec.sets.strokeStyle).toEqual(["#FFFFFF"]);
    // The fill covers the inner half of a centred stroke, so the visible outline is `widthMm`.
    expect(rec.sets.lineWidth).toEqual([1]);
    expect(rec.sets.lineJoin).toEqual(["round"]);
  });

  describe("letter spacing", () => {
    const spaced = layoutText(
      textEl("t", { content: "ab\na😀b", sizePt: 72, letterSpacingEm: 0.1 }),
      FONTS,
      fakeMeasure,
    );
    const SPACING_MM = 2.54;

    it("lets a context that supports letterSpacing space the glyphs", () => {
      expect(spaced.letterSpacingMm).toBeCloseTo(SPACING_MM);
      const rec = recordingCtx({ letterSpacing: true });
      execute([textOp({ layout: spaced })], rec.ctx, makeEnv().env);
      expect(rec.sets.letterSpacing).toEqual([`${spaced.letterSpacingMm}px`]);
      expect(methodsOf(rec, "fillText").map(([, text]) => text)).toEqual(["ab", "a😀b"]);
      expect(methodsOf(rec, "measureText")).toHaveLength(0);
    });

    it("does not touch letterSpacing when there is no spacing", () => {
      const rec = recordingCtx({ letterSpacing: true });
      execute([textOp()], rec.ctx, makeEnv().env);
      expect(rec.sets.letterSpacing).toBeUndefined();
      expect(methodsOf(rec, "measureText")).toHaveLength(0);
    });

    it("draws code point by code point, advancing by the measured width plus the spacing", () => {
      const rec = recordingCtx({ glyphWidth: (text) => (text === "😀" ? 5 : 3) });
      execute([textOp({ layout: spaced })], rec.ctx, makeEnv().env);
      expect(rec.sets.letterSpacing).toBeUndefined();
      const [first, second] = spaced.lines;
      const step = (width: number) => width + spaced.letterSpacingMm;
      expect(methodsOf(rec, "fillText")).toEqual([
        ["fillText", "a", first!.xMm, first!.baselineMm],
        ["fillText", "b", first!.xMm + step(3), first!.baselineMm],
        ["fillText", "a", second!.xMm, second!.baselineMm],
        ["fillText", "😀", second!.xMm + step(3), second!.baselineMm],
        ["fillText", "b", second!.xMm + step(3) + step(5), second!.baselineMm],
      ]);
    });

    it("strokes the outline of a spaced line before filling any of its glyphs", () => {
      const rec = recordingCtx({ glyphWidth: () => 3 });
      const outline = { color: "#FFFFFF" as const, widthMm: 0.5 };
      const one = layoutText(
        textEl("t", { content: "abc", letterSpacingEm: 0.1 }),
        FONTS,
        fakeMeasure,
      );
      execute([textOp({ layout: one, outline })], rec.ctx, makeEnv().env);
      const drawn = rec.calls.map(([m]) => m).filter((m) => m === "strokeText" || m === "fillText");
      expect(drawn).toEqual([...Array(3).fill("strokeText"), ...Array(3).fill("fillText")]);
    });
  });

  it("does not draw empty lines", () => {
    const rec = recordingCtx();
    const blank = layoutText(textEl("t", { content: "a\n\nb" }), FONTS, fakeMeasure);
    execute([textOp({ layout: blank })], rec.ctx, makeEnv().env);
    expect(methodsOf(rec, "fillText").map(([, text]) => text)).toEqual(["a", "b"]);
  });
});

describe("execute: images", () => {
  it("draws the decoded image into its box through the element matrix", () => {
    const rec = recordingCtx();
    execute([imageOp()], rec.ctx, makeEnv({}, { "asset-1": photo }).env);
    expect(rec.calls).toContainEqual(["transform", ...placed]);
    expect(methodsOf(rec, "drawImage")).toEqual([["drawImage", photo, -30, -20, 60, 40]]);
    expect(rec.sets.globalAlpha).toEqual([0.75]);
  });

  it("paints a placeholder when an image is missing", () => {
    const rec = recordingCtx();
    expect(() => execute([imageOp("missing")], rec.ctx, makeEnv().env)).not.toThrow();
    expect(rec.calls.some(([m]) => m === "fillRect")).toBe(true);
    expect(methodsOf(rec, "fillRect")).toEqual([["fillRect", -30, -20, 60, 40]]);
    expect(rec.sets.fillStyle).toEqual(["chrome-placeholder"]);
    expect(methodsOf(rec, "drawImage")).toHaveLength(0);
  });
});

describe("execute: drawings", () => {
  const draw: Stroke = {
    mode: "draw",
    color: "#FF0000",
    sizeMm: 2,
    points: [
      [0, 0, 0.5],
      [10, 0, 0.5],
      [20, 5, 0.5],
    ],
  };
  const erase: Stroke = {
    mode: "erase",
    color: "#000000",
    sizeMm: 3,
    points: [
      [5, 0, 0.5],
      [8, 0, 0.5],
    ],
  };
  const drawingOp = (
    strokes: Stroke[],
    matrix: Mat2D = placed,
    box: RectMm = { x: -2, y: -2, width: 26, height: 12 },
  ): DrawOp => ({ op: "drawing", id: "pen", matrix, box, strokes, opacity: 0.8 });

  it("erases only inside the drawing layer", () => {
    const rec = recordingCtx();
    const { env, layers } = makeEnv();
    execute([drawingOp([draw, erase])], rec.ctx, env);
    const layer = layers[0]!;
    expect(layer.rec.sets.globalCompositeOperation).toEqual(["source-over", "destination-out"]);
    expect(layer.rec.sets.globalCompositeOperation).toContain("destination-out");
    expect(rec.sets.globalCompositeOperation ?? []).not.toContain("destination-out");
  });

  it("rasterises the strokes into a layer the size of the box and draws it through the matrix", () => {
    const rec = recordingCtx();
    const { env, layers } = makeEnv();
    execute([drawingOp([draw, erase])], rec.ctx, env);
    expect(layers).toHaveLength(1);
    const layer = layers[0]!;
    expect([layer.widthPx, layer.heightPx]).toEqual([104, 48]);
    expect(layer.rec.calls.slice(0, 2)).toEqual([
      ["scale", 4, 4],
      ["translate", 2, 2],
    ]);
    expect(layer.rec.sets.fillStyle).toEqual(["#FF0000", "#000000"]);
    expect(methodsOf(layer.rec, "fill")).toHaveLength(2);
    expect(rec.calls).toContainEqual(["transform", ...placed]);
    expect(methodsOf(rec, "drawImage")).toEqual([
      ["drawImage", layer.source, 0, 0, 104, 48, -2, -2, 26, 12],
    ]);
    expect(rec.sets.globalAlpha).toEqual([0.8]);
  });

  it("rasterises at the element scale so a scaled drawing stays sharp, into the same box", () => {
    const rec = recordingCtx();
    const { env, layers } = makeEnv();
    execute([drawingOp([draw], [2, 0, 0, 2, 10, 20])], rec.ctx, env);
    const layer = layers[0]!;
    expect([layer.widthPx, layer.heightPx]).toEqual([208, 96]);
    expect(layer.rec.calls.slice(0, 2)).toEqual([
      ["scale", 8, 8],
      ["translate", 2, 2],
    ]);
    expect(methodsOf(rec, "drawImage")).toEqual([
      ["drawImage", layer.source, 0, 0, 208, 96, -2, -2, 26, 12],
    ]);
  });

  it("never rasterises a layer past 8192 px on its longest edge", () => {
    const { env, layers } = makeEnv();
    execute([drawingOp([draw], [500, 0, 0, 500, 0, 0])], recordingCtx().ctx, env);
    const layer = layers[0]!;
    expect(layer.widthPx).toBe(8192);
    expect(layer.heightPx).toBeLessThanOrEqual(8192);
    expect(layer.heightPx).toBeCloseTo((8192 * 12) / 26, -1);
  });

  it("rasterises the whole brush outline inside the layer the sizer's box gives it", () => {
    const brush = (points: [number, number, number][]): Stroke => ({
      mode: "draw",
      color: "#000000",
      sizeMm: 4,
      points,
    });
    const strokes = [
      // slow, simulated pressure
      brush(Array.from({ length: 61 }, (_, i) => [i * 0.5, 0, 0.5])),
      // pen pressure swelling to full
      brush(Array.from({ length: 41 }, (_, i) => [i * 2, 0, Math.min(1, 0.4 + i * 0.05)])),
    ];
    for (const stroke of strokes) {
      const box = sizer(drawingEl("d", { strokes: [stroke] }));
      const { env, layers } = makeEnv();
      execute([drawingOp([stroke], placed, box)], recordingCtx().ctx, env);
      const layer = layers[0]!;
      const vertices = layer.rec.calls.filter(([m]) => m === "moveTo" || m === "lineTo");
      expect(vertices.length).toBeGreaterThan(10);
      for (const [, x, y] of vertices) {
        // the layer context is scaled by k = 4 and translated by -box.x / -box.y
        const [px, py] = [((x as number) - box.x) * 4, ((y as number) - box.y) * 4];
        expect(px).toBeGreaterThanOrEqual(0);
        expect(px).toBeLessThanOrEqual(layer.widthPx);
        expect(py).toBeGreaterThanOrEqual(0);
        expect(py).toBeLessThanOrEqual(layer.heightPx);
      }
    }
  });

  it("reuses a drawing's layer across paints while its strokes stay the same", () => {
    const cache = new Map<string, CanvasImageSource>();
    const { env, layers } = makeEnv({ layerCache: cache });
    const first = recordingCtx();
    execute([drawingOp([draw, erase])], first.ctx, env);
    const second = recordingCtx();
    // Moved elsewhere, and the same strokes in a new array (an undo, a reload): still one raster.
    execute([drawingOp(structuredClone([draw, erase]), [1, 0, 0, 1, 50, 60])], second.ctx, env);
    expect(layers).toHaveLength(1);
    expect(methodsOf(second, "drawImage")[0]?.[1]).toBe(layers[0]!.source);
    expect([...cache.keys()]).toEqual(["drawing:pen@4"]);
  });

  it("rasterises again when its strokes change, replacing its one entry per resolution", () => {
    const cache = new Map<string, CanvasImageSource>();
    const { env, layers } = makeEnv({ layerCache: cache });
    execute([drawingOp([draw])], recordingCtx().ctx, env);
    execute([drawingOp([draw, erase])], recordingCtx().ctx, env);
    const later = recordingCtx();
    execute([drawingOp([draw, erase])], later.ctx, env);
    expect(layers).toHaveLength(2);
    expect(methodsOf(later, "drawImage")[0]?.[1]).toBe(layers[1]!.source);
    execute([drawingOp([draw, erase])], recordingCtx().ctx, { ...env, pxPerMm: 8 });
    expect([...cache.keys()]).toEqual(["drawing:pen@4", "drawing:pen@8"]);
  });

  it("creates no layer for a drawing without strokes or points", () => {
    const rec = recordingCtx();
    const { env, layers } = makeEnv();
    execute([drawingOp([])], rec.ctx, env);
    expect(layers).toHaveLength(0);
    expect(methodsOf(rec, "drawImage")).toHaveLength(0);
    const { env: env2, layers: layers2 } = makeEnv();
    execute([drawingOp([{ ...draw, points: [] }])], rec.ctx, env2);
    expect(methodsOf(layers2[0]!.rec, "fill")).toHaveLength(0);
  });
});

describe("execute: wrapped (warped) elements", () => {
  const warpedOf = (el: ReturnType<typeof imageEl> | ReturnType<typeof textEl>, target = "print") =>
    compose({
      surface: cupBody,
      content: { background: { kind: "none" }, elements: [el] },
      target: target as ComposeTarget,
      material: "paper-white",
      sizer,
      fonts: FONTS,
      measure: fakeMeasure,
    }).find((o): o is Extract<DrawOp, { op: "warped" }> => o.op === "warped")!;

  const placement = { u: 140, v: 60, rotationDeg: 0, scale: 1 };
  const flipped = () => warpedOf(imageEl("img", { wrap: true, flipX: true, placement }));

  it("does not flip a flipped wrapped image twice", () => {
    const op = flipped();
    const rec = recordingCtx();
    const { env, layers } = makeEnv({}, { "asset-1": photo });
    execute([op], rec.ctx, env);

    // The source carries the rigid, flip-bearing placement; the strips already carry the flip.
    const matrices = [...rec.calls, ...layers.flatMap((l) => l.rec.calls)]
      .filter(([m]) => m === "transform" || m === "setTransform")
      .map(([, ...args]) => args);
    expect(matrices).not.toContainEqual([...op.source.matrix]);
    expect(op.strips.every((s) => s.matrix.some((v, i) => v !== op.source.matrix[i]))).toBe(true);

    // The layer is drawn only through each strip matrix, one transform per strip, in order.
    expect(methodsOf(rec, "transform")).toEqual(op.strips.map((s) => ["transform", ...s.matrix]));
    expect(methodsOf(rec, "drawImage")).toHaveLength(op.strips.length);
    expect(methodsOf(rec, "drawImage").every(([, src]) => src === layers[0]!.source)).toBe(true);
  });

  it("rasterises the source into the layer in its local frame, without the element matrix", () => {
    const op = flipped();
    const { env, layers } = makeEnv({}, { "asset-1": photo });
    execute([op], recordingCtx().ctx, env);
    expect(layers).toHaveLength(1);
    const layer = layers[0]!;
    expect([layer.widthPx, layer.heightPx]).toEqual([240, 160]);
    expect(layer.rec.calls).toEqual([
      ["scale", 4, 4],
      ["translate", 30, 20],
      ["drawImage", photo, -30, -20, 60, 40],
    ]);
  });

  it("draws each strip widened by one device pixel, clamped to the source columns", () => {
    const op = flipped();
    const rec = recordingCtx();
    const { env } = makeEnv({}, { "asset-1": photo });
    execute([op], rec.ctx, env);
    const draws = methodsOf(rec, "drawImage");
    const mid = op.strips[10]!;
    const devicePx = 1 / (4 * Math.hypot(mid.matrix[0], mid.matrix[1]));
    const [, , sx, sy, sw, sh, dx, dy, dw, dh] = draws[10]!;
    expect(dx).toBeCloseTo(mid.srcX - devicePx / 2, 9);
    expect(dw).toBeCloseTo(mid.srcWidth + devicePx, 9);
    expect(sx).toBeCloseTo(((dx as number) + 30) * 4, 9);
    expect(sw).toBeCloseTo((dw as number) * 4, 9);
    expect([sy, sh, dy, dh]).toEqual([0, 160, -20, 40]);

    const first = draws[0]!;
    const last = draws.at(-1)!;
    expect(first[6]).toBe(-30);
    expect(first[2]).toBe(0);
    expect((last[6] as number) + (last[8] as number)).toBeCloseTo(30, 9);
  });

  it("rasterises a wrapped text once into a padded layer", () => {
    const op = warpedOf(
      textEl("t", { wrap: true, placement, outline: { color: "#FFFFFF", widthMm: 0.4 } }),
    );
    const rec = recordingCtx();
    const { env, layers } = makeEnv();
    execute([op], rec.ctx, env);
    expect(layers).toHaveLength(1);
    const layer = layers[0]!;
    expect(methodsOf(layer.rec, "fillText").length).toBeGreaterThan(0);
    expect(methodsOf(layer.rec, "strokeText").length).toBeGreaterThan(0);
    expect(methodsOf(layer.rec, "transform")).toHaveLength(0);
    // Room above and below for stacked Vietnamese diacritics and the outline.
    const { widthMm, heightMm } = (op.source as Extract<DrawOp, { op: "text" }>).layout;
    expect(layer.widthPx).toBe(Math.ceil(widthMm * 4));
    expect(layer.heightPx).toBeGreaterThan(Math.ceil(heightMm * 4));
  });

  const rasterisedPhoto = (layers: Layer[]) =>
    layers.filter((l) => methodsOf(l.rec, "drawImage").some(([, image]) => image === photo));

  it("reuses the layer when the element moves or fades, keyed without its placement", () => {
    const op = flipped();
    const cache = new Map<string, CanvasImageSource>();
    const { env, layers } = makeEnv({ layerCache: cache }, { "asset-1": photo });
    execute([op], recordingCtx().ctx, env);
    execute([op], recordingCtx().ctx, env);
    const { matrix: _matrix, opacity: _opacity, ...stable } = op.source;
    expect([...cache.keys()]).toEqual([`${JSON.stringify(stable)}@4`]);
    expect(layers).toHaveLength(1);

    const moved = warpedOf(
      imageEl("img", { wrap: true, flipX: true, placement: { ...placement, u: 170, v: 50 } }),
    );
    expect(moved.source.matrix).not.toEqual(op.source.matrix);
    execute([moved], recordingCtx().ctx, env);
    const faded = warpedOf(imageEl("img", { wrap: true, flipX: true, placement, opacity: 0.5 }));
    execute([faded], recordingCtx().ctx, env);
    expect(rasterisedPhoto(layers)).toHaveLength(1);
    expect(cache.size).toBe(1);
  });

  it("rasterises again for another resolution or picture, and shares a layer between equal ones", () => {
    const op = flipped();
    const cache = new Map<string, CanvasImageSource>();
    const other = { name: "other" } as unknown as CanvasImageSource;
    const { env, layers } = makeEnv({ layerCache: cache }, { "asset-1": photo, "asset-2": other });
    const wrapped = (over: Partial<ImageElement>) =>
      warpedOf(imageEl("img", { wrap: true, flipX: true, placement, ...over }));

    execute([op], recordingCtx().ctx, env);
    execute([op], recordingCtx().ctx, { ...env, pxPerMm: 8 });
    execute([wrapped({ assetId: "asset-2" })], recordingCtx().ctx, env);
    execute([wrapped({ placement: { ...placement, scale: 2 } })], recordingCtx().ctx, env);
    // A scale-2 element at 4 px/mm is rasterised at 8 px/mm, like the first one at 8 px/mm.
    expect(layers.map((l) => l.widthPx)).toEqual([240, 480, 240]);
    expect(cache.size).toBe(3);
  });

  describe("layer cache bound", () => {
    /** A tiny wrapped image: the cache cares about its key, so only the asset id differs. */
    const tiny = (assetId: string): Extract<DrawOp, { op: "warped" }> => ({
      op: "warped",
      source: {
        op: "image",
        matrix: IDENTITY,
        box: { x: -5, y: -5, width: 10, height: 10 },
        assetId,
        opacity: 1,
      },
      strips: [{ srcX: -5, srcWidth: 10, matrix: IDENTITY }],
    });
    const keyOf = (assetId: string) => {
      const { matrix: _matrix, opacity: _opacity, ...stable } = tiny(assetId).source;
      return `${JSON.stringify(stable)}@4`;
    };

    it("keeps at most 64 layers and drops the least recently used first", () => {
      const cache = new Map<string, CanvasImageSource>();
      const images = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`a${i}`, photo]));
      const { env } = makeEnv({ layerCache: cache }, images);
      const paint = (id: string) => execute([tiny(id)], recordingCtx().ctx, env);

      for (let i = 0; i < 64; i++) paint(`a${i}`);
      expect(cache.size).toBe(64);
      paint("a0"); // a hit: a0 is now the most recently used and a1 the least
      paint("a64");
      expect(cache.size).toBe(64);
      expect(cache.has(keyOf("a0"))).toBe(true);
      expect(cache.has(keyOf("a1"))).toBe(false);
      expect(cache.has(keyOf("a64"))).toBe(true);
      paint("a65");
      expect(cache.has(keyOf("a2"))).toBe(false);
      expect(cache.has(keyOf("a0"))).toBe(true);
      expect(cache.size).toBe(64);
    });
  });

  describe("resolution follows the element scale", () => {
    const at = (scale: number) =>
      warpedOf(imageEl("img", { wrap: true, placement: { ...placement, scale } }));
    const paint = (op: Extract<DrawOp, { op: "warped" }>) => {
      const rec = recordingCtx();
      const { env, layers } = makeEnv({}, { "asset-1": photo });
      execute([op], rec.ctx, env);
      return { layer: layers[0]!, draws: methodsOf(rec, "drawImage") };
    };

    it("rasterises a scale-2 wrapped element twice as large in px as at scale 1", () => {
      const one = paint(at(1)).layer;
      const two = paint(at(2)).layer;
      expect([one.widthPx, one.heightPx]).toEqual([240, 160]);
      expect([two.widthPx, two.heightPx]).toEqual([480, 320]);
      expect(two.rec.calls.slice(0, 2)).toEqual([
        ["scale", 8, 8],
        ["translate", 30, 20],
      ]);
    });

    it("draws the strips at the same flat positions whatever the raster resolution", () => {
      for (const scale of [1, 2]) {
        const op = at(scale);
        const devicePx = 1 / (4 * scale);
        paint(op).draws.forEach(([, , sx, , sw, sh, dx, dy, dw, dh], i) => {
          const strip = op.strips[i]!;
          const [x, w] = [dx as number, dw as number];
          // Destination: the strip's own columns (local mm), widened by at most one device px.
          expect(w).toBeLessThanOrEqual(strip.srcWidth + devicePx + 1e-9);
          expect(w).toBeGreaterThanOrEqual(strip.srcWidth - 1e-9);
          expect([dy, dh]).toEqual([-20, 40]);
          // Source: the same columns in layer px, at 4 x scale px per local mm.
          expect(sx as number).toBeCloseTo((x + 30) * 4 * scale, 6);
          expect(sw as number).toBeCloseTo(w * 4 * scale, 6);
          expect(sh).toBeCloseTo(40 * 4 * scale, 6);
          // On the flat, the rect is centred where the strip is (the two end strips are widened
          // on their inner side only, so they sit up to half a device pixel off).
          const centre = applyToPoint(strip.matrix, { x: x + w / 2, y: 0 });
          const nominal = applyToPoint(strip.matrix, { x: strip.srcX + strip.srcWidth / 2, y: 0 });
          const offBy = Math.hypot(centre.x - nominal.x, centre.y - nominal.y);
          expect(offBy).toBeLessThanOrEqual(
            i === 0 || i === op.strips.length - 1 ? 0.125 + 1e-9 : 1e-9,
          );
        });
      }
    });

    it("clamps the layer to 8192 px on its longest edge", () => {
      const { layer } = paint(at(100));
      expect(layer.widthPx).toBe(8192);
      expect(layer.heightPx).toBeLessThanOrEqual(8192);
    });
  });

  describe("opacity", () => {
    const faded = (opacity: number) =>
      warpedOf(imageEl("img", { wrap: true, opacity, placement, flipX: true }));

    it("is applied once to the whole warped element, not per strip", () => {
      const op = faded(0.5);
      const rec = recordingCtx();
      const { env, layers } = makeEnv({}, { "asset-1": photo });
      execute([op], rec.ctx, env);

      // layer 0 is the shared source raster, layer 1 the composite the strips are drawn into
      expect(layers).toHaveLength(2);
      const [source, group] = [layers[0]!, layers[1]!];
      expect(source.rec.sets.globalAlpha).toBeUndefined();
      expect(group.rec.sets.globalAlpha).toBeUndefined();
      expect(methodsOf(group.rec, "drawImage")).toHaveLength(op.strips.length);
      expect(methodsOf(group.rec, "transform")).toHaveLength(op.strips.length);

      expect(rec.sets.globalAlpha).toEqual([0.5]);
      expect(methodsOf(rec, "transform")).toHaveLength(0);
      expect(methodsOf(rec, "drawImage")).toHaveLength(1);
      const [, image, , , sw, sh, dx, dy, dw, dh] = methodsOf(rec, "drawImage")[0]!;
      expect(image).toBe(group.source);
      const [x, y, w, h] = [dx, dy, dw, dh] as number[];
      expect([group.widthPx, group.heightPx]).toEqual([Math.ceil(w! * 4), Math.ceil(h! * 4)]);
      expect([sw, sh]).toEqual([w! * 4, h! * 4]);

      // The composite covers every strip.
      for (const strip of op.strips) {
        for (const lx of [strip.srcX, strip.srcX + strip.srcWidth]) {
          for (const ly of [-20, 20]) {
            const p = applyToPoint(strip.matrix, { x: lx, y: ly });
            expect(p.x).toBeGreaterThanOrEqual(x! - 1e-6);
            expect(p.x).toBeLessThanOrEqual(x! + w! + 1e-6);
            expect(p.y).toBeGreaterThanOrEqual(y! - 1e-6);
            expect(p.y).toBeLessThanOrEqual(y! + h! + 1e-6);
          }
        }
      }
    });

    it("composes into the env's scratch layer when it has one, not a new layer per paint", () => {
      const op = faded(0.5);
      const scratch = recordingCtx();
      const scratchSource = { name: "scratch" } as unknown as CanvasImageSource;
      const scratchLayer = vi.fn(() => ({ source: scratchSource, ctx: scratch.ctx }));
      const cache = new Map<string, CanvasImageSource>();
      const { env, layers } = makeEnv({ layerCache: cache, scratchLayer }, { "asset-1": photo });
      const rec = recordingCtx();
      execute([op], rec.ctx, env);
      execute([op], recordingCtx().ctx, env);

      expect(layers).toHaveLength(1); // the cached source raster only
      expect(scratchLayer).toHaveBeenCalledTimes(2);
      expect(methodsOf(scratch, "drawImage")).toHaveLength(2 * op.strips.length);
      expect(methodsOf(rec, "drawImage")[0]?.[1]).toBe(scratchSource);
    });

    it("draws an opaque element straight onto the context, with no composite layer", () => {
      const op = faded(1);
      const rec = recordingCtx();
      const { env, layers } = makeEnv({}, { "asset-1": photo });
      execute([op], rec.ctx, env);
      expect(layers).toHaveLength(1);
      expect(rec.sets.globalAlpha).toBeUndefined();
      expect(methodsOf(rec, "drawImage")).toHaveLength(op.strips.length);
    });
  });

  it("does not cache a layer that painted a missing-image placeholder", () => {
    const op = flipped();
    const cache = new Map<string, CanvasImageSource>();
    const { env, layers } = makeEnv({ layerCache: cache });
    expect(() => execute([op], recordingCtx().ctx, env)).not.toThrow();
    expect(methodsOf(layers[0]!.rec, "fillRect")).toHaveLength(1);
    expect(cache.size).toBe(0);
  });
});

describe("drawPattern", () => {
  const bounds = { x: 0, y: 0, width: 100, height: 60 };
  const run = (
    patternId: (typeof PATTERN_IDS)[number],
    over: { scale?: number; rotationDeg?: number } = {},
  ) => {
    const rec = recordingCtx();
    drawPattern(rec.ctx, {
      op: "pattern",
      bounds,
      patternId,
      colors: ["#101010", "#EFEFEF"],
      scale: 10,
      rotationDeg: 0,
      ...over,
    });
    return rec;
  };

  it("clips to the bounds, fills the ground, then paints the motif colour and restores", () => {
    for (const id of PATTERN_IDS) {
      const rec = run(id);
      const names = rec.calls.map(([m]) => m);
      expect(names[0]).toBe("save");
      expect(names.at(-1)).toBe("restore");
      expect(names.filter((m) => m === "save")).toHaveLength(1);
      expect(names).toContain("clip");
      expect(methodsOf(rec, "fillRect")[0]).toEqual(["fillRect", 0, 0, 100, 60]);
      expect(rec.sets.fillStyle?.[0]).toBe("#101010");
      const motif = [...(rec.sets.fillStyle ?? []), ...(rec.sets.strokeStyle ?? [])];
      expect(motif).toContain("#EFEFEF");
      const painted = names.filter((m) => m === "fill" || m === "stroke").length;
      expect(painted + methodsOf(rec, "fillRect").length).toBeGreaterThan(1);
    }
  });

  it("draws a denser motif for a smaller pitch", () => {
    const arcs = (scale: number) => methodsOf(run("dots", { scale }), "arc").length;
    expect(arcs(5)).toBeGreaterThan(arcs(20));
    expect(arcs(20)).toBeGreaterThan(0);
    const bars = (scale: number) => methodsOf(run("stripes", { scale }), "fillRect").length;
    expect(bars(5)).toBeGreaterThan(bars(20));
  });

  it("turns the motif by the pattern rotation about the bounds centre", () => {
    const rec = run("grid", { rotationDeg: 30 });
    expect(methodsOf(rec, "translate")).toEqual([["translate", 50, 30]]);
    expect(methodsOf(rec, "rotate")).toEqual([["rotate", (30 * Math.PI) / 180]]);
  });

  describe("from one motif tile", () => {
    /** A context that makes patterns (the recording fake has none), and the patterns it made. */
    function patterningCtx() {
      const rec = recordingCtx();
      const made: { image: unknown; repetition: string; setTransform: ReturnType<typeof vi.fn> }[] =
        [];
      (rec.ctx as unknown as Record<string, unknown>).createPattern = (
        image: unknown,
        repetition: string,
      ) => {
        const pattern = { image, repetition, setTransform: vi.fn() };
        made.push(pattern);
        return pattern;
      };
      return { rec, made };
    }
    const op = (patternId: (typeof PATTERN_IDS)[number], scale = 2) => ({
      op: "pattern" as const,
      bounds: { x: 0, y: 0, width: 266, height: 286 },
      patternId,
      colors: ["#101010", "#EFEFEF"] as [`#${string}`, `#${string}`],
      scale,
      rotationDeg: 0,
    });

    it("draws the motif once and lets the canvas repeat it, where the context makes patterns", () => {
      const { rec, made } = patterningCtx();
      const { env, layers } = makeEnv({ pxPerMm: 11.81 });
      drawPattern(rec.ctx, op("checker"), env);

      // A 2 mm checker on a bag face: one tile instead of some 125 000 squares.
      expect(layers).toHaveLength(1);
      const tile = layers[0]!;
      expect([tile.widthPx, tile.heightPx]).toEqual([24, 24]); // one 2 mm period at 11.81 px/mm
      expect(methodsOf(tile.rec, "fillRect").length).toBeGreaterThan(0);
      expect(tile.rec.sets.fillStyle).toEqual(["#EFEFEF"]);
      expect(made).toHaveLength(1);
      expect(made[0]).toMatchObject({ image: tile.source, repetition: "repeat" });
      // The tile's px are scaled back to exactly one period in mm.
      expect(made[0]!.setTransform).toHaveBeenCalledWith({
        a: 2 / 24,
        b: 0,
        c: 0,
        d: 2 / 24,
        e: 0,
        f: 0,
      });
      expect(rec.sets.fillStyle).toEqual(["#101010", made[0]]);
      const reach = Math.hypot(266, 286) / 2;
      expect(methodsOf(rec, "fillRect")).toEqual([
        ["fillRect", 0, 0, 266, 286],
        ["fillRect", -reach, -reach, 2 * reach, 2 * reach],
      ]);
    });

    it("tiles each motif over its own period: two pitches down for dots, across for waves", () => {
      for (const [id, [across, down]] of [
        ["dots", [1, 2]],
        ["waves", [2, 1]],
        ["grid", [1, 1]],
      ] as const) {
        const { rec } = patterningCtx();
        const { env, layers } = makeEnv({ pxPerMm: 4 });
        drawPattern(rec.ctx, op(id, 5), env);
        expect([layers[0]!.widthPx, layers[0]!.heightPx]).toEqual([across * 20, down * 20]);
      }
    });

    it("keeps the tile in the layer cache for the next paint", () => {
      const cache = new Map<string, CanvasImageSource>();
      const { env, layers } = makeEnv({ layerCache: cache });
      drawPattern(patterningCtx().rec.ctx, op("stripes"), env);
      drawPattern(patterningCtx().rec.ctx, op("stripes"), env);
      expect(layers).toHaveLength(1);
      drawPattern(
        patterningCtx().rec.ctx,
        { ...op("stripes"), colors: ["#101010", "#FF0000"] },
        env,
      );
      expect(layers).toHaveLength(2);
    });

    it("draws the lattice where the context makes no patterns", () => {
      const rec = recordingCtx();
      const { env, layers } = makeEnv();
      drawPattern(rec.ctx, op("checker", 20), env);
      expect(layers).toHaveLength(0);
      expect(methodsOf(rec, "fillRect").length).toBeGreaterThan(2);
    });
  });

  it("clamps a tiny or invalid pitch so the pattern stays cheap", () => {
    for (const id of PATTERN_IDS) {
      const tiny = run(id, { scale: 0.001 }).calls.length;
      expect(tiny).toBe(run(id, { scale: 1 }).calls.length);
      expect(run(id, { scale: Number.NaN }).calls.length).toBe(tiny);
      expect(run(id, { scale: -5 }).calls.length).toBe(tiny);
    }
  });
});

describe("strokePolygon", () => {
  const line = (pressure: number | ((i: number) => number)): Stroke => ({
    mode: "draw",
    color: "#000000",
    sizeMm: 4,
    points: Array.from({ length: 101 }, (_, i): [number, number, number] => [
      i,
      0,
      typeof pressure === "number" ? pressure : pressure(i),
    ]),
  });

  it("outlines the stroke as a closed polygon that reaches the last point", () => {
    const polygon = strokePolygon(line(0.5));
    expect(polygon.length).toBeGreaterThan(10);
    expect(polygon.every((p) => p.length === 2)).toBe(true);
    const xs = polygon.map(([x]) => x);
    expect(Math.min(...xs)).toBeLessThanOrEqual(0);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(100);
    const ys = polygon.map(([, y]) => y);
    expect(Math.max(...ys)).toBeGreaterThan(0.5);
    expect(Math.min(...ys)).toBeLessThan(-0.5);
  });

  it("ends a finished stroke on its last point even after a fast final segment", () => {
    const polygon = strokePolygon({
      ...line(0.5),
      points: [
        [0, 0, 0.5],
        [20, 0, 0.5],
        [100, 0, 0.5],
      ],
    });
    // Unfinished strokes lag behind the pointer; a finished one reaches it.
    expect(Math.max(...polygon.map(([x]) => x))).toBeGreaterThanOrEqual(100);
  });

  it("simulates pressure when every pressure is equal, whatever its value", () => {
    expect(strokePolygon(line(1))).toEqual(strokePolygon(line(0.5)));
  });

  it("follows real pressure when it varies", () => {
    const varying = strokePolygon(line((i) => 0.1 + (0.9 * i) / 100));
    expect(varying).not.toEqual(strokePolygon(line(0.5)));
    const widthAt = (polygon: [number, number][], x: number) => {
      const ys = polygon.filter(([px]) => Math.abs(px - x) < 3).map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(widthAt(varying, 90)).toBeGreaterThan(widthAt(varying, 10));
  });

  it("returns an empty polygon for a stroke without points", () => {
    expect(strokePolygon({ ...line(0.5), points: [] })).toEqual([]);
  });

  it("outlines a single tap as a dot", () => {
    const dot = strokePolygon({ ...line(0.5), points: [[5, 5, 0.5]] });
    expect(dot.length).toBeGreaterThan(3);
  });
});

describe("renderSurface", () => {
  const flatBounds = { x: 0, y: 0, width: 10.3, height: 5 };
  const fakeCanvas = (ctx: unknown) => {
    const widthSets: number[] = [];
    let width = 0;
    const canvas = {
      getContext: (kind: string) => (kind === "2d" ? ctx : null),
      get width() {
        return width;
      },
      set width(value: number) {
        width = value;
        widthSets.push(value);
      },
      height: 0,
    };
    return { canvas: canvas as unknown as HTMLCanvasElement, widthSets };
  };

  it("sizes the canvas to the bounds in px and executes the ops", () => {
    const rec = recordingCtx();
    const { canvas } = fakeCanvas(rec.ctx);
    renderSurface(
      canvas,
      [{ op: "fill", path: sq(0, 0, 1), color: "#000000" }],
      makeEnv().env,
      flatBounds,
    );
    expect(canvas.width).toBe(42);
    expect(canvas.height).toBe(20);
    expect(rec.calls).toContainEqual(["scale", 4, 4]);
    expect(methodsOf(rec, "fill")).toHaveLength(1);
  });

  it("clears the canvas and resizes it only when its size changes", () => {
    const rec = recordingCtx();
    const { canvas, widthSets } = fakeCanvas(rec.ctx);
    const { env } = makeEnv();
    renderSurface(canvas, [], env, flatBounds);
    renderSurface(canvas, [], env, flatBounds);
    expect(widthSets).toEqual([42]);
    expect(methodsOf(rec, "clearRect")).toEqual([
      ["clearRect", 0, 0, 42, 20],
      ["clearRect", 0, 0, 42, 20],
    ]);
  });

  it("paints only the rows of a print band, shifted up by the band's top", () => {
    const rec = recordingCtx();
    const { canvas } = fakeCanvas(rec.ctx);
    renderSurface(canvas, [], makeEnv().env, flatBounds, { y0Px: 8, heightPx: 12 });
    expect([canvas.width, canvas.height]).toEqual([42, 12]);
    expect(rec.calls.slice(0, 4)).toEqual([
      ["setTransform", 1, 0, 0, 1, 0, 0],
      ["clearRect", 0, 0, 42, 12],
      ["setTransform", 1, 0, 0, 1, 0, -8],
      ["save"],
    ]);
    expect(rec.calls).toContainEqual(["scale", 4, 4]);
  });

  it("is a no-op when the canvas has no 2d context", () => {
    const { canvas, widthSets } = fakeCanvas(null);
    expect(() => renderSurface(canvas, [], makeEnv().env, flatBounds)).not.toThrow();
    expect(widthSets).toEqual([]);
    expect(canvas.height).toBe(0);
  });
});
