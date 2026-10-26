import { describe, expect, it, vi } from "vitest";

import {
  fitPlacement,
  placeImage,
  replacementPatch,
  safeBox,
  svgRasterWidthPx,
} from "../components/studio/image-actions";
import { SCALE_RANGE } from "../components/studio/element-actions";
import {
  alongEdges,
  createEditor,
  createSurfaces,
  elementOutline,
  emptyDocument,
  type CustomizationTemplate,
  type ImageElement,
  type PrintSurface,
} from "../engine";
import { bagFront, bagM, cup12oz, cupBody, imageEl } from "../engine/__tests__/fixtures";
import type { DesignAsset } from "../types";

const asset = (widthPx: number, heightPx: number): DesignAsset => ({
  assetId: "asset-2",
  designId: "design-1",
  originalName: "new.png",
  contentType: "image/png",
  widthPx,
  heightPx,
  sizeBytes: 1000,
  checksum: "c".repeat(64),
  storedAt: "2026-10-26T00:00:00Z",
});

/**
 * Whether the whole outline of the image at `scale` (centred on the safe area) is inside it: every
 * point along its edges, since the middle of a straight edge leaves a cup's concave foot first.
 */
function insideSafe(surface: PrintSurface, widthMm: number, heightMm: number, scale: number) {
  const { u, v } = safeBox(surface);
  const element = imageEl("i", {
    widthMm,
    heightMm,
    placement: { u, v, rotationDeg: 0, scale },
  });
  const box = { x: -widthMm / 2, y: -heightMm / 2, width: widthMm, height: heightMm };
  return alongEdges(elementOutline(element, surface, box)).every((p) =>
    surface.contains(p, "safe"),
  );
}

/** Places `asset` on the template's first print area and returns what was added. */
function placed(template: CustomizationTemplate, asset_: DesignAsset) {
  const editor = createEditor({ template, document: emptyDocument(template) });
  const surfaces = createSurfaces(template);
  const announce = vi.fn();
  expect(placeImage({ editor, surfaces, announce }, asset_)).toBe(true);
  const { activeSurface, document } = editor.store.getState();
  const [element] = document.surfaces[activeSurface]!.elements as ImageElement[];
  const surface = surfaces.byCode[activeSurface]!;
  const outline = (scale = 1) =>
    elementOutline({ ...element!, placement: { ...element!.placement, scale } }, surface, {
      x: -element!.widthMm / 2,
      y: -element!.heightMm / 2,
      width: element!.widthMm,
      height: element!.heightMm,
    });
  return { element: element!, surface, outline, announce, editor };
}

describe("safeBox", () => {
  it("is the safe area of a flat face: 5 mm in from every edge", () => {
    const { u, v, width, height } = safeBox(bagFront); // the edges are found by bisection
    expect([u, v]).toEqual([130, 140]);
    expect(width).toBeCloseTo(250, 6);
    expect(height).toBeCloseTo(270, 6);
  });

  it("is centred on the band of a cup, short of the seam flap", () => {
    const { u, v, width, height } = safeBox(cupBody);
    const [u0, u1] = cupBody.uRange;
    expect(u).toBeGreaterThan(u0);
    expect(u).toBeLessThan(u1);
    expect(width).toBeGreaterThan(200);
    expect(width).toBeLessThan(u1 - u0);
    expect(height).toBeGreaterThan(80);
    expect(height).toBeLessThan(cupBody.vRange[1] - cupBody.vRange[0]);
    expect(v).toBeCloseTo((cupBody.vRange[0] + cupBody.vRange[1]) / 2, 0);
  });
});

describe("svgRasterWidthPx", () => {
  it("is 2000 px unless 300 DPI over 60 % of the safe width needs more", () => {
    expect(svgRasterWidthPx(cupBody)).toBe(2000);
    expect(svgRasterWidthPx(bagFront)).toBe(2000); // 0.6 × 250 mm = 1772 px
    const wide = createSurfaces({
      ...bagM,
      printAreas: bagM.printAreas.map((area) => ({ ...area, widthMm: 400 })),
    }).byCode.FRONT!;
    // 0.6 × 390 mm at 300 DPI
    expect(svgRasterWidthPx(wide)).toBe(Math.ceil(((0.6 * 390) / 25.4) * 300));
  });
});

describe("fitPlacement", () => {
  it("fills a flat face's safe area on its tighter side, centred and upright", () => {
    const turned = { u: 3, v: 9, rotationDeg: 30, scale: 1 };
    const wide = fitPlacement(
      imageEl("a", { widthMm: 100, heightMm: 50, placement: turned }),
      bagFront,
    );
    expect(wide).toMatchObject({ u: 130, v: 140, rotationDeg: 0 });
    expect(wide.scale).toBeCloseTo(2.5, 6); // 250 mm wide is the tighter side
    const tall = fitPlacement(
      imageEl("b", { widthMm: 40, heightMm: 270, placement: turned }),
      bagFront,
    );
    expect(tall.scale).toBeCloseTo(1, 6); // 270 mm tall is
  });

  it("keeps the outline inside a cup's safe sector, as large as it can", () => {
    const element = imageEl("c", { widthMm: 60, heightMm: 40 });
    const { scale, u, v } = fitPlacement(element, cupBody);
    expect(u).toBe(safeBox(cupBody).u);
    expect(v).toBe(safeBox(cupBody).v);
    expect(insideSafe(cupBody, 60, 40, scale)).toBe(true);
    expect(insideSafe(cupBody, 60, 40, scale * 1.02)).toBe(false);
    // The band is narrower at its foot than the bounding width says: less than a plain box fit.
    expect(scale).toBeLessThan(
      Math.min(safeBox(cupBody).width / 60, safeBox(cupBody).height / 40) + 1e-9,
    );
  });

  it("keeps the middle of a wide logo's bottom edge inside the cup's safe area, not only its corners", () => {
    const { scale } = fitPlacement(imageEl("w", { widthMm: 160, heightMm: 20 }), cupBody);
    expect(insideSafe(cupBody, 160, 20, scale)).toBe(true);
    expect(insideSafe(cupBody, 160, 20, scale * 1.02)).toBe(false);
  });

  it("stays within the scale range of the handles", () => {
    const tiny = imageEl("d", { widthMm: 0.5, heightMm: 0.5 });
    expect(fitPlacement(tiny, bagFront).scale).toBe(SCALE_RANGE.max);
    const huge = imageEl("e", { widthMm: 100_000, heightMm: 100_000 });
    expect(fitPlacement(huge, bagFront).scale).toBe(SCALE_RANGE.min);
  });
});

describe("replacementPatch", () => {
  it("fills the old frame with the new picture's shape", () => {
    const frame = imageEl("f", { widthMm: 30, heightMm: 20 });
    expect(replacementPatch(frame, asset(4000, 1000))).toEqual({
      name: "new.png",
      assetId: "asset-2",
      naturalWidthPx: 4000,
      naturalHeightPx: 1000,
      widthMm: 30,
      heightMm: 7.5,
    });
    expect(replacementPatch(frame, asset(1000, 4000))).toMatchObject({
      widthMm: 5, // 20 mm tall at 1:4
      heightMm: 20,
    });
  });
});

describe("placeImage", () => {
  // The cup's safe area is a sector: a frame as tall as its centre line pokes its top corners past
  // the outer arc (and a wide one its bottom corners past the inner one).
  it.each([
    ["1:1", 1000, 1000],
    ["4:3", 1200, 900],
    ["3:2", 1500, 1000],
    ["1:2", 500, 1000],
    ["2:1", 2000, 1000],
    ["3:1", 3000, 1000],
  ])("keeps a %s image wholly inside the cup's safe area", (_ratio, widthPx, heightPx) => {
    const { element, surface, outline } = placed(cup12oz, asset(widthPx!, heightPx!));
    expect(outline().every((point) => surface.contains(point, "safe"))).toBe(true);
    expect(element.placement).toMatchObject({ rotationDeg: 0, scale: 1 }); // the DPI stays the frame's own
    expect(element.widthMm / element.heightMm).toBeCloseTo(widthPx! / heightPx!, 9);
  });

  it("makes the frame as large as the safe area lets it, up to 60 % of the safe width", () => {
    const { width, height } = safeBox(cupBody);
    for (const [widthPx, heightPx] of [
      [1000, 1000],
      [1200, 900],
      [1500, 1000],
      [500, 1000],
    ] as const) {
      const { element, outline } = placed(cup12oz, asset(widthPx, heightPx));
      expect(element.heightMm).toBeLessThan(height); // shrunk past the safe height...
      expect(outline(1.02).some((point) => !cupBody.contains(point, "safe"))).toBe(true); // ...and no further
    }
    const wide = placed(cup12oz, asset(3000, 1000)).element; // fits as it is: the 60 % rule
    expect(wide.widthMm).toBeCloseTo(0.6 * width, 6);
  });

  it("keeps the 60 % / safe-height rule on a flat face, where the safe area is a rectangle", () => {
    const tall = placed(bagM, asset(500, 1000)).element;
    expect(tall.heightMm).toBeCloseTo(270, 6); // the safe height
    expect(tall.widthMm).toBeCloseTo(135, 6);
    const wide = placed(bagM, asset(3000, 1000)).element;
    expect(wide.widthMm).toBeCloseTo(150, 6); // 60 % of the 250 mm safe width
  });

  it("selects the image, hands over to the select tool and says so", () => {
    const { editor, element, announce } = placed(bagM, asset(2000, 1000));
    expect(editor.store.getState()).toMatchObject({ selectedId: element.id, tool: "select" });
    expect(announce).toHaveBeenCalledWith("Đã thêm ảnh");
  });
});
