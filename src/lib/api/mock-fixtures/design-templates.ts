/**
 * Customization templates the mock backend serves for the design studio (spec §4.1, §7.2 P2): the
 * parametric cup and bag models plus their print areas, one template per customizable SKU of the
 * mock catalogue. They are plain DTO-shaped data (`src/lib` never imports `src/features`); the
 * feature side parses every value with the engine's `customizationTemplateSchema`, whose refine
 * checks that a cup's sector copy in `shape` agrees with the geometry derived from the model.
 *
 * Numbers are precomputed from the model (2 decimals; sweep in radians to 5): inner/outer are the
 * trim radii of the unrolled annular sector, `box*` its flat bounding box.
 * `maxColors` and `allowedFontCodes` are `null` here (no restriction); the store leaves null
 * fields out of what it serves (NON_NULL), as the BE would.
 */

export type MockPrintAreaCode = "BODY" | "FRONT" | "BACK" | "LEFT" | "RIGHT";

export interface MockPrintArea {
  code: MockPrintAreaCode;
  name: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  safeMarginMm: number;
  bleedMm: number;
  shape:
    | { type: "rect" }
    | {
        type: "annular-sector";
        innerRadiusMm: number;
        outerRadiusMm: number;
        sweepRad: number;
        seamMm: number;
      };
  uvMapping: { meshPart: string };
}

export interface MockCupModel {
  kind: "parametric-cup";
  topDiameterMm: number;
  bottomDiameterMm: number;
  heightMm: number;
  rimMm: number;
  seamMm: number;
  bandTopOffsetMm: number;
  bandBottomOffsetMm: number;
  material: "paper-white" | "kraft" | "pet-clear";
}

export interface MockBagModel {
  kind: "parametric-bag";
  widthMm: number;
  gussetMm: number;
  heightMm: number;
  topFoldMm: number;
  handle: "twisted" | "flat" | "none";
  material: "kraft-brown" | "kraft-white";
}

export interface MockDesignTemplate {
  templateId: string;
  code: string;
  name: string;
  sku: string;
  minDpi: number;
  colorMode: "RGB" | "CMYK";
  allowedFileFormats: string[];
  maxFileSizeMb: number;
  maxColors: number | null;
  allowedFontCodes: string[] | null;
  model: MockCupModel | MockBagModel;
  printAreas: MockPrintArea[];
}

const FORMATS = ["image/png", "image/jpeg", "image/webp"];

interface CupSpec {
  code: string;
  name: string;
  sku: string;
  minDpi?: number;
  /** Top diameter, bottom diameter and height of the cup. */
  size: [top: number, bottom: number, height: number];
  seamMm: number;
  /** Print band offsets from the rim and from the base. */
  band: [top: number, bottom: number];
  material: MockCupModel["material"];
  sector: { innerMm: number; outerMm: number; sweepRad: number };
  box: [width: number, height: number];
}

function cupTemplate(spec: CupSpec): MockDesignTemplate {
  const [topDiameterMm, bottomDiameterMm, heightMm] = spec.size;
  const [bandTopOffsetMm, bandBottomOffsetMm] = spec.band;
  const [widthMm, boxHeightMm] = spec.box;
  return {
    templateId: `tpl-${spec.code.toLowerCase()}`,
    code: spec.code,
    name: spec.name,
    sku: spec.sku,
    minDpi: spec.minDpi ?? 150,
    colorMode: "CMYK",
    allowedFileFormats: [...FORMATS],
    maxFileSizeMb: 20,
    maxColors: null,
    allowedFontCodes: null,
    model: {
      kind: "parametric-cup",
      topDiameterMm,
      bottomDiameterMm,
      heightMm,
      rimMm: 3,
      seamMm: spec.seamMm,
      bandTopOffsetMm,
      bandBottomOffsetMm,
      material: spec.material,
    },
    printAreas: [
      {
        code: "BODY",
        name: "Thân ly",
        xMm: 0,
        yMm: 0,
        widthMm,
        heightMm: boxHeightMm,
        safeMarginMm: 3,
        bleedMm: 2,
        shape: {
          type: "annular-sector",
          innerRadiusMm: spec.sector.innerMm,
          outerRadiusMm: spec.sector.outerMm,
          sweepRad: spec.sector.sweepRad,
          seamMm: spec.seamMm,
        },
        uvMapping: { meshPart: "body" },
      },
    ],
  };
}

interface BagSpec {
  code: string;
  name: string;
  sku: string;
  /** Width, gusset and height of the bag; the printable height is the height minus the top fold. */
  size: [width: number, gusset: number, height: number];
  topFoldMm: number;
}

function bagTemplate(spec: BagSpec): MockDesignTemplate {
  const [widthMm, gussetMm, heightMm] = spec.size;
  const printableMm = heightMm - spec.topFoldMm;
  const face = (code: MockPrintAreaCode, name: string, faceWidthMm: number): MockPrintArea => ({
    code,
    name,
    xMm: 0,
    yMm: 0,
    widthMm: faceWidthMm,
    heightMm: printableMm,
    safeMarginMm: 5,
    bleedMm: 3,
    shape: { type: "rect" },
    uvMapping: { meshPart: code.toLowerCase() },
  });
  return {
    templateId: `tpl-${spec.code.toLowerCase()}`,
    code: spec.code,
    name: spec.name,
    sku: spec.sku,
    minDpi: 150,
    colorMode: "CMYK",
    allowedFileFormats: [...FORMATS],
    maxFileSizeMb: 20,
    maxColors: 4,
    allowedFontCodes: null,
    model: {
      kind: "parametric-bag",
      widthMm,
      gussetMm,
      heightMm,
      topFoldMm: spec.topFoldMm,
      handle: "twisted",
      material: "kraft-brown",
    },
    printAreas: [
      face("FRONT", "Mặt trước", widthMm),
      face("BACK", "Mặt sau", widthMm),
      face("LEFT", "Hông trái", gussetMm),
      face("RIGHT", "Hông phải", gussetMm),
    ],
  };
}

const cup8oz = {
  size: [80, 56, 92],
  seamMm: 8,
  band: [6, 8],
  sector: { innerMm: 224.49, outerMm: 303.26, sweepRad: 0.81266 },
  box: [249.57, 100.35],
} satisfies Partial<CupSpec>;

const cup12oz = {
  size: [90, 60, 110],
  seamMm: 8,
  band: [6, 8],
  material: "paper-white",
  sector: { innerMm: 230.04, outerMm: 327.05, sweepRad: 0.84894 },
  box: [279.67, 120.85],
} satisfies Partial<CupSpec>;

const TEMPLATES: MockDesignTemplate[] = [
  cupTemplate({
    ...cup8oz,
    code: "CUP8-WHT",
    name: "Ly giấy 8oz trắng – thân ly",
    sku: "CUP-PAPER-8OZ-WHT",
    material: "paper-white",
  }),
  cupTemplate({
    ...cup8oz,
    code: "CUP8-KRAFT",
    name: "Ly giấy 8oz kraft – thân ly",
    sku: "CUP-PAPER-8OZ-KRAFT",
    material: "kraft",
  }),
  cupTemplate({
    ...cup12oz,
    code: "CUP12-BODY",
    name: "Ly giấy 12oz – thân ly",
    sku: "CUP-PAPER-12OZ-WHT",
  }),
  cupTemplate({
    ...cup12oz,
    code: "CUP12-LOGO",
    name: "Ly giấy in logo 12oz – thân ly",
    sku: "CUP-CUSTOM-LOGO",
  }),
  cupTemplate({
    code: "CUP16-KRAFT",
    name: "Ly giấy kraft 16oz – thân ly",
    sku: "CUP-KRAFT-16OZ",
    size: [90, 60, 135],
    seamMm: 8,
    band: [6, 8],
    material: "kraft",
    sector: { innerMm: 279.66, outerMm: 401.49, sweepRad: 0.69386 },
    box: [283.77, 141.32],
  }),
  cupTemplate({
    code: "PET500-BODY",
    name: "Ly nhựa PET 500ml – thân ly",
    sku: "CUP-PET-500ML",
    minDpi: 200,
    size: [95, 60, 150],
    seamMm: 0,
    band: [10, 10],
    material: "pet-clear",
    sector: { innerMm: 268.89, outerMm: 399.9, sweepRad: 0.7281 },
    box: [284.78, 148.64],
  }),
  bagTemplate({
    code: "BAGM-4F",
    name: "Túi kraft size M – in 4 mặt",
    sku: "BAG-KRAFT-M",
    size: [260, 120, 320],
    topFoldMm: 40,
  }),
  bagTemplate({
    code: "BAGL-4F",
    name: "Túi kraft size L – in 4 mặt",
    sku: "BAG-KRAFT-L",
    size: [320, 120, 420],
    topFoldMm: 45,
  }),
];

/** Template by SKU: the template hangs off the variant (BE decision D5). */
export const MOCK_DESIGN_TEMPLATES: Record<string, MockDesignTemplate> = Object.fromEntries(
  TEMPLATES.map((template) => [template.sku, template]),
);

/** The mock catalogue's product slug of every customizable SKU (`mock-fixtures/catalog.ts` seed). */
export const MOCK_DESIGN_PRODUCT_SLUGS: Readonly<Record<string, string>> = {
  "CUP-PAPER-8OZ-WHT": "ly-giay-2-lop-8oz",
  "CUP-PAPER-8OZ-KRAFT": "ly-giay-2-lop-8oz",
  "CUP-PAPER-12OZ-WHT": "ly-giay-2-lop-12oz",
  "CUP-CUSTOM-LOGO": "ly-giay-in-logo",
  "CUP-KRAFT-16OZ": "ly-giay-kraft-16oz",
  "CUP-PET-500ML": "ly-nhua-pet-500ml",
  "BAG-KRAFT-M": "tui-giay-kraft",
  "BAG-KRAFT-L": "tui-giay-kraft",
};
