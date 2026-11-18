// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { SurfaceContent } from "../document/schema";
import { parseCssColor } from "../export/css-color";
import { createPdfCanvas, type GlyphOutliner } from "../export/pdf-canvas";
import { printLayerNames } from "../export/print-layers";
import { compose } from "../render/compose";
import { execute, type RenderEnv } from "../render/execute";
import { cupBody, drawingEl, fakeMeasure, FONTS, imageEl, sizer, textEl } from "./fixtures";

/** Canvas units to page pt, y up from a page 100 units tall (scale 1). */
const FLIP = [1, 0, 0, -1, 0, 100] as const;
/** Every glyph a 1 × 1 square at the pen, advancing 1 per code point. */
const squares: GlyphOutliner = (text) => ({
  commands: [...text].flatMap((_, i) => [
    { c: "M" as const, x: i, y: 0 },
    { c: "L" as const, x: i + 1, y: 0 },
    { c: "L" as const, x: i + 1, y: -1 },
    { c: "Z" as const },
  ]),
  advance: [...text].length,
});
const image = (width: number, height: number) =>
  ({ width, height }) as unknown as CanvasImageSource;
const lines = (content: string) => content.split("\n");

describe("css colours", () => {
  it("reads the colour strings the executor sets, and nothing else", () => {
    expect(parseCssColor("#FF0000")).toEqual([1, 0, 0, 1]);
    expect(parseCssColor("#0f08")).toEqual([0, 1, 0, 0x88 / 255]);
    expect(parseCssColor("rgba(0, 0, 255, 0.5)")).toEqual([0, 0, 1, 0.5]);
    expect(parseCssColor("red")).toBeNull();
  });
});

describe("createPdfCanvas", () => {
  it("fills a path in sRGB with the current alpha, flipped to PDF space", () => {
    const pdf = createPdfCanvas(FLIP, squares);
    pdf.ctx.globalAlpha = 0.5;
    pdf.ctx.fillStyle = "#FF0000";
    pdf.ctx.beginPath();
    pdf.ctx.moveTo(10, 20);
    pdf.ctx.lineTo(30, 20);
    pdf.ctx.closePath();
    pdf.ctx.fill();
    const art = pdf.finish();
    expect(lines(art.content)).toEqual([
      "q",
      "/VGs0 gs",
      "/VCs cs",
      "1 0 0 sc",
      "10 80 m",
      "30 80 l",
      "h",
      "f",
      "Q",
    ]);
    expect(art.alphas).toEqual([0.5]);
    expect(art.unsupported).toBeUndefined();
  });

  it("turns a full circle into four Béziers and scales strokes with the transform", () => {
    const pdf = createPdfCanvas(FLIP, squares);
    pdf.ctx.scale(2, 2);
    pdf.ctx.lineWidth = 0.5;
    pdf.ctx.beginPath();
    pdf.ctx.arc(10, 10, 5, 0, Math.PI * 2);
    pdf.ctx.stroke();
    const out = lines(pdf.finish().content);
    expect(out.filter((l) => l.endsWith(" c"))).toHaveLength(4);
    expect(out).toContain("1 w");
    expect(out).toContain("30 80 m");
  });

  it("keeps clips and state in q/Q, as the canvas keeps them in save/restore", () => {
    const pdf = createPdfCanvas(FLIP, squares);
    pdf.ctx.save();
    pdf.ctx.beginPath();
    pdf.ctx.moveTo(0, 0);
    pdf.ctx.lineTo(1, 0);
    pdf.ctx.lineTo(1, 1);
    pdf.ctx.clip();
    pdf.ctx.restore();
    expect(lines(pdf.finish().content)).toEqual([
      "q",
      "0 100 m",
      "1 100 l",
      "1 99 l",
      "W",
      "n",
      "Q",
    ]);
  });

  it("draws an image once per source, cropping a part of it to its destination", () => {
    const pdf = createPdfCanvas([1, 0, 0, 1, 0, 0], squares);
    const layer = image(100, 50);
    pdf.ctx.drawImage(layer, 0, 0, 10, 5);
    pdf.ctx.drawImage(layer, 50, 0, 50, 50, 20, 0, 5, 5);
    const art = pdf.finish();
    expect(art.images).toEqual([layer]);
    const out = lines(art.content);
    // Whole: the unit square stretched over 10 × 5, drawn y up.
    expect(out).toContain("10 0 0 -5 0 5 cm");
    // Part: clipped to the destination, the whole image scaled 0.1 and shifted so x 50 lands on 20.
    expect(out).toContain("20 0 m");
    expect(out).toContain("h W n");
    expect(out).toContain("10 0 0 -5 15 5 cm");
    expect(out.filter((l) => l === "/VIm0 Do")).toHaveLength(2);
  });

  it("writes text as its glyph outlines, at the baseline it was asked for", () => {
    const pdf = createPdfCanvas(FLIP, squares);
    pdf.ctx.fillStyle = "#000000";
    pdf.ctx.fillText("ab", 5, 10);
    const out = lines(pdf.finish().content);
    expect(out).toContain("5 90 m");
    expect(out).toContain("7 91 l");
    expect(out.filter((l) => l === "h")).toHaveLength(2);
  });

  it("notes what a PDF cannot draw the same way instead of guessing", () => {
    const noGlyphs = createPdfCanvas(FLIP, () => null);
    noGlyphs.ctx.fillText("x", 0, 0);
    expect(noGlyphs.finish().unsupported).toMatch(/without outlines/);

    const multiply = createPdfCanvas(FLIP, squares);
    multiply.ctx.globalCompositeOperation = "multiply";
    multiply.ctx.fillRect(0, 0, 1, 1);
    expect(multiply.finish().unsupported).toMatch(/multiply/);

    const named = createPdfCanvas(FLIP, squares);
    named.ctx.fillStyle = "rebeccapurple";
    named.ctx.fillRect(0, 0, 1, 1);
    expect(named.finish().unsupported).toMatch(/rebeccapurple/);
  });

  it("marks a layer as optional content", () => {
    const pdf = createPdfCanvas(FLIP, squares);
    pdf.beginLayer("Nền");
    pdf.ctx.fillRect(0, 0, 1, 1);
    pdf.endLayer();
    const art = pdf.finish();
    expect(art.layers).toEqual(["Nền"]);
    expect(lines(art.content)[0]).toBe("/OC /VL0 BDC");
    expect(lines(art.content).at(-1)).toBe("EMC");
  });
});

describe("print layers", () => {
  const content: SurfaceContent = {
    background: { kind: "color", color: "#F3E7D3" },
    elements: [
      imageEl("logo"),
      textEl("hidden", { hidden: true }),
      textEl("name", { content: "Cà Phê Mộc An" }),
      drawingEl("doodle", {
        strokes: [
          {
            mode: "draw",
            color: "#000000",
            sizeMm: 2,
            points: [
              [0, 0, 1],
              [5, 5, 1],
            ],
          },
        ],
      }),
    ],
  };
  const ops = compose({
    surface: cupBody,
    content,
    target: "print",
    material: "paper-white",
    sizer,
    fonts: FONTS,
    measure: fakeMeasure,
  });

  it("names the background and each visible element by the op compose makes for it", () => {
    const names = printLayerNames(content);
    expect(ops.map((op, i) => [op.op, names[i]])).toEqual([
      ["save", undefined],
      ["clip", undefined],
      ["fill", "Nền"],
      ["image", "1 · Ảnh / logo"],
      ["text", "2 · Chữ “Cà Phê Mộc An”"],
      ["drawing", "3 · Nét vẽ tay"],
      ["restore", undefined],
    ]);
  });

  it("records the composed page as vectors, one layer per element", () => {
    const pdf = createPdfCanvas(FLIP, squares);
    const env: RenderEnv = {
      pxPerMm: 1,
      chrome: {
        guide: "#000000",
        safe: "#000000",
        bleed: "#000000",
        seam: "#000000",
        crease: "#000000",
        shade: "#000000",
        placeholder: "#000000",
      },
      image: () => image(40, 40),
      createLayer: (w, h) => ({ source: image(w, h), ctx: createPdfCanvas(FLIP, squares).ctx }),
    };
    const names = printLayerNames(content);
    execute(ops, pdf.ctx, env, (_op, i, draw) => {
      const name = names[i];
      if (name) pdf.beginLayer(name);
      draw();
      if (name) pdf.endLayer();
    });
    const art = pdf.finish();
    expect(art.unsupported).toBeUndefined();
    expect(art.layers).toEqual([
      "Nền",
      "1 · Ảnh / logo",
      "2 · Chữ “Cà Phê Mộc An”",
      "3 · Nét vẽ tay",
    ]);
    // The logo and the drawing's raster layer are the page's two images.
    expect(art.images).toHaveLength(2);
  });
});
