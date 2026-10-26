// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ImageElement, SurfaceContent } from "../document/schema";
import { applyToPoint } from "../geometry/affine";
import { elementMatrix } from "../geometry/element";
import { compose, KRAFT_INK_TINT } from "../render/compose";
import type { ComposeTarget, DrawOp, Strip } from "../render/ops";
import { warpStrips } from "../render/warp";
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
    it("wraps text along the cup arc at one radius", () => {
      const ops = compose({
        ...input,
        content: { ...content, elements: [textEl("w", { wrap: true })] },
        target: "print",
      });
      const warped = opOf(ops, "warped")!;
      expect(warped.strips).toHaveLength(48);

      const { outerRadiusMm } = cupSector(cup12oz.model as CupModel);
      const { u, v } = textEl("w").placement;
      const apex = cupBody.toFlat(u, outerRadiusMm);
      const radii = warped.strips.map((s) => {
        const xc = s.srcX + s.srcWidth / 2;
        const centre = applyToPoint(s.matrix, { x: xc, y: 0 });
        return Math.hypot(centre.x - apex.x, centre.y - apex.y);
      });
      radii.forEach((r) => expect(r).toBeCloseTo(radii[0]!, 6));
      expect(radii[0]).toBeCloseTo(outerRadiusMm - v, 6);
    });

    it("keeps the unwarped source op alongside the strips", () => {
      const el = textEl("w", { wrap: true });
      const ops = compose({ ...input, content: { ...content, elements: [el] } });
      const warped = opOf(ops, "warped")!;
      expect(warped.source.op).toBe("text");
      expect(warped.source.matrix).toEqual(elementMatrix(el, cupBody));
      expect(ops.some((o) => o.op === "text")).toBe(false);
    });

    it("warps images too", () => {
      const ops = compose({
        ...input,
        content: { ...content, elements: [imageEl("w", { wrap: true })] },
      });
      expect(opOf(ops, "warped")!.source.op).toBe("image");
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
      expect(ops.some((o) => o.op === "warped")).toBe(false);
      expect(opOf(ops, "drawing")).toMatchObject({
        matrix: elementMatrix(el, cupBody),
        box: sizer(el),
      });
    });

    describe("flipped images", () => {
      const stripsOf = (overrides: Partial<ImageElement>) => {
        const el = imageEl("w", { wrap: true, ...overrides });
        const ops = compose({ ...input, content: { ...content, elements: [el] } });
        return opOf(ops, "warped")!.strips;
      };
      const plain = stripsOf({});
      const centreOf = (s: Strip) => applyToPoint(s.matrix, { x: s.srcX + s.srcWidth / 2, y: 0 });
      const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        expect(a.x).toBeCloseTo(b.x, 6);
        expect(a.y).toBeCloseTo(b.y, 6);
      };

      it("flipX places the leftmost source column at the rightmost arc position", () => {
        const flipped = stripsOf({ flipX: true });
        const { u } = imageEl("w").placement;
        // the first strip samples the leftmost column and sits where the plain last strip does
        near(centreOf(flipped[0]!), centreOf(plain.at(-1)!));
        near(centreOf(flipped.at(-1)!), centreOf(plain[0]!));
        const first = centreOf(flipped[0]!);
        expect(cupBody.fromFlat(first.x, first.y).u).toBeGreaterThan(u);
        // inside every strip the source x axis is mirrored
        flipped.forEach((strip, i) => {
          const mirror = plain[plain.length - 1 - i]!;
          for (const dx of [-0.2, 0, 0.3]) {
            const x = strip.srcX + strip.srcWidth / 2 + dx;
            near(
              applyToPoint(strip.matrix, { x, y: 4 }),
              applyToPoint(mirror.matrix, { x: -x, y: 4 }),
            );
          }
        });
      });

      it("flipY keeps the strip layout and reverses each strip's y axis", () => {
        const flipped = stripsOf({ flipY: true });
        flipped.forEach((strip, i) => {
          const rigid = plain[i]!;
          near(centreOf(strip), centreOf(rigid));
          expect(strip.matrix[0]).toBeCloseTo(rigid.matrix[0]);
          expect(strip.matrix[1]).toBeCloseTo(rigid.matrix[1]);
          expect(strip.matrix[2]).toBeCloseTo(-rigid.matrix[2]);
          expect(strip.matrix[3]).toBeCloseTo(-rigid.matrix[3]);
        });
      });

      it("flipX and flipY together do both", () => {
        const both = stripsOf({ flipX: true, flipY: true });
        const flipX = stripsOf({ flipX: true });
        both.forEach((strip, i) => {
          near(centreOf(strip), centreOf(flipX[i]!));
          expect(strip.matrix[2]).toBeCloseTo(-flipX[i]!.matrix[2]);
          expect(strip.matrix[3]).toBeCloseTo(-flipX[i]!.matrix[3]);
        });
      });

      it("an unflipped wrapped image is unchanged by the flip support", () => {
        expect(stripsOf({ flipX: false, flipY: false })).toEqual(plain);
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
      expect(ops.some((o) => o.op === "warped")).toBe(false);
      expect(opOf(ops, "text")!.matrix).toEqual(elementMatrix(el, bagFront));
    });

    it("does not warp an element that has no wrap flag, even on the cup", () => {
      expect(base("print").some((o) => o.op === "warped")).toBe(false);
    });
  });
});

describe("warpStrips", () => {
  const el = textEl("w", { wrap: true });
  const box = sizer(el);

  it("splits the box into equal contiguous strips, 48 by default", () => {
    const strips = warpStrips(el, cupBody, box);
    expect(strips).toHaveLength(48);
    strips.forEach((s, i) => {
      expect(s.srcWidth).toBeCloseTo(box.width / 48, 9);
      expect(s.srcX).toBeCloseTo(box.x + (i * box.width) / 48, 9);
    });
    const last = strips.at(-1)!;
    expect(last.srcX + last.srcWidth).toBeCloseTo(box.x + box.width, 9);
  });

  it("honours the strip count", () => {
    expect(warpStrips(el, cupBody, box, 8)).toHaveLength(8);
  });

  it("turns each strip to its own upright, so the strips fan out along the arc", () => {
    const strips = warpStrips(el, cupBody, box);
    const angle = (m: readonly number[]) => Math.atan2(m[1]!, m[0]!);
    expect(angle(strips[0]!.matrix)).toBeLessThan(angle(strips.at(-1)!.matrix));
  });

  it("on a rect surface lays the strips out in a straight line", () => {
    const strips = warpStrips(el, bagFront, box);
    const ys = strips.map((s) => applyToPoint(s.matrix, { x: s.srcX + s.srcWidth / 2, y: 0 }).y);
    ys.forEach((y) => expect(y).toBeCloseTo(ys[0]!, 9));
  });
});
