// @vitest-environment node
import { describe, expect, it } from "vitest";

import type {
  Background,
  DesignDocument,
  DesignElement,
  Hex,
  ImageElement,
  Stroke,
  SurfaceContent,
} from "../document/schema";
import { elementOutline } from "../geometry/element";
import { polarWarp, warpStretch } from "../geometry/polar-warp";
import { dpiTier, placedDpi, printDpi } from "../preflight/rules/resolution";
import { VARIANT_OK } from "../preflight/rules/variant";
import { runPreflight } from "../preflight/run";
import type { PreflightInput, PreflightIssue, PreflightRuleId } from "../preflight/types";
import { effectiveDpi } from "../geometry/units";
import { createSurfaces, cupSector } from "../surfaces";
import type { BagModel, CupModel, CustomizationTemplate, PrintAreaCode } from "../template/schema";
import { bagM, cup12oz, cupBody, drawingEl, imageEl, sizer, textEl } from "./fixtures";

const cupModel = cup12oz.model;
const bagModel = bagM.model;
if (cupModel.kind !== "parametric-cup" || bagModel.kind !== "parametric-bag") {
  throw new Error("The fixtures must be a cup and a bag");
}
const { sweepRad, seamRad, midRadiusMm } = cupSector(cupModel);
/** The centre of the cup's front: `u` is arc length at the mid radius, half the sweep from the left. */
const cupPlacement = {
  u: (sweepRad * midRadiusMm) / 2,
  v: (cupBody.vRange[0] + cupBody.vRange[1]) / 2,
  rotationDeg: 0,
  scale: 1,
};

const NONE: Background = { kind: "none" };
const MIB = 1024 * 1024;

const ASSETS: PreflightInput["assets"] = {
  "asset-1": { contentType: "image/png", sizeBytes: 200_000, status: "ready" },
};
const FONT_STATUS: PreflightInput["fontStatus"] = { "be-vietnam-pro": "ready", lobster: "ready" };

const content = (elements: DesignElement[], background: Background = NONE): SurfaceContent => ({
  background,
  elements,
});

const docOf = (
  surfaces: Partial<Record<PrintAreaCode, SurfaceContent>>,
  template: CustomizationTemplate = bagM,
): DesignDocument => ({
  schemaVersion: 1,
  templateCode: template.code,
  sku: template.sku,
  surfaces,
});

/** A design on the bag front only. */
const onFront = (...elements: DesignElement[]) => docOf({ FRONT: content(elements) });

/** `overrides` replace fields of the kraft-brown bag template (pass a whole template for a cup). */
function input(
  document: DesignDocument,
  overrides: Partial<CustomizationTemplate> = {},
  extra: Partial<PreflightInput> = {},
): PreflightInput {
  const template: CustomizationTemplate = { ...bagM, ...overrides };
  return {
    document,
    template,
    surfaces: createSurfaces(template),
    sizer,
    assets: ASSETS,
    fontStatus: FONT_STATUS,
    variant: VARIANT_OK,
    ...extra,
  };
}

const ruleIds = (issues: PreflightIssue[]) => issues.map((i) => i.ruleId);
const only = (issues: PreflightIssue[], ruleId: PreflightRuleId) =>
  issues.filter((i) => i.ruleId === ruleId);

const cleanDoc = onFront(imageEl("img"), textEl("txt"));

/** 60 × 40 mm image whose DPI is `dpi` (width and height rounded to whole pixels). */
const withLowDpi = (dpi: number) =>
  onFront(
    imageEl("img", {
      naturalWidthPx: Math.round((dpi * 60) / 25.4),
      naturalHeightPx: Math.round((dpi * 40) / 25.4),
    }),
  );

const withText = (content: string, sizePt: number) => onFront(textEl("txt", { content, sizePt }));

describe("runPreflight result", () => {
  it("result is Fail when any issue is fail, else Pass — notes never change Pass", () => {
    expect(runPreflight(input(cleanDoc)).result).toBe("Pass");
    expect(runPreflight(input(cleanDoc)).issues).toEqual([]);

    const noted = runPreflight(input(cleanDoc, { colorMode: "CMYK" }));
    expect(noted.result).toBe("Pass");
    expect(noted.issues.map((i) => i.level)).toEqual(["note"]);

    expect(runPreflight(input(withLowDpi(200))).result).toBe("Fail"); // minDpi 300
    expect(runPreflight(input(withLowDpi(200), { colorMode: "CMYK" })).result).toBe("Fail");
  });

  it("fails a long single-line text that runs past the bleed", () => {
    const report = runPreflight(
      input(withText("THƯƠNG HIỆU CÀ PHÊ SỮA ĐÁ SÀI GÒN ".repeat(4), 48)),
    );
    expect(report.issues).toContainEqual(
      expect.objectContaining({ ruleId: "OUTSIDE_PRINT_AREA", level: "fail" }),
    );
  });

  it("is a Fail whenever any issue fails, whatever order the rules emit them in", () => {
    // Crosses the safe line (emitted first) and is about 100 DPI (emitted after): both fail.
    const doc = onFront(
      imageEl("img", {
        naturalWidthPx: 236,
        naturalHeightPx: 157,
        placement: { u: 32, v: 140, rotationDeg: 0, scale: 1 },
      }),
    );
    const report = runPreflight(input(doc));
    expect(report.result).toBe("Fail");
    expect(ruleIds(report.issues)).toEqual(["CROSSES_SAFE_AREA", "DPI_BELOW_MIN"]);
  });

  it("lists the fails before the notes", () => {
    const doc = onFront(
      imageEl("img", {
        naturalWidthPx: 236,
        naturalHeightPx: 157,
        placement: { u: 32, v: 140, rotationDeg: 0, scale: 1 },
      }),
    );
    const report = runPreflight(input(doc, { colorMode: "CMYK", maxColors: 1 }));
    expect(report.issues.map((i) => i.level)).toEqual(["fail", "fail", "note", "note"]);
  });

  it("skips hidden elements: they are not printed", () => {
    const doc = onFront(
      imageEl("hidden", { hidden: true, naturalWidthPx: 100, naturalHeightPx: 100 }),
      textEl("ghost", { hidden: true, fontCode: "lobster", sizePt: 2 }),
      textEl("shown"),
    );
    const r = runPreflight(input(doc));
    expect(r.issues).toEqual([]);
  });

  it("reports each issue on the surface that holds the element", () => {
    const doc = docOf({
      FRONT: content([imageEl("ok")]),
      BACK: content([imageEl("blurry", { naturalWidthPx: 100, naturalHeightPx: 70 })]),
    });
    expect(only(runPreflight(input(doc)).issues, "DPI_BELOW_MIN")).toEqual([
      expect.objectContaining({ surfaceCode: "BACK", elementId: "blurry" }),
    ]);
  });
});

describe("OUTSIDE_PRINT_AREA (BR-02)", () => {
  it("fails an element that extends past the bleed edge", () => {
    // 60 mm wide centred on u = 10 → left edge at u = -20, bleed is 3 mm.
    const doc = onFront(imageEl("img", { placement: { u: 10, v: 140, rotationDeg: 0, scale: 1 } }));
    expect(only(runPreflight(input(doc)).issues, "OUTSIDE_PRINT_AREA")).toEqual([
      {
        ruleId: "OUTSIDE_PRINT_AREA",
        level: "fail",
        message: "Phần tử nằm ngoài vùng in và sẽ bị cắt mất.",
        surfaceCode: "FRONT",
        elementId: "img",
      },
    ]);
  });

  it("fails an element entirely beyond the bleed box", () => {
    // 2 × 2 mm at u = -10: flat x -11…-9, the bleed box starts at 0.
    const doc = onFront(
      imageEl("speck", {
        widthMm: 2,
        heightMm: 2,
        naturalWidthPx: 400,
        naturalHeightPx: 400,
        placement: { u: -10, v: 140, rotationDeg: 0, scale: 1 },
      }),
    );
    expect(ruleIds(runPreflight(input(doc)).issues)).toEqual(["OUTSIDE_PRINT_AREA"]);
  });

  it("element past print area + bleed fails OUTSIDE_PRINT_AREA; an element wholly in the bleed strip (image, or text anchored there) fails OUTSIDE too", () => {
    // Inside the left bleed strip (u = -1.5 → flat x ≈ 1.5; trim starts at 3): nothing of an image
    // there is in the trim, so it covers none of it (BE overlapsTrim) and is cut off.
    const speck = onFront(
      imageEl("speck", {
        widthMm: 2,
        heightMm: 2,
        naturalWidthPx: 400,
        naturalHeightPx: 400,
        placement: { u: -1.5, v: 140, rotationDeg: 0, scale: 1 },
      }),
    );
    expect(ruleIds(runPreflight(input(speck)).issues)).toEqual(["OUTSIDE_PRINT_AREA"]);

    const word = (u: number) =>
      onFront(
        textEl("word", {
          content: "A",
          sizePt: 8,
          placement: { u, v: 140, rotationDeg: 0, scale: 1 },
        }),
      );
    const inBleed = runPreflight(input(word(-1.5)));
    expect(ruleIds(inBleed.issues)).toEqual(["OUTSIDE_PRINT_AREA"]);
    expect(inBleed.result).toBe("Fail");
    expect(ruleIds(runPreflight(input(word(-10))).issues)).toEqual(["OUTSIDE_PRINT_AREA"]);
  });

  it("fails an element that reaches into the bleed as CROSSES_SAFE_AREA, not OUTSIDE_PRINT_AREA", () => {
    // 262 × 40 mm: 1 mm into the 3 mm bleed on each side, so no corner is inside the trim yet its
    // edges cross it.
    const doc = onFront(
      imageEl("bg", {
        widthMm: 262,
        naturalWidthPx: 6000,
        naturalHeightPx: 3000,
        placement: { u: 130, v: 140, rotationDeg: 0, scale: 1 },
      }),
    );
    const report = runPreflight(input(doc));
    expect(ruleIds(report.issues)).toEqual(["CROSSES_SAFE_AREA"]);
    expect(report.result).toBe("Fail");
  });

  it("accepts a background that fills the bleed box, and tolerates float noise on its edges", () => {
    // The bag front's bleed box is 266 × 286 mm: every corner is outside the trim, which the
    // element encloses.
    const fill = (extraMm: number) =>
      onFront(
        imageEl("bg", {
          widthMm: 266 + extraMm,
          heightMm: 286,
          naturalWidthPx: 8000,
          naturalHeightPx: 8000,
          placement: { u: 130, v: 140, rotationDeg: 0, scale: 1 },
        }),
      );
    expect(ruleIds(runPreflight(input(fill(0))).issues)).toEqual(["CROSSES_SAFE_AREA"]);
    expect(ruleIds(runPreflight(input(fill(1e-9))).issues)).not.toContain("OUTSIDE_PRINT_AREA");
    expect(ruleIds(runPreflight(input(fill(0.05))).issues)).toContain("OUTSIDE_PRINT_AREA");
  });

  it("fails wrapped text on the cup whose arc runs past the bleed", () => {
    const doc = docOf(
      {
        BODY: content([
          textEl("wide", {
            content: "x".repeat(60),
            sizePt: 40, // 60 × 0.5 × 14.1 mm = 423 mm, the trim arc is about 237 mm
            wrap: true,
            placement: cupPlacement,
          }),
        ]),
      },
      cup12oz,
    );
    expect(only(runPreflight(input(doc, { ...cup12oz })).issues, "OUTSIDE_PRINT_AREA")).toEqual([
      expect.objectContaining({ level: "fail", surfaceCode: "BODY", elementId: "wide" }),
    ]);
  });
});

describe("the cup's concave foot (BR-02)", () => {
  // The band's inner (bottom) arc bulges up towards a flat element: the middle of a wide upright
  // logo's bottom edge leaves the area before its corners do.
  const { trimInnerMm, outerRadiusMm } = cupSector(cupModel);
  const safeInnerMm = trimInnerMm + cup12oz.printAreas[0]!.safeMarginMm;
  /** A `widthMm` × 20 mm upright logo on the cup's front whose bottom-edge middle is `footMm` from the apex. */
  const lowLogo = (widthMm: number, footMm: number) =>
    imageEl("logo", {
      widthMm,
      heightMm: 20,
      naturalWidthPx: 4000,
      naturalHeightPx: 1000,
      placement: { ...cupPlacement, v: outerRadiusMm - (footMm + 10) },
    });
  const corners = (el: DesignElement) =>
    elementOutline(el, cupBody, sizer(el)).filter((p) => cupBody.contains(p, "safe"));
  const cupIssues = (el: DesignElement) =>
    ruleIds(runPreflight(input(docOf({ BODY: content([el]) }, cup12oz), cup12oz)).issues);

  it("fails a 120 mm logo whose corners are safe but whose bottom edge passes the bleed", () => {
    const logo = lowLogo(120, trimInnerMm - 3.5);
    expect(corners(logo)).toHaveLength(4); // all four corners are inside the safe area
    expect(cupIssues(logo)).toEqual(["OUTSIDE_PRINT_AREA"]);
  });

  it("fails an 80 mm logo cut at the trim, its corners still inside the safe area", () => {
    const logo = lowLogo(80, trimInnerMm - 0.2);
    expect(corners(logo)).toHaveLength(4);
    expect(cupIssues(logo)).toEqual(["CROSSES_SAFE_AREA"]);
  });

  it("fails a 160 mm logo whose bottom edge dips into the safe margin", () => {
    const logo = lowLogo(160, safeInnerMm - 1);
    expect(corners(logo)).toHaveLength(4);
    expect(cupIssues(logo)).toEqual(["CROSSES_SAFE_AREA"]);
  });

  it("does not fail the same logo once its bottom edge clears the safe line", () => {
    expect(cupIssues(lowLogo(160, safeInnerMm + 0.5))).toEqual([]);
  });
});

describe("CROSSES_SAFE_AREA", () => {
  const crosses = {
    ruleId: "CROSSES_SAFE_AREA",
    level: "fail",
    message: "Phần tử vượt vùng an toàn, có thể bị xén khi cắt.",
    surfaceCode: "FRONT",
    elementId: "img",
  } as const;

  it("fails an element inside the trim that enters the safe margin", () => {
    // Left edge at u = 2: inside the trim, but the safe margin is 5 mm.
    const doc = onFront(imageEl("img", { placement: { u: 32, v: 140, rotationDeg: 0, scale: 1 } }));
    expect(only(runPreflight(input(doc)).issues, "CROSSES_SAFE_AREA")).toEqual([crosses]);
  });

  it("text 1 mm past the safe line fails CROSSES_SAFE_AREA; image the same; background colour and pattern never do; a drawing never does", () => {
    // Left edge of the 60 mm image at u = 2 (the safe line is at u = 5): 3 mm past it; at u = 6 clear.
    const image = (leftU: number) =>
      onFront(imageEl("img", { placement: { u: leftU + 30, v: 140, rotationDeg: 0, scale: 1 } }));
    expect(ruleIds(runPreflight(input(image(4))).issues)).toEqual(["CROSSES_SAFE_AREA"]);
    expect(runPreflight(input(image(6))).issues).toEqual([]);

    // A one-letter text is centred on `u`, so its left edge is just under u.
    const text = (u: number) =>
      onFront(
        textEl("txt", {
          content: "A",
          sizePt: 8,
          placement: { u, v: 140, rotationDeg: 0, scale: 1 },
        }),
      );
    expect(ruleIds(runPreflight(input(text(4.5))).issues)).toEqual(["CROSSES_SAFE_AREA"]);
    expect(runPreflight(input(text(30))).issues).toEqual([]);

    const solid = docOf({ FRONT: content([textEl("t")], { kind: "color", color: "#336699" }) });
    expect(runPreflight(input(solid)).issues).toEqual([]);
    const pattern = docOf({
      FRONT: content([textEl("t")], {
        kind: "pattern",
        patternId: "dots",
        colors: ["#336699", "#222222"],
        scale: 1,
        rotationDeg: 0,
      }),
    });
    expect(runPreflight(input(pattern)).issues).toEqual([]);

    // A drawing in the safe margin (3 mm in from the trim line) is not a safe-zone issue.
    const drawing = onFront(
      drawingEl("pen", {
        strokes: [
          {
            mode: "draw",
            color: "#000000",
            sizeMm: 2,
            points: [
              [-1, 0, 0.5],
              [1, 0, 0.5],
            ],
          },
        ],
        placement: { u: 3, v: 140, rotationDeg: 0, scale: 1 },
      }),
    );
    expect(ruleIds(runPreflight(input(drawing)).issues)).toEqual([]);
  });

  it("fails an element that crosses the trim line into the bleed as CROSSES_SAFE_AREA", () => {
    // Left edge at u = -1 (flat x 2): past the trim line, still inside the 3 mm bleed, so it is cut
    // off at the trim but is not outside the print area.
    const doc = onFront(imageEl("img", { placement: { u: 29, v: 140, rotationDeg: 0, scale: 1 } }));
    const report = runPreflight(input(doc));
    expect(report.issues).toEqual([crosses]);
    expect(report.result).toBe("Fail");
  });

  it("leaves an element already failed as outside the print area to that failure", () => {
    const doc = onFront(imageEl("img", { placement: { u: 10, v: 140, rotationDeg: 0, scale: 1 } }));
    const ids = ruleIds(runPreflight(input(doc)).issues);
    expect(ids).toContain("OUTSIDE_PRINT_AREA");
    expect(ids).not.toContain("CROSSES_SAFE_AREA");
  });

  it("does not fail an element well inside the safe area", () => {
    expect(ruleIds(runPreflight(input(cleanDoc)).issues)).not.toContain("CROSSES_SAFE_AREA");
  });
});

describe("DPI_BELOW_MIN (BR-DSG-001)", () => {
  it("DPI exactly minDpi passes; minDpi - 1 fails with DPI_BELOW_MIN; no DPI_LOW exists", () => {
    // minDpi 400: whole pixels put 400 at 400.0 on the short side, and 399 a hair under it.
    const exact = runPreflight(input(withLowDpi(400), { minDpi: 400 }));
    expect(exact.issues).toEqual([]);
    expect(exact.result).toBe("Pass");

    const short = runPreflight(input(withLowDpi(399), { minDpi: 400 }));
    expect(ruleIds(short.issues)).toEqual(["DPI_BELOW_MIN"]);
    expect(short.result).toBe("Fail");

    // minDpi 150: 200 DPI is under the print file's 300 but meets the minimum, so nothing is raised.
    expect(runPreflight(input(withLowDpi(200), { minDpi: 150 })).issues).toEqual([]);
    expect(runPreflight(input(withLowDpi(299), { minDpi: 150 })).issues).toEqual([]);
    expect(dpiTier(299, 150)).toBe("ok");
  });

  it("fails below minDpi, reporting the rounded DPI", () => {
    const report = runPreflight(input(withLowDpi(200)));
    expect(only(report.issues, "DPI_BELOW_MIN")).toEqual([
      {
        ruleId: "DPI_BELOW_MIN",
        level: "fail",
        message: "Ảnh chỉ đạt 200 DPI, thấp hơn mức tối thiểu 300 DPI.",
        surfaceCode: "FRONT",
        elementId: "img",
      },
    ]);
  });

  it("passes 300 DPI at the default minDpi", () => {
    // 1200 px over 101.6 mm = exactly 300 DPI is fine, 320 too
    const exact = onFront(imageEl("img", { widthMm: 101.6, heightMm: 67.7333333 }));
    expect(runPreflight(input(exact)).issues).toEqual([]);
    expect(runPreflight(input(withLowDpi(320))).issues).toEqual([]);
  });

  it("prints at max(minDpi, 300)", () => {
    expect(printDpi(150)).toBe(300);
    expect(printDpi(300)).toBe(300);
    expect(printDpi(400)).toBe(400);
    expect(dpiTier(149, 150)).toBe("below-min");
    expect(dpiTier(150, 150)).toBe("ok");
  });

  it("scales the placed size, so enlarging an image lowers its DPI", () => {
    // 1200 × 800 px over 120 × 80 mm (60 × 40 at scale 2) = 254 DPI.
    const doc = onFront(
      imageEl("img", { placement: { u: 130, v: 140, rotationDeg: 0, scale: 2 } }),
    );
    expect(only(runPreflight(input(doc)).issues, "DPI_BELOW_MIN")).toEqual([
      expect.objectContaining({ message: "Ảnh chỉ đạt 254 DPI, thấp hơn mức tối thiểu 300 DPI." }),
    ]);
  });

  it("uses the worse of the two axes", () => {
    // 1200 px over 60 mm = 508 DPI wide, but 400 px over 40 mm = 254 DPI tall.
    const doc = onFront(imageEl("img", { naturalHeightPx: 400 }));
    expect(only(runPreflight(input(doc)).issues, "DPI_BELOW_MIN")).toEqual([
      expect.objectContaining({ message: "Ảnh chỉ đạt 254 DPI, thấp hơn mức tối thiểu 300 DPI." }),
    ]);
  });

  it("follows the template's minDpi", () => {
    const report = runPreflight(input(withLowDpi(320), { minDpi: 150 }));
    expect(report.issues).toEqual([]);
  });
});

describe("FONT_NOT_ALLOWED (BR-DSG-001)", () => {
  const issue = (surfaceCode: PrintAreaCode, elementId: string): PreflightIssue => ({
    ruleId: "FONT_NOT_ALLOWED",
    level: "fail",
    message: "Phông chữ này không được phép in hoặc chưa tải được.",
    surfaceCode,
    elementId,
  });

  it("FONT_NOT_ALLOWED fails a font outside a non-empty allowedFontCodes (BE LayoutPreflight)", () => {
    const doc = onFront(textEl("txt", { fontCode: "lobster" }));
    const outside = runPreflight(input(doc, { allowedFontCodes: ["be-vietnam-pro"] }));
    expect(only(outside.issues, "FONT_NOT_ALLOWED")).toEqual([
      {
        ...issue("FRONT", "txt"),
        message: "Phông chữ này không có trong danh sách của mẫu in, hãy đổi phông khác.",
      },
    ]);
    expect(outside.result).toBe("Fail");
    expect(runPreflight(input(doc, { allowedFontCodes: ["lobster"] })).issues).toEqual([]);
    expect(runPreflight(input(doc, { allowedFontCodes: null })).issues).toEqual([]);
    expect(runPreflight(input(doc, { allowedFontCodes: [] })).issues).toEqual([]);
  });

  it('FONT_NOT_ALLOWED also fails an allowed font whose fontStatus is "error"', () => {
    const doc = onFront(textEl("txt", { fontCode: "lobster" }));
    const failed = runPreflight(
      input(doc, { allowedFontCodes: ["lobster"] }, { fontStatus: { lobster: "error" } }),
    );
    expect(only(failed.issues, "FONT_NOT_ALLOWED")).toEqual([issue("FRONT", "txt")]);
    expect(failed.result).toBe("Fail");
  });

  it("fails a font that failed to load, but not one that is still loading", () => {
    const doc = onFront(textEl("txt"));
    const failed = runPreflight(input(doc, {}, { fontStatus: { "be-vietnam-pro": "error" } }));
    expect(only(failed.issues, "FONT_NOT_ALLOWED")).toEqual([issue("FRONT", "txt")]);

    const loading = runPreflight(input(doc, {}, { fontStatus: { "be-vietnam-pro": "loading" } }));
    expect(loading.issues).toEqual([]);
  });
});

describe("ASSET_INVALID (BR-06)", () => {
  const invalid = (surfaceCode: PrintAreaCode, elementId: string): PreflightIssue => ({
    ruleId: "ASSET_INVALID",
    level: "fail",
    message: "Ảnh không hợp lệ hoặc không tải được.",
    surfaceCode,
    elementId,
  });
  const run = (assets: PreflightInput["assets"], overrides: Partial<CustomizationTemplate> = {}) =>
    runPreflight(input(onFront(imageEl("img")), overrides, { assets }));

  it("accepts a ready asset of an allowed type and size", () => {
    expect(run(ASSETS).issues).toEqual([]);
  });

  it("fails an asset that is missing", () => {
    expect(only(run({}).issues, "ASSET_INVALID")).toEqual([invalid("FRONT", "img")]);
  });

  it("fails an asset that failed to load", () => {
    const assets = { "asset-1": { contentType: "image/png", sizeBytes: 1, status: "error" } };
    expect(only(run(assets as PreflightInput["assets"]).issues, "ASSET_INVALID")).toEqual([
      invalid("FRONT", "img"),
    ]);
  });

  it("fails a type outside the template's allowed formats, ignoring case", () => {
    const gif = { "asset-1": { contentType: "image/gif", sizeBytes: 1, status: "ready" } } as const;
    expect(only(run(gif).issues, "ASSET_INVALID")).toEqual([invalid("FRONT", "img")]);

    const upper = {
      "asset-1": { contentType: "IMAGE/PNG", sizeBytes: 1, status: "ready" },
    } as const;
    expect(run(upper).issues).toEqual([]);
  });

  it("accepts MIME types and bare extensions in the allowed formats (the BE seed stores PNG)", () => {
    const asset = (contentType: string) => ({
      "asset-1": { contentType, sizeBytes: 1, status: "ready" as const },
    });
    const invalidFor = (contentType: string, allowedFileFormats: string[]) =>
      only(run(asset(contentType), { allowedFileFormats }).issues, "ASSET_INVALID");

    expect(invalidFor("image/png", ["PNG"])).toEqual([]);
    expect(invalidFor("image/png", ["IMAGE/PNG"])).toEqual([]);
    expect(invalidFor("image/png", ["png"])).toEqual([]);
    expect(invalidFor("image/jpeg", ["JPG"])).toEqual([]);
    expect(invalidFor("image/jpeg", ["JPEG"])).toEqual([]);
    expect(invalidFor("image/jpg", ["image/jpeg"])).toEqual([]);
    expect(invalidFor("image/webp", ["WEBP"])).toEqual([]);
    expect(invalidFor("IMAGE/PNG", ["image/png"])).toEqual([]);

    expect(invalidFor("image/jpeg", ["PNG"])).toEqual([invalid("FRONT", "img")]);
    expect(invalidFor("image/png", ["JPG", "WEBP"])).toEqual([invalid("FRONT", "img")]);
    expect(invalidFor("image/gif", ["PNG", "JPG", "WEBP"])).toEqual([invalid("FRONT", "img")]);
  });

  it("fails a file above maxFileSizeMb and accepts one exactly at it", () => {
    const sized = (sizeBytes: number) =>
      ({ "asset-1": { contentType: "image/png", sizeBytes, status: "ready" } }) as const;
    expect(only(run(sized(20 * MIB + 1)).issues, "ASSET_INVALID")).toEqual([
      invalid("FRONT", "img"),
    ]);
    expect(run(sized(20 * MIB)).issues).toEqual([]);
    expect(only(run(sized(6 * MIB), { maxFileSizeMb: 5 }).issues, "ASSET_INVALID")).toHaveLength(1);
  });
});

describe("EMPTY_DESIGN", () => {
  const empty = {
    ruleId: "EMPTY_DESIGN",
    level: "fail",
    message: "Thiết kế chưa có nội dung.",
  } as const;

  it("fails a design with no element and no background, as a document-level issue", () => {
    const report = runPreflight(input(docOf({})));
    expect(report.issues).toEqual([empty]);
    expect(report.result).toBe("Fail");
    expect(runPreflight(input(docOf({ FRONT: content([]) }))).issues).toEqual([empty]);
  });

  it("fails a design whose only elements are hidden", () => {
    const doc = onFront(textEl("ghost", { hidden: true }));
    expect(runPreflight(input(doc)).issues).toEqual([empty]);
  });

  it("fails a design with only a background colour or pattern (docs 12 §3)", () => {
    const solid = docOf({ LEFT: content([], { kind: "color", color: "#336699" }) });
    expect(runPreflight(input(solid)).issues).toEqual([empty]);

    const pattern = docOf({
      FRONT: content([], {
        kind: "pattern",
        patternId: "dots",
        colors: ["#336699", "#222222"],
        scale: 1,
        rotationDeg: 0,
      }),
    });
    expect(runPreflight(input(pattern)).issues).toEqual([empty]);
  });

  it("is satisfied by one text on any surface", () => {
    const doc = docOf({ BACK: content([textEl("t")]) });
    expect(ruleIds(runPreflight(input(doc)).issues)).not.toContain("EMPTY_DESIGN");
  });

  it("is satisfied by one drawing", () => {
    const pen = drawingEl("pen", {
      strokes: [
        {
          mode: "draw",
          color: "#000000",
          sizeMm: 2,
          points: [
            [-1, 0, 0.5],
            [1, 0, 0.5],
          ],
        },
      ],
      placement: { u: 130, v: 140, rotationDeg: 0, scale: 1 },
    });
    expect(ruleIds(runPreflight(input(onFront(pen))).issues)).not.toContain("EMPTY_DESIGN");
  });
});

describe("ON_SEAM", () => {
  const cupInput = (el: DesignElement) => input(docOf({ BODY: content([el]) }, cup12oz), cup12oz);
  const small = (u: number) =>
    textEl("mark", { content: "A", sizePt: 8, placement: { ...cupPlacement, u } });

  it("text on the cup seam fails ON_SEAM; a drawing on the seam does not", () => {
    const seamU = (sweepRad + seamRad / 2) * midRadiusMm; // the flap starts at u = sweepRad × mid
    const { issues } = runPreflight(cupInput(small(seamU)));
    expect(only(issues, "ON_SEAM")).toEqual([
      {
        ruleId: "ON_SEAM",
        level: "fail",
        message: "Phần tử nằm trên mép dán của ly và sẽ bị che.",
        surfaceCode: "BODY",
        elementId: "mark",
      },
    ]);
    // The safe area stops at the seam, so the flap crosses the safe line too.
    expect(ruleIds(issues)).toEqual(["CROSSES_SAFE_AREA", "ON_SEAM"]);

    const pen = drawingEl("pen", {
      strokes: [
        {
          mode: "draw",
          color: "#000000",
          sizeMm: 2,
          points: [
            [-1, 0, 0.5],
            [1, 0, 0.5],
          ],
        },
      ],
      placement: { ...cupPlacement, u: seamU },
    });
    expect(ruleIds(runPreflight(cupInput(pen)).issues)).not.toContain("ON_SEAM");
  });

  it("does not warn for an element on the front of the cup", () => {
    const report = runPreflight(cupInput(small(cupPlacement.u)));
    expect(report.issues).toEqual([]);
  });

  it("never fires on a bag, which has no seam", () => {
    expect(ruleIds(runPreflight(input(cleanDoc)).issues)).not.toContain("ON_SEAM");
  });
});

describe("TOO_THIN", () => {
  it("is a note", () => {
    const report = runPreflight(input(onFront(textEl("txt", { sizePt: 5.5 }))));
    expect(report.issues.map((i) => i.level)).toEqual(["note"]);
    expect(report.result).toBe("Pass");
  });

  const thin = (elementId: string): PreflightIssue => ({
    ruleId: "TOO_THIN",
    level: "note",
    message: "Nét hoặc chữ quá mảnh để in rõ.",
    surfaceCode: "FRONT",
    elementId,
  });
  const stroke = (sizeMm: number, over: Partial<Stroke> = {}): Stroke => ({
    mode: "draw",
    color: "#000000",
    sizeMm,
    points: [
      [-5, 0, 0.5],
      [5, 0, 0.5],
    ],
    ...over,
  });
  const thinIssues = (el: DesignElement) =>
    only(runPreflight(input(onFront(el))).issues, "TOO_THIN");

  it("adds a note about a stroke thinner than 0.25 mm", () => {
    expect(thinIssues(drawingEl("pen", { strokes: [stroke(0.2)] }))).toEqual([thin("pen")]);
    expect(thinIssues(drawingEl("pen", { strokes: [stroke(0.25)] }))).toEqual([]);
  });

  it("reports one issue per drawing however many strokes are thin", () => {
    const strokes = [stroke(0.1), stroke(0.2), stroke(2)];
    expect(thinIssues(drawingEl("pen", { strokes }))).toEqual([thin("pen")]);
  });

  it("ignores erase strokes, which print no ink", () => {
    expect(thinIssues(drawingEl("pen", { strokes: [stroke(0.1, { mode: "erase" })] }))).toEqual([]);
  });

  it("adds a note about a text outline thinner than 0.25 mm", () => {
    const outlined = (widthMm: number) => textEl("txt", { outline: { color: "#112233", widthMm } });
    expect(thinIssues(outlined(0.2))).toEqual([thin("txt")]);
    expect(thinIssues(outlined(0.3))).toEqual([]);
  });

  it("adds a note about text smaller than 6 pt", () => {
    expect(thinIssues(textEl("txt", { sizePt: 5.5 }))).toEqual([thin("txt")]);
    expect(thinIssues(textEl("txt", { sizePt: 6 }))).toEqual([]);
  });

  it("judges the printed size, scale included", () => {
    const placement = (scale: number) => ({ u: 130, v: 140, rotationDeg: 0, scale });
    expect(thinIssues(textEl("txt", { sizePt: 12, placement: placement(0.4) }))).toEqual([
      thin("txt"),
    ]);
    expect(thinIssues(textEl("txt", { sizePt: 4, placement: placement(2) }))).toEqual([]);
    const pen = drawingEl("pen", { strokes: [stroke(0.1)], placement: placement(3) });
    expect(thinIssues(pen)).toEqual([]);
  });

  it("never flags an image", () => {
    expect(thinIssues(imageEl("img"))).toEqual([]);
  });
});

describe("WHITE_ON_KRAFT", () => {
  const white = (surfaceCode: PrintAreaCode, elementId?: string): PreflightIssue => ({
    ruleId: "WHITE_ON_KRAFT",
    level: "note",
    message: "Giấy kraft không in được màu trắng.",
    surfaceCode,
    ...(elementId === undefined ? {} : { elementId }),
  });
  const whiteIssues = (el: DesignElement, overrides: Partial<CustomizationTemplate> = {}) =>
    only(runPreflight(input(onFront(el), overrides)).issues, "WHITE_ON_KRAFT");
  const pen = (color: Hex) =>
    drawingEl("pen", { strokes: [{ mode: "draw", color, sizeMm: 2, points: [[0, 0, 0.5]] }] });

  it("adds a note about white text on kraft-brown paper", () => {
    expect(whiteIssues(textEl("txt", { color: "#FFFFFF" }))).toEqual([white("FRONT", "txt")]);
  });

  it("adds a note about a white text outline", () => {
    const el = textEl("txt", { color: "#000000", outline: { color: "#FFFFFF", widthMm: 1 } });
    expect(whiteIssues(el)).toEqual([white("FRONT", "txt")]);
  });

  it("adds a note about a near-white stroke, but not an erase stroke", () => {
    expect(whiteIssues(pen("#F8F8F8"))).toEqual([white("FRONT", "pen")]);
    const eraser = drawingEl("pen", {
      strokes: [{ mode: "erase", color: "#FFFFFF", sizeMm: 2, points: [[0, 0, 0.5]] }],
    });
    expect(whiteIssues(eraser)).toEqual([]);
  });

  it("uses WCAG relative luminance: light grey passes, near-white fails", () => {
    expect(whiteIssues(textEl("txt", { color: "#F0F0F0" }))).toEqual([]); // luminance 0.87
    expect(whiteIssues(textEl("txt", { color: "#F8F8F8" }))).toHaveLength(1); // luminance 0.94
    expect(whiteIssues(textEl("txt", { color: "#0000FF" }))).toEqual([]);
  });

  it("adds a note about a white background as a surface-level issue", () => {
    const solid = docOf({ FRONT: content([textEl("t")], { kind: "color", color: "#FFFFFF" }) });
    expect(only(runPreflight(input(solid)).issues, "WHITE_ON_KRAFT")).toEqual([white("FRONT")]);

    const pattern = docOf({
      BACK: content([textEl("t")], {
        kind: "pattern",
        patternId: "stripes",
        colors: ["#222222", "#FFFFFF"],
        scale: 1,
        rotationDeg: 0,
      }),
    });
    expect(only(runPreflight(input(pattern)).issues, "WHITE_ON_KRAFT")).toEqual([white("BACK")]);
  });

  it("applies to kraft bags and cups, not to white kraft, white paper or clear PET", () => {
    const el = textEl("txt", { color: "#FFFFFF" });
    const bagIssues = (material: BagModel["material"]) =>
      whiteIssues(el, { model: { ...bagModel, material } });
    expect(bagIssues("kraft-brown")).toEqual([white("FRONT", "txt")]);
    expect(bagIssues("kraft-white")).toEqual([]);

    const cupIssues = (material: CupModel["material"]) => {
      const doc = docOf({
        BODY: content([textEl("txt", { color: "#FFFFFF", placement: cupPlacement })]),
      });
      const template = { ...cup12oz, model: { ...cupModel, material } };
      return only(runPreflight(input(doc, template)).issues, "WHITE_ON_KRAFT");
    };
    expect(cupIssues("kraft")).toEqual([white("BODY", "txt")]);
    expect(cupIssues("paper-white")).toEqual([]);
    expect(cupIssues("pet-clear")).toEqual([]);
  });
});

describe("TOO_MANY_COLORS", () => {
  const tooMany = (surfaceCode: PrintAreaCode, maxColors: number): PreflightIssue => ({
    ruleId: "TOO_MANY_COLORS",
    level: "note",
    message: `Thiết kế dùng nhiều màu hơn mức cho phép (${maxColors}).`,
    surfaceCode,
  });
  const photoNote = (surfaceCode: PrintAreaCode): PreflightIssue => ({
    ruleId: "TOO_MANY_COLORS",
    level: "note",
    message: "Ảnh được in theo quy trình nhiều màu.",
    surfaceCode,
  });
  const run = (doc: DesignDocument, maxColors: number | null) =>
    only(runPreflight(input(doc, { maxColors })).issues, "TOO_MANY_COLORS");

  it("adds a note when distinct solid colours exceed maxColors", () => {
    const doc = docOf({
      FRONT: content([textEl("a", { color: "#111111" }), textEl("b", { color: "#C0392B" })], {
        kind: "color",
        color: "#F1C40F",
      }),
    });
    expect(run(doc, 2)).toEqual([tooMany("FRONT", 2)]);
    expect(run(doc, 3)).toEqual([]);
  });

  it("counts text outlines, draw strokes and both pattern colours, but not erase strokes", () => {
    const strokes: Stroke[] = [
      { mode: "draw", color: "#00AA00", sizeMm: 2, points: [[0, 0, 0.5]] },
      { mode: "erase", color: "#123456", sizeMm: 2, points: [[0, 0, 0.5]] },
    ];
    const doc = docOf({
      FRONT: content(
        [
          textEl("a", { color: "#111111", outline: { color: "#222222", widthMm: 1 } }),
          drawingEl("d", { strokes }),
        ],
        {
          kind: "pattern",
          patternId: "dots",
          colors: ["#333333", "#444444"],
          scale: 1,
          rotationDeg: 0,
        },
      ),
    });
    // #111111 #222222 #00AA00 #333333 #444444 = 5; the eraser's #123456 is not ink.
    expect(run(doc, 5)).toEqual([]);
    expect(run(doc, 4)).toEqual([tooMany("FRONT", 4)]);
  });

  it("compares colours case-insensitively and ignores hidden elements", () => {
    const doc = onFront(
      textEl("a", { color: "#aabbcc" }),
      textEl("b", { color: "#AABBCC" }),
      textEl("c", { color: "#FF0000", hidden: true }),
    );
    expect(run(doc, 1)).toEqual([]);
  });

  it("counts colours per print surface", () => {
    const doc = docOf({
      FRONT: content([textEl("a", { color: "#111111" }), textEl("b", { color: "#222222" })]),
      BACK: content([textEl("c", { color: "#333333" }), textEl("d", { color: "#444444" })]),
    });
    expect(run(doc, 2)).toEqual([]);
    expect(run(doc, 1)).toEqual([tooMany("FRONT", 1), tooMany("BACK", 1)]);
  });

  it("says a photo is printed in a multi-colour process, not that it uses too many colours", () => {
    const doc = onFront(imageEl("img"));
    expect(run(doc, 4)).toEqual([photoNote("FRONT")]);
  });

  it("shows one note, the colour one, when an image comes with too many solid colours", () => {
    const doc = onFront(
      imageEl("img"),
      textEl("a", { color: "#111111" }),
      textEl("b", { color: "#222222" }),
    );
    expect(run(doc, 1)).toEqual([tooMany("FRONT", 1)]);
    expect(run(doc, 2)).toEqual([photoNote("FRONT")]);
  });

  it("does nothing when the template sets no limit", () => {
    const doc = onFront(imageEl("img"), textEl("a", { color: "#111111" }));
    expect(run(doc, null)).toEqual([]);
  });
});

describe("CMYK_CONVERSION (BR-07)", () => {
  it("adds a single document-level info issue for a CMYK template", () => {
    const report = runPreflight(input(cleanDoc, { colorMode: "CMYK" }));
    expect(report.issues).toEqual([
      {
        ruleId: "CMYK_CONVERSION",
        level: "note",
        message: "Màu sẽ được chuyển sang CMYK khi in, có thể nhạt hơn trên màn hình.",
      },
    ]);
  });

  it("stays silent for an RGB template", () => {
    expect(ruleIds(runPreflight(input(cleanDoc)).issues)).not.toContain("CMYK_CONVERSION");
  });

  it("does not hide a failure behind the note", () => {
    const report = runPreflight(input(withLowDpi(100), { colorMode: "CMYK" }));
    expect(report.result).toBe("Fail");
  });
});

describe("variant rules", () => {
  it('WHITE_ON_KRAFT, TOO_MANY_COLORS, TOO_THIN, CMYK_CONVERSION are level "note"', () => {
    const doc = docOf({
      FRONT: content([textEl("t", { color: "#FFFFFF", sizePt: 5 })], {
        kind: "color",
        color: "#FFFFFF",
      }),
    });
    const report = runPreflight(input(doc, { colorMode: "CMYK", maxColors: 1 }));
    const noted = ["WHITE_ON_KRAFT", "TOO_THIN", "CMYK_CONVERSION"] as const;
    for (const ruleId of noted) {
      expect(only(report.issues, ruleId).length).toBeGreaterThan(0);
      expect(only(report.issues, ruleId).every((i) => i.level === "note")).toBe(true);
    }
    const crowded = runPreflight(input(onFront(imageEl("img")), { maxColors: 4 }));
    expect(only(crowded.issues, "TOO_MANY_COLORS").map((i) => i.level)).toEqual(["note"]);
    expect(report.result).toBe("Pass");
  });

  it("variant { usable: false } adds VARIANT_UNAVAILABLE fail; { hasCartonSpec: false } adds NO_CARTON_SPEC fail; both carry no elementId", () => {
    const unusable = runPreflight(
      input(cleanDoc, {}, { variant: { ...VARIANT_OK, usable: false } }),
    );
    expect(unusable.issues).toEqual([
      {
        ruleId: "VARIANT_UNAVAILABLE",
        level: "fail",
        message: "Quy cách này hiện không còn nhận thiết kế.",
      },
    ]);
    expect(unusable.result).toBe("Fail");

    const noSpec = runPreflight(
      input(cleanDoc, {}, { variant: { ...VARIANT_OK, hasCartonSpec: false } }),
    );
    expect(noSpec.issues).toEqual([
      {
        ruleId: "NO_CARTON_SPEC",
        level: "fail",
        message: "Quy cách chưa có quy cách thùng, chưa gửi duyệt được.",
      },
    ]);
    expect(noSpec.result).toBe("Fail");

    const both = runPreflight(
      input(cleanDoc, {}, { variant: { usable: false, hasCartonSpec: false } }),
    );
    expect(ruleIds(both.issues)).toEqual(["VARIANT_UNAVAILABLE", "NO_CARTON_SPEC"]);
    expect(both.issues.every((i) => i.elementId === undefined)).toBe(true);
    expect(runPreflight(input(cleanDoc)).issues).toEqual([]);
  });
});

describe("DPI of a wrapped image (the outer edge is stretched)", () => {
  const BOX_W = 60;
  const BOX_H = 40;
  const wrapPlacement = { ...cupPlacement, scale: 1 };
  // `dpi` over the 60 × 40 mm frame, whole pixels.
  const cupImage = (dpi: number, overrides: Partial<ImageElement> = {}) =>
    imageEl("img", {
      naturalWidthPx: Math.round((dpi * BOX_W) / 25.4),
      naturalHeightPx: Math.round((dpi * BOX_H) / 25.4),
      placement: wrapPlacement,
      ...overrides,
    });
  const stretchOf = (el: ImageElement) =>
    warpStretch(
      polarWarp(el, cupBody, { x: -BOX_W / 2, y: -BOX_H / 2, width: BOX_W, height: BOX_H })!,
    );
  const cupDpiIssues = (el: ImageElement) =>
    only(
      runPreflight(input(docOf({ BODY: content([el]) }, cup12oz), cup12oz)).issues,
      "DPI_BELOW_MIN",
    );

  it("divides the horizontal DPI by warpStretch when wrapped on the cup", () => {
    const el = cupImage(320, { wrap: true });
    const stretch = stretchOf(el);
    expect(stretch).toBeGreaterThan(1.07);
    const horizontal = effectiveDpi(el.naturalWidthPx, BOX_W) / stretch;
    expect(placedDpi(el, cupBody)).toBeCloseTo(horizontal, 9);
    expect(placedDpi(el, cupBody)).toBeLessThan(placedDpi(el));
  });

  it("fails a wrapped image that the stretch pushes under minDpi; the unwrapped one passes", () => {
    const wrapped = cupImage(320, { wrap: true });
    expect(cupDpiIssues(wrapped)).toEqual([
      expect.objectContaining({ ruleId: "DPI_BELOW_MIN", surfaceCode: "BODY", elementId: "img" }),
    ]);
    expect(cupDpiIssues(cupImage(320))).toEqual([]);
  });

  it("reports the same number the badge shows (rounded, stretch included)", () => {
    const wrapped = cupImage(320, { wrap: true });
    const [issue] = cupDpiIssues(wrapped);
    expect(issue!.message).toBe(
      `Ảnh chỉ đạt ${Math.round(placedDpi(wrapped, cupBody))} DPI, thấp hơn mức tối thiểu 300 DPI.`,
    );
  });

  it("leaves an unwrapped image and any image on a bag unchanged", () => {
    const flat = cupImage(320);
    expect(placedDpi(flat, cupBody)).toBe(placedDpi(flat));
    const onBag = imageEl("img", { wrap: true });
    expect(placedDpi(onBag, createSurfaces(bagM).byCode.FRONT!)).toBe(placedDpi(onBag));
  });
});
