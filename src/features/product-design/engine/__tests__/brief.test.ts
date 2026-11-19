// @vitest-environment node
import { describe, expect, it } from "vitest";

import { emptyDocument } from "../document/factory";
import type { DesignDocument } from "../document/schema";
import { drawBriefPage } from "../export/brief/draw";
import { briefPages, ROWS_PER_PAGE, ROWS_UNDER_DRAWING } from "../export/brief/layout";
import { buildDesignBrief } from "../export/brief/model";
import type { PreflightReport } from "../preflight/types";
import { createSurfaces, cupSector } from "../surfaces";
import type { CustomizationTemplate } from "../template/schema";
import { bagM, cup12oz, drawingEl, FONTS, imageEl, recordingCtx, sizer, textEl } from "./fixtures";

const cupModel = cup12oz.model.kind === "parametric-cup" ? cup12oz.model : null;
const sector = cupSector(cupModel!);
/** The `u` of the cup's front: the middle of the sector without its glue flap. */
const FRONT_U = (sector.sweepRad / 2) * sector.midRadiusMm;

const PASS: PreflightReport = { result: "Pass", issues: [] };

function brief(template: CustomizationTemplate, document: DesignDocument, report = PASS) {
  return buildDesignBrief({
    title: "Ly quán A",
    template,
    surfaces: createSurfaces(template),
    document,
    report,
    sizer,
    fonts: FONTS,
    version: 6,
    exportedAt: "13:56 18/11/2026",
    checksum: "ab".repeat(32),
  });
}

function cupDocument(): DesignDocument {
  const doc = emptyDocument(cup12oz);
  doc.surfaces.BODY = {
    background: { kind: "color", color: "#F3E7D3" },
    elements: [
      imageEl("logo", { placement: { u: FRONT_U - 40, v: 55, rotationDeg: 0, scale: 0.5 } }),
      textEl("hidden", { hidden: true, color: "#00FF00" }),
      textEl("name", {
        content: "Cà Phê  Mộc An",
        color: "#5B3A1E",
        bold: true,
        sizePt: 40,
        placement: { u: FRONT_U + 12.5, v: 48, rotationDeg: 5, scale: 1 },
      }),
      drawingEl("wave", {
        strokes: [
          {
            mode: "draw",
            color: "#5B3A1E",
            sizeMm: 1,
            points: [
              [0, 0, 1],
              [8, 2, 1],
            ],
          },
        ],
        placement: { u: FRONT_U, v: 80, rotationDeg: 0, scale: 1 },
      }),
    ],
  };
  return doc;
}

describe("buildDesignBrief", () => {
  it("measures each printed element from the rim and across from the cup's front", () => {
    const [body] = brief(cup12oz, cupDocument()).areas;
    expect(body?.topLabel).toBe("miệng ly");
    expect(body?.centreLabel).toBe("giữa mặt trước");
    expect(body?.elements.map((el) => [el.number, el.kind])).toEqual([
      [1, "Ảnh / logo"],
      [2, "Chữ"],
      [3, "Nét vẽ tay"],
    ]);
    const [logo, name] = body!.elements;
    expect(logo?.fromTopMm).toBeCloseTo(55, 6);
    expect(logo?.acrossMm).toBeCloseTo(-40, 6);
    // The image's own size times its scale: 60 × 40 mm at 0.5.
    expect([logo?.widthMm, logo?.heightMm]).toEqual([30, 20]);
    expect(name?.acrossMm).toBeCloseTo(12.5, 6);
    expect(name?.rotationDeg).toBe(5);
    expect(name?.content).toBe("“Cà Phê Mộc An”");
    expect(name?.font).toMatch(/, đậm, 40 pt$/);
    expect(body?.background).toBe("Màu trơn #F3E7D3 phủ toàn vùng in, tràn ra lề");
  });

  it("lists every printed colour once, with where it is used (never a hidden element's)", () => {
    const { colors } = brief(cup12oz, cupDocument());
    expect(colors).toEqual([
      { hex: "#F3E7D3", uses: ["Nền · Thân ly"] },
      { hex: "#5B3A1E", uses: ["2 · Chữ · Thân ly", "3 · Nét vẽ tay · Thân ly"] },
    ]);
  });

  it("names the element or area each preflight finding is about", () => {
    const doc = cupDocument();
    const report: PreflightReport = {
      result: "Pass",
      issues: [
        {
          ruleId: "ON_SEAM",
          level: "note",
          message: "Nằm trên mép dán",
          surfaceCode: "BODY",
          elementId: "name",
        },
        { ruleId: "CMYK_CONVERSION", level: "note", message: "Màu đổi sang CMYK" },
      ],
    };
    const result = brief(cup12oz, doc, report);
    expect(result.issues.map((i) => i.where)).toEqual(["2 · Chữ · Thân ly", "Toàn thiết kế"]);
    expect(result.areas[0]?.elements[1]?.warnings).toEqual(["Nằm trên mép dán"]);
  });

  it("measures a bag face from its top edge and its middle, and notes the kraft", () => {
    const doc = emptyDocument(bagM);
    const front = createSurfaces(bagM).byCode.FRONT!;
    const middle = (front.uRange[0] + front.uRange[1]) / 2;
    doc.surfaces.FRONT = {
      background: { kind: "none" },
      elements: [
        textEl("t", {
          placement: { u: middle - 20, v: front.vRange[0] + 30, rotationDeg: 0, scale: 1 },
        }),
      ],
    };
    const result = brief(bagM, doc);
    const area = result.areas.find((a) => a.code === "FRONT")!;
    expect(area.topLabel).toBe("mép trên vùng in");
    expect(area.elements[0]?.fromTopMm).toBeCloseTo(30, 6);
    expect(area.elements[0]?.acrossMm).toBeCloseTo(-20, 6);
    expect(result.material).toBe("Giấy kraft nâu");
    expect(result.materialNote).toMatch(/lót mực trắng/);
  });
});

describe("briefPages", () => {
  it("gives each area a drawing page and carries a long element table on", () => {
    const doc = cupDocument();
    const many = Array.from({ length: ROWS_UNDER_DRAWING + ROWS_PER_PAGE }, (_, i) =>
      textEl(`t${i}`),
    );
    doc.surfaces.BODY = { background: { kind: "none" }, elements: many };
    const pages = briefPages(brief(cup12oz, doc));
    expect(pages.map((p) => p.kind)).toEqual([
      "overview",
      "area",
      "area",
      "area",
      "colors",
      "notes",
    ]);
    // The background row plus 18 elements: 5 under the drawing, 13 then 1.
    expect(pages.slice(1, 4)).toEqual([
      { kind: "area", area: 0, from: 0, to: 5, continued: false },
      { kind: "area", area: 0, from: 5, to: 18, continued: true },
      { kind: "area", area: 0, from: 18, to: 19, continued: true },
    ]);
  });
});

describe("a bag's flat sheet in the brief", () => {
  it("gives the sheet its own page after the overview, its folds named as assumed", () => {
    const result = brief(bagM, emptyDocument(bagM));

    expect(result.sheet).toMatchObject({ trimWidthMm: 780, trimHeightMm: 392, assumed: true });
    expect(result.dimensions).toContain("mép dán 20 mm, gấp đáy 72 mm (giả định)");
    expect(briefPages(result).slice(0, 2)).toEqual([{ kind: "overview" }, { kind: "sheet" }]);
    expect(briefPages(brief(cup12oz, cupDocument())).map((p) => p.kind)).not.toContain("sheet");
  });

  it("draws each side's art, the die line and the folds, with the sheet's sizes", () => {
    const result = brief(bagM, emptyDocument(bagM));
    const pages = briefPages(result);
    const rec = recordingCtx({ glyphWidth: (text) => text.length * 5 });
    const style = {
      ink: "ink",
      guides: { trim: "trim-c", safe: "safe-c", seam: "seam-c", crease: "crease-c" },
    };
    const art = {} as CanvasImageSource;
    drawBriefPage(rec.ctx, result, pages, 1, 4, style, { art: () => art });

    const texts = rec.calls.filter(([m]) => m === "fillText").map(([, t]) => String(t));
    expect(texts).toContain("Tấm trải phẳng (file in)");
    expect(texts).toContain("Tấm trải phẳng 780 × 392 mm");
    expect(texts).toEqual(
      expect.arrayContaining(["Mặt trước", "Hông phải", "Mặt sau", "Hông trái"]),
    );
    expect(rec.calls.filter(([m]) => m === "drawImage")).toHaveLength(4);
    expect(rec.sets.strokeStyle).toEqual(expect.arrayContaining(["trim-c", "crease-c"]));
  });
});

describe("drawBriefPage", () => {
  it("draws every page, positions as the shop measures them, with the guides in the editor's colours", () => {
    const result = brief(cup12oz, cupDocument());
    const pages = briefPages(result);
    const rec = recordingCtx({ glyphWidth: (text) => text.length * 5 });
    const style = {
      ink: "ink",
      guides: { trim: "trim-c", safe: "safe-c", seam: "seam-c", crease: "crease-c" },
    };
    pages.forEach((_, i) =>
      drawBriefPage(rec.ctx, result, pages, i, 4, style, { art: () => undefined }),
    );
    const texts = rec.calls.filter(([m]) => m === "fillText").map(([, t]) => String(t));
    expect(texts).toContain(`Trang 1/${pages.length}`);
    expect(texts.join(" ")).toContain("Cách miệng ly 55 mm;");
    expect(texts.join(" ")).toContain("40 mm về trái so với giữa mặt trước");
    expect(rec.sets.strokeStyle).toEqual(expect.arrayContaining(["trim-c", "safe-c", "seam-c"]));
    expect(rec.sets.fillStyle).toContain("#5B3A1E");
  });
});
