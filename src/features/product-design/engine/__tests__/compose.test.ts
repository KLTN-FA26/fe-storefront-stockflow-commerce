// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ImageElement, SurfaceContent } from "../document/schema";
import { elementMatrix } from "../geometry/element";
import { polarWarp, warpToFlat } from "../geometry/polar-warp";
import { arcGlyphs } from "../render/arc-text";
import { compose, KRAFT_INK_TINT } from "../render/compose";
import type { TextMeasurer } from "../render/fonts";
import type { ComposeTarget, DrawOp } from "../render/ops";
import { layoutText } from "../render/text-layout";
import { cupSector } from "../surfaces";
import type { CupModel, MaterialKind } from "../template/schema";
import {
  bagFront,
  cup12oz,
  cupBody,
  drawingEl,
  fakeMeasure,
  FONTS,
  imageEl,
  sizer,
  textEl,
} from "./fixtures";

const content: SurfaceContent = {
  background: { kind: "color", color: "#FFFFFF" },
  elements: [imageEl("img"), textEl("txt")],
};

const input = {
  surface: cupBody,
  content,
  target: "print" as ComposeTarget,
  material: "paper-white" as MaterialKind,
  sizer,
  fonts: FONTS,
  measure: fakeMeasure,
};

const base = (target: ComposeTarget, material: MaterialKind = "paper-white") =>
  compose({ ...input, target, material });

const opOf = <K extends DrawOp["op"]>(ops: DrawOp[], kind: K) =>
  ops.find((o): o is Extract<DrawOp, { op: K }> => o.op === kind);

describe("compose", () => {
  it("clips to bleed, paints background then elements in order", () => {
    expect(base("print").map((o) => o.op)).toEqual([
      "save",
      "clip",
      "fill",
      "image",
      "text",
      "restore",
    ]);
  });

  it("clips and fills the background over the bleed outline", () => {
    const ops = base("print");
    expect(opOf(ops, "clip")!.path).toEqual(cupBody.outline("bleed"));
    expect(opOf(ops, "fill")).toEqual({
      op: "fill",
      path: cupBody.outline("bleed"),
      color: "#FFFFFF",
    });
  });

  it("paints a pattern background over the flat bounds", () => {
    const ops = compose({
      ...input,
      content: {
        ...content,
        background: {
          kind: "pattern",
          patternId: "stripes",
          colors: ["#112233", "#445566"],
          scale: 2,
          rotationDeg: 30,
        },
      },
    });
    expect(opOf(ops, "pattern")).toEqual({
      op: "pattern",
      bounds: cupBody.flatBounds,
      patternId: "stripes",
      colors: ["#112233", "#445566"],
      scale: 2,
      rotationDeg: 30,
    });
    expect(ops.some((o) => o.op === "fill")).toBe(false);
  });

  it("paints no background for kind none", () => {
    const ops = compose({ ...input, content: { ...content, background: { kind: "none" } } });
    expect(ops.map((o) => o.op)).toEqual(["save", "clip", "image", "text", "restore"]);
  });

  it("skips hidden elements", () => {
    const ops = compose({
      ...input,
      content: { ...content, elements: [{ ...imageEl("x"), hidden: true }] },
      target: "print",
    });
    expect(ops.some((o) => o.op === "image")).toBe(false);
  });

  it("draws guides only in the editor", () => {
    expect(base("editor").at(-1)!.op).toBe("guides");
    expect(base("texture").some((o) => o.op === "guides")).toBe(false);
    expect(base("preview").some((o) => o.op === "guides")).toBe(false);
    expect(base("print").some((o) => o.op === "guides")).toBe(false);
  });

  it("shades outside the trim and carries the surface guides after restore", () => {
    const ops = base("editor");
    expect(ops.at(-2)!.op).toBe("restore");
    expect(opOf(ops, "guides")).toEqual({
      op: "guides",
      guides: cupBody.guides(),
      shadeOutside: cupBody.outline("trim"),
    });
  });

  it("multiplies kraft only for texture and preview", () => {
    expect(base("texture", "kraft").some((o) => o.op === "multiply")).toBe(true);
    expect(base("preview", "kraft").some((o) => o.op === "multiply")).toBe(true);
    expect(base("print", "kraft").some((o) => o.op === "multiply")).toBe(false);
    expect(base("editor", "kraft").some((o) => o.op === "multiply")).toBe(false);
    expect(base("texture", "paper-white").some((o) => o.op === "multiply")).toBe(false);
  });

  it("tints kraft and kraft-brown with the kraft ink colour, inside the clip", () => {
    expect(KRAFT_INK_TINT).toBe("#B4875A");
    for (const material of ["kraft", "kraft-brown"] as const) {
      const ops = base("texture", material);
      expect(ops.map((o) => o.op)).toEqual([
        "save",
        "clip",
        "fill",
        "image",
        "text",
        "multiply",
        "restore",
      ]);
      expect(opOf(ops, "multiply")).toEqual({
        op: "multiply",
        path: cupBody.outline("bleed"),
        color: KRAFT_INK_TINT,
      });
    }
    expect(base("texture", "kraft-white").some((o) => o.op === "multiply")).toBe(false);
  });

  it("gives images and text their element matrix, opacity and local data", () => {
    const img = imageEl("img", {
      opacity: 0.5,
      placement: { u: 100, v: 40, rotationDeg: 20, scale: 1.5 },
    });
    const txt = textEl("txt", {
      opacity: 0.25,
      color: "#CC0000",
      outline: { color: "#00CC00", widthMm: 0.4 },
      placement: { u: 150, v: 60, rotationDeg: 10, scale: 2 },
    });
    const plain = textEl("plain");
    const ops = compose({ ...input, content: { ...content, elements: [img, txt, plain] } });

    const image = opOf(ops, "image")!;
    expect(image).toEqual({
      op: "image",
      matrix: elementMatrix(img, cupBody),
      box: sizer(img),
      assetId: "asset-1",
      opacity: 0.5,
    });

    const [text, plainText] = ops.filter((o) => o.op === "text");
    expect(text).toMatchObject({
      op: "text",
      matrix: elementMatrix(txt, cupBody),
      color: "#CC0000",
      outline: { color: "#00CC00", widthMm: 0.4 },
      opacity: 0.25,
    });
    expect(plainText).not.toHaveProperty("outline");
  });

  it("draws a drawing element with its local box and strokes", () => {
    const strokes = [
      {
        mode: "draw" as const,
        color: "#123456" as const,
        sizeMm: 2,
        points: [
          [0, 0, 0.5],
          [10, 5, 0.5],
        ] as [number, number, number][],
      },
    ];
    const el = drawingEl("d", { strokes, opacity: 0.8 });
    const ops = compose({ ...input, content: { ...content, elements: [el] } });
    expect(opOf(ops, "drawing")).toEqual({
      op: "drawing",
      id: "d",
      matrix: elementMatrix(el, cupBody),
      box: sizer(el),
      strokes,
      opacity: 0.8,
    });
  });

  it("keeps element order as the z-order", () => {
    const ops = compose({
      ...input,
      content: { ...content, elements: [textEl("a"), imageEl("b"), textEl("c")] },
    });
    expect(ops.filter((o) => o.op !== "save" && o.op !== "clip").map((o) => o.op)).toEqual([
      "fill",
      "text",
      "image",
      "text",
      "restore",
    ]);
  });

  describe("wrap", () => {
    it("bends text around the cup as its glyphs along the arc, with the rigid op as the source", () => {
      const el = textEl("w", { wrap: true, outline: { color: "#FFFFFF", widthMm: 0.4 } });
      const ops = compose({ ...input, content: { ...content, elements: [el] } });
      const layout = layoutText(el, FONTS, fakeMeasure);
      expect(opOf(ops, "arcText")).toEqual({
        op: "arcText",
        source: {
          op: "text",
          matrix: elementMatrix(el, cupBody),
          layout,
          color: el.color,
          outline: { color: "#FFFFFF", widthMm: 0.4 },
          opacity: el.opacity,
        },
        glyphs: arcGlyphs(el, layout, cupBody, FONTS, fakeMeasure),
      });
      expect(ops.some((o) => o.op === "text")).toBe(false);
    });

    it("measures a wrapped text's glyphs once, however often it is composed", () => {
      const asked: string[] = [];
      const measure: TextMeasurer = (text, css) => {
        asked.push(text);
        return fakeMeasure(text, css);
      };
      const el = textEl("w", { wrap: true, content: "Xin chào\nThế giới" });
      const composeIt = () =>
        compose({ ...input, measure, content: { ...content, elements: [el] } });
      const first = composeIt();
      expect(asked.length).toBeGreaterThan(2);
      asked.length = 0;
      const again = composeIt();
      // The layout's own measure of each line, then the glyphs' key (each line at the reference
      // size): the glyphs' measures were kept.
      expect(asked).toEqual(["Xin chào", "Thế giới", "Xin chào", "Thế giới"]);
      expect(again).toEqual(first);
    });

    describe("images", () => {
      const placement = { u: 140, v: 60, rotationDeg: 0, scale: 1.5 };
      const composed = (el: ImageElement, surface = cupBody) =>
        compose({ ...input, surface, content: { ...content, elements: [el] } });

      it("emits a warpedImage whose warp is the element's polar warp over its box", () => {
        const el = imageEl("w", { wrap: true, opacity: 0.4, placement });
        const ops = composed(el);
        expect(ops.some((o) => o.op === "image")).toBe(false);
        const { sheetRadiiMm, ...op } = opOf(ops, "warpedImage")!;
        // The radii the bleed spans about the apex: what of the element the sheet can show.
        const sector = cupSector(cup12oz.model as CupModel);
        expect(sheetRadiiMm[0]).toBeCloseTo(sector.trimInnerMm - cupBody.bleedMm, 9);
        expect(sheetRadiiMm[1]).toBeCloseTo(sector.trimOuterMm + cupBody.bleedMm, 9);
        expect(op).toEqual({
          op: "warpedImage",
          id: "w",
          source: {
            op: "image",
            matrix: elementMatrix(el, cupBody),
            box: sizer(el),
            assetId: "asset-1",
            opacity: 0.4,
          },
          warp: polarWarp(el, cupBody, sizer(el)),
        });
      });

      it("carries the flips in the warp: flipX mirrors along the arc, flipY across it", () => {
        const warpOf = (flips: Partial<ImageElement>) =>
          opOf(composed(imageEl("w", { wrap: true, placement, ...flips })), "warpedImage")!.warp;
        const plain = warpOf({});
        const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
          expect(a.x).toBeCloseTo(b.x, 9);
          expect(a.y).toBeCloseTo(b.y, 9);
        };
        expect([plain.flipX, plain.flipY]).toEqual([false, false]);
        const both = warpOf({ flipX: true, flipY: true });
        expect([both.flipX, both.flipY]).toEqual([true, true]);
        for (const [x, y] of [
          [-30, -20],
          [12, 5],
          [30, 20],
        ] as const) {
          near(warpToFlat(warpOf({ flipX: true }), x, y), warpToFlat(plain, -x, y));
          near(warpToFlat(warpOf({ flipY: true }), x, y), warpToFlat(plain, x, -y));
          near(warpToFlat(both, x, y), warpToFlat(plain, -x, -y));
        }
      });

      it("emits a plain image op unwrapped, or wrapped on a rect surface", () => {
        const unwrapped = imageEl("w", { placement });
        expect(opOf(composed(unwrapped), "image")!.matrix).toEqual(
          elementMatrix(unwrapped, cupBody),
        );
        const onBag = imageEl("w", { wrap: true, placement: { ...placement, rotationDeg: 25 } });
        const ops = composed(onBag, bagFront);
        expect(ops.some((o) => o.op === "warpedImage")).toBe(false);
        expect(opOf(ops, "image")!.matrix).toEqual(elementMatrix(onBag, bagFront));
      });
    });

    it("draws a wrapped drawing on the cup as a rigid drawing op", () => {
      const el = drawingEl("d", {
        wrap: true,
        placement: { u: 130, v: 40, rotationDeg: 15, scale: 1 },
        strokes: [
          {
            mode: "draw",
            color: "#123456",
            sizeMm: 2,
            points: [
              [0, 0, 1],
              [20, 8, 1],
            ],
          },
        ],
      });
      const ops = compose({ ...input, content: { ...content, elements: [el] } });
      expect(ops.some((o) => o.op === "warpedImage" || o.op === "arcText")).toBe(false);
      expect(opOf(ops, "drawing")).toMatchObject({
        matrix: elementMatrix(el, cupBody),
        box: sizer(el),
      });
    });

    it("draws a wrapped element rigidly on a rect surface, rotation included", () => {
      const el = textEl("w", {
        wrap: true,
        placement: { u: 130, v: 140, rotationDeg: 25, scale: 1 },
      });
      const ops = compose({
        ...input,
        surface: bagFront,
        content: { ...content, elements: [el] },
      });
      expect(ops.some((o) => o.op === "arcText")).toBe(false);
      expect(opOf(ops, "text")!.matrix).toEqual(elementMatrix(el, bagFront));
    });

    it("does not warp an element that has no wrap flag, even on the cup", () => {
      expect(base("print").some((o) => o.op === "warpedImage" || o.op === "arcText")).toBe(false);
    });
  });
});
