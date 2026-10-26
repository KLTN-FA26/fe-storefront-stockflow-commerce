// @vitest-environment node
import { describe, expect, it } from "vitest";

import type {
  Background,
  DesignDocument,
  DesignElement,
  Hex,
  Stroke,
  SurfaceContent,
} from "../document/schema";
import { elementOutline } from "../geometry/element";
import { dpiTier, printDpi } from "../preflight/rules/resolution";
import { runPreflight } from "../preflight/run";
import type { PreflightInput, PreflightIssue, PreflightRuleId } from "../preflight/types";
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
  it("passes a clean design and reports the highest level", () => {
    expect(runPreflight(input(cleanDoc)).result).toBe("Pass");
    expect(runPreflight(input(cleanDoc)).issues).toEqual([]);
    // minDpi 150: 200 meets it but is under the print file's 300 DPI
    expect(runPreflight(input(withLowDpi(200), { minDpi: 150 })).result).toBe("Warning");
    expect(runPreflight(input(withLowDpi(200))).result).toBe("Fail"); // minDpi 300
  });

  it("fails a long single-line text that runs past the bleed", () => {
    const report = runPreflight(
      input(withText("THƯƠNG HIỆU CÀ PHÊ SỮA ĐÁ SÀI GÒN ".repeat(4), 48)),
    );
    expect(report.issues).toContainEqual(
      expect.objectContaining({ ruleId: "OUTSIDE_PRINT_AREA", level: "fail" }),
    );
  });

  it("keeps CMYK as info without failing", () => {
    const r = runPreflight(input(cleanDoc, { colorMode: "CMYK" }));
    expect(r.result).toBe("Pass");
    expect(r.issues[0]!.ruleId).toBe("CMYK_CONVERSION");
  });

  it("is a Fail whenever any issue fails, whatever order the rules emit them in", () => {
    // Crosses the safe line (a warning, emitted first) and is about 100 DPI (a fail, emitted after).
    const doc = onFront(
      imageEl("img", {
        naturalWidthPx: 236,
        naturalHeightPx: 157,
        placement: { u: 32, v: 140, rotationDeg: 0, scale: 1 },
      }),
    );
    const report = runPreflight(input(doc));
    expect(report.result).toBe("Fail");
    expect(ruleIds(report.issues)).toEqual(["DPI_BELOW_MIN", "CROSSES_SAFE_AREA"]);
  });

  it("lists the most severe issues first", () => {
    const doc = onFront(
      imageEl("img", {
        naturalWidthPx: 236,
        naturalHeightPx: 157,
        placement: { u: 32, v: 140, rotationDeg: 0, scale: 1 },
      }),
    );
    const report = runPreflight(input(doc, { colorMode: "CMYK", maxColors: 1 }));
    expect(report.issues.map((i) => i.level)).toEqual(["fail", "warning", "warning", "info"]);
  });

  it("skips hidden elements: they are not printed", () => {
    const doc = onFront(
      imageEl("hidden", { hidden: true, naturalWidthPx: 100, naturalHeightPx: 100 }),
      textEl("ghost", { hidden: true, fontCode: "lobster", sizePt: 2 }),
      textEl("shown"),
    );
    const r = runPreflight(input(doc, { allowedFontCodes: ["be-vietnam-pro"] }));
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

  it("fails an element that lies completely outside the trim box", () => {
    // 2 × 2 mm inside the left bleed strip (u = -1.5 → flat x 0.5…2.5; trim starts at 3).
    const doc = onFront(
      imageEl("speck", {
        widthMm: 2,
        heightMm: 2,
        naturalWidthPx: 400,
        naturalHeightPx: 400,
        placement: { u: -1.5, v: 140, rotationDeg: 0, scale: 1 },
      }),
    );
    expect(ruleIds(runPreflight(input(doc)).issues)).toContain("OUTSIDE_PRINT_AREA");
  });

  it("does not fail an element that reaches into the bleed, it only warns about the cut", () => {
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
    expect(report.result).toBe("Warning");
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

  it("warns about an 80 mm logo cut at the trim, its corners still inside the safe area", () => {
    const logo = lowLogo(80, trimInnerMm - 0.2);
    expect(corners(logo)).toHaveLength(4);
    expect(cupIssues(logo)).toEqual(["CROSSES_SAFE_AREA"]);
  });

  it("warns about a 160 mm logo whose bottom edge dips into the safe margin", () => {
    const logo = lowLogo(160, safeInnerMm - 1);
    expect(corners(logo)).toHaveLength(4);
    expect(cupIssues(logo)).toEqual(["CROSSES_SAFE_AREA"]);
  });

  it("does not warn for the same logo once its bottom edge clears the safe line", () => {
    expect(cupIssues(lowLogo(160, safeInnerMm + 0.5))).toEqual([]);
  });
});

describe("CROSSES_SAFE_AREA", () => {
  it("warns about an element inside the trim that enters the safe margin", () => {
    // Left edge at u = 2: inside the trim, but the safe margin is 5 mm.
    const doc = onFront(imageEl("img", { placement: { u: 32, v: 140, rotationDeg: 0, scale: 1 } }));
    expect(only(runPreflight(input(doc)).issues, "CROSSES_SAFE_AREA")).toEqual([
      {
        ruleId: "CROSSES_SAFE_AREA",
        level: "warning",
        message: "Phần tử vượt vùng an toàn, có thể bị xén khi cắt.",
        surfaceCode: "FRONT",
        elementId: "img",
      },
    ]);
  });

  it("warns about an element that crosses the trim line into the bleed, without failing", () => {
    // Left edge at u = -1 (flat x 2): past the trim line, still inside the 3 mm bleed, so it is cut
    // off at the trim but is not outside the print area.
    const doc = onFront(imageEl("img", { placement: { u: 29, v: 140, rotationDeg: 0, scale: 1 } }));
    const report = runPreflight(input(doc));
    expect(report.issues).toEqual([
      {
        ruleId: "CROSSES_SAFE_AREA",
        level: "warning",
        message: "Phần tử vượt vùng an toàn, có thể bị xén khi cắt.",
        surfaceCode: "FRONT",
        elementId: "img",
      },
    ]);
    expect(report.result).toBe("Warning");
  });

  it("leaves an element already failed as outside the print area to that failure", () => {
    const doc = onFront(imageEl("img", { placement: { u: 10, v: 140, rotationDeg: 0, scale: 1 } }));
    const ids = ruleIds(runPreflight(input(doc)).issues);
    expect(ids).toContain("OUTSIDE_PRINT_AREA");
    expect(ids).not.toContain("CROSSES_SAFE_AREA");
  });

  it("does not warn for an element well inside the safe area", () => {
    expect(ruleIds(runPreflight(input(cleanDoc)).issues)).not.toContain("CROSSES_SAFE_AREA");
  });
});

describe("DPI_BELOW_MIN and DPI_LOW (BR-DSG-001)", () => {
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
    expect(ruleIds(report.issues)).not.toContain("DPI_LOW");
  });

  it("warns from minDpi up to the print file's 300 DPI, and not from there", () => {
    const report = runPreflight(input(withLowDpi(200), { minDpi: 150 }));
    expect(only(report.issues, "DPI_LOW")).toEqual([
      {
        ruleId: "DPI_LOW",
        level: "warning",
        message: "Ảnh đạt 200 DPI, bản in có thể hơi mờ.",
        surfaceCode: "FRONT",
        elementId: "img",
      },
    ]);
    expect(ruleIds(report.issues)).not.toContain("DPI_BELOW_MIN");

    expect(ruleIds(runPreflight(input(withLowDpi(299), { minDpi: 150 })).issues)).toContain(
      "DPI_LOW",
    );
    // 301, not 300: whole pixels put a 300 DPI request at 299.7 on its short side
    expect(runPreflight(input(withLowDpi(301), { minDpi: 150 })).issues).toEqual([]);
  });

  it("has no low band once minDpi is the print DPI or more", () => {
    // minDpi 300: 1200 px over 101.6 mm = exactly 300 DPI is fine, 320 too
    const exact = onFront(imageEl("img", { widthMm: 101.6, heightMm: 67.7333333 }));
    expect(runPreflight(input(exact)).issues).toEqual([]);
    expect(runPreflight(input(withLowDpi(320))).issues).toEqual([]);
    // minDpi 400: the print file is 400 DPI, so 399 fails and 400 passes
    expect(ruleIds(runPreflight(input(withLowDpi(399), { minDpi: 400 })).issues)).toEqual([
      "DPI_BELOW_MIN",
    ]);
    expect(runPreflight(input(withLowDpi(400), { minDpi: 400 })).issues).toEqual([]);
  });

  it("prints at max(minDpi, 300)", () => {
    expect(printDpi(150)).toBe(300);
    expect(printDpi(300)).toBe(300);
    expect(printDpi(400)).toBe(400);
    expect(dpiTier(149, 150)).toBe("below-min");
    expect(dpiTier(150, 150)).toBe("low");
    expect(dpiTier(300, 150)).toBe("ok");
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

  it("fails a font outside the template's allowed list", () => {
    const doc = onFront(textEl("txt", { fontCode: "lobster" }));
    const report = runPreflight(input(doc, { allowedFontCodes: ["be-vietnam-pro"] }));
    expect(only(report.issues, "FONT_NOT_ALLOWED")).toEqual([issue("FRONT", "txt")]);
    expect(report.result).toBe("Fail");
  });

  it("accepts every font when the template sets no list", () => {
    const doc = onFront(textEl("txt", { fontCode: "lobster" }));
    expect(runPreflight(input(doc, { allowedFontCodes: null })).issues).toEqual([]);
  });

  it("treats an empty allowed list as no restriction, like null", () => {
    const doc = onFront(
      textEl("a", { fontCode: "lobster" }),
      textEl("b", { fontCode: "be-vietnam-pro" }),
    );
    expect(runPreflight(input(doc, { allowedFontCodes: [] })).issues).toEqual([]);
  });

  it("accepts a listed font", () => {
    const doc = onFront(textEl("txt"));
    expect(
      runPreflight(input(doc, { allowedFontCodes: ["be-vietnam-pro", "lobster"] })).issues,
    ).toEqual([]);
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

  it("counts only visible elements", () => {
    const doc = onFront(textEl("ghost", { hidden: true }));
    expect(runPreflight(input(doc)).issues).toEqual([empty]);
  });

  it("is satisfied by an element on any surface", () => {
    const doc = docOf({ BACK: content([textEl("t")]) });
    expect(ruleIds(runPreflight(input(doc)).issues)).not.toContain("EMPTY_DESIGN");
  });

  it("is satisfied by a background on any surface", () => {
    const solid = docOf({ LEFT: content([], { kind: "color", color: "#336699" }) });
    expect(ruleIds(runPreflight(input(solid)).issues)).not.toContain("EMPTY_DESIGN");

    const pattern = docOf({
      FRONT: content([], {
        kind: "pattern",
        patternId: "dots",
        colors: ["#336699", "#FFFFFF"],
        scale: 1,
        rotationDeg: 0,
      }),
    });
    expect(ruleIds(runPreflight(input(pattern)).issues)).not.toContain("EMPTY_DESIGN");
  });
});

describe("ON_SEAM", () => {
  const cupInput = (el: DesignElement) => input(docOf({ BODY: content([el]) }, cup12oz), cup12oz);
  const small = (u: number) =>
    textEl("mark", { content: "A", sizePt: 8, placement: { ...cupPlacement, u } });

  it("warns about an element on the glue flap, which also crosses the safe line", () => {
    const seamU = (sweepRad + seamRad / 2) * midRadiusMm; // the flap starts at u = sweepRad × mid
    const { issues } = runPreflight(cupInput(small(seamU)));
    expect(only(issues, "ON_SEAM")).toEqual([
      {
        ruleId: "ON_SEAM",
        level: "warning",
        message: "Phần tử nằm trên mép dán của ly và sẽ bị che.",
        surfaceCode: "BODY",
        elementId: "mark",
      },
    ]);
    // The safe area stops at the seam, so the flap crosses the safe line too.
    expect(ruleIds(issues)).toEqual(["CROSSES_SAFE_AREA", "ON_SEAM"]);
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
  const thin = (elementId: string): PreflightIssue => ({
    ruleId: "TOO_THIN",
    level: "warning",
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

  it("warns about a stroke thinner than 0.25 mm", () => {
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

  it("warns about a text outline thinner than 0.25 mm", () => {
    const outlined = (widthMm: number) => textEl("txt", { outline: { color: "#112233", widthMm } });
    expect(thinIssues(outlined(0.2))).toEqual([thin("txt")]);
    expect(thinIssues(outlined(0.3))).toEqual([]);
  });

  it("warns about text smaller than 6 pt", () => {
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
    level: "warning",
    message: "Giấy kraft không in được màu trắng.",
    surfaceCode,
    ...(elementId === undefined ? {} : { elementId }),
  });
  const whiteIssues = (el: DesignElement, overrides: Partial<CustomizationTemplate> = {}) =>
    only(runPreflight(input(onFront(el), overrides)).issues, "WHITE_ON_KRAFT");
  const pen = (color: Hex) =>
    drawingEl("pen", { strokes: [{ mode: "draw", color, sizeMm: 2, points: [[0, 0, 0.5]] }] });

  it("warns about white text on kraft-brown paper", () => {
    expect(whiteIssues(textEl("txt", { color: "#FFFFFF" }))).toEqual([white("FRONT", "txt")]);
  });

  it("warns about a white text outline", () => {
    const el = textEl("txt", { color: "#000000", outline: { color: "#FFFFFF", widthMm: 1 } });
    expect(whiteIssues(el)).toEqual([white("FRONT", "txt")]);
  });

  it("warns about a near-white stroke, but not an erase stroke", () => {
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

  it("warns about a white background as a surface-level issue", () => {
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
    level: "warning",
    message: `Thiết kế dùng nhiều màu hơn mức cho phép (${maxColors}).`,
    surfaceCode,
  });
  const run = (doc: DesignDocument, maxColors: number | null) =>
    only(runPreflight(input(doc, { maxColors })).issues, "TOO_MANY_COLORS");

  it("warns when distinct solid colours exceed maxColors", () => {
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

  it("warns about any image when maxColors is set", () => {
    const doc = onFront(imageEl("img"));
    expect(run(doc, 4)).toEqual([tooMany("FRONT", 4)]);
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
        level: "info",
        message: "Màu sẽ được chuyển sang CMYK khi in, có thể nhạt hơn trên màn hình.",
      },
    ]);
  });

  it("stays silent for an RGB template", () => {
    expect(ruleIds(runPreflight(input(cleanDoc)).issues)).not.toContain("CMYK_CONVERSION");
  });

  it("does not hide a failure behind the info issue", () => {
    const report = runPreflight(input(withLowDpi(100), { colorMode: "CMYK" }));
    expect(report.result).toBe("Fail");
  });
});
