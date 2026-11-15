/**
 * The print configuration of each customizable variant the design mock knows (spec 2026-11-09
 * §4.1 `PrintConfigDto`, §5): today's parametric cup and bag templates, one per CUSTOMIZABLE SKU of
 * the mock catalogue — but `MOCK_SKU_WITHOUT_PRINT_CONFIG`, which answers 404 so the product page's
 * "no print configuration" path can be shown. One variant is BLOCKED and one has no carton spec, so
 * `VARIANT_UNAVAILABLE` and `NO_CARTON_SPEC` can be shown too.
 *
 * Cup numbers are precomputed from the model (2 decimals; sweep in radians to 5): inner/outer are
 * the trim radii of the unrolled annular sector, the box its flat bounding box. The engine's
 * `customizationTemplateSchema` checks that they agree with the model.
 */

import type { Model3dRef } from "@/features/product-design/engine/model3d/schema";
import type {
  BagModel,
  CupModel,
  CustomizationTemplate,
  PrintArea,
} from "@/features/product-design/engine/template/schema";

import { seedMockCatalog } from "./catalog";

export type VariantStatus = "ACTIVE" | "BLOCKED" | "OBSOLETE";

export type FileRules = { minDpi: number; formats: string[]; maxFileSizeMb: number };

/** Served as is by GET /catalog/products/{slug}/variants/{sku}/print-config. */
export type PrintConfigRow = {
  sku: string;
  product: { slug: string; title: string; status: string };
  variantStatus: VariantStatus;
  /** docs 12 BR-05, B25: required before submitting. */
  hasCartonSpec: boolean;
  template: CustomizationTemplate;
  /** The `.glb` beside the template (spec 2026-11-13 §3); only `MOCK_SKU_WITH_MODEL3D` has one. */
  model3d?: Model3dRef | null;
  fileRules: FileRules;
};

/** docs open-questions B34 defaults: 300 DPI, PNG/JPG, 50 MB; formats as lowercase MIME types. */
export const DEFAULT_FILE_RULES: FileRules = {
  minDpi: 300,
  formats: ["image/png", "image/jpeg"],
  maxFileSizeMb: 50,
};

/** A product status that still takes designs (docs 12 BR-01). */
const USABLE_PRODUCT_STATUSES = ["APPROVED", "PUBLISHED"];

/** docs 12 BR-01, catalog BR-14: an ACTIVE variant of a usable product. */
export const isUsable = (config: PrintConfigRow) =>
  config.variantStatus === "ACTIVE" && USABLE_PRODUCT_STATUSES.includes(config.product.status);

/** The template's own rules are the variant's file rules: one source for both. */
const templateRules = () => ({
  minDpi: DEFAULT_FILE_RULES.minDpi,
  allowedFileFormats: [...DEFAULT_FILE_RULES.formats],
  maxFileSizeMb: DEFAULT_FILE_RULES.maxFileSizeMb,
});

interface CupSpec {
  code: string;
  name: string;
  sku: string;
  /** Top diameter, bottom diameter and height of the cup. */
  size: [top: number, bottom: number, height: number];
  seamMm: number;
  /** Print band offsets from the rim and from the base. */
  band: [top: number, bottom: number];
  material: CupModel["material"];
  sector: { innerMm: number; outerMm: number; sweepRad: number };
  box: [width: number, height: number];
}

function cupTemplate(spec: CupSpec): CustomizationTemplate {
  const [topDiameterMm, bottomDiameterMm, heightMm] = spec.size;
  const [bandTopOffsetMm, bandBottomOffsetMm] = spec.band;
  const [widthMm, boxHeightMm] = spec.box;
  return {
    templateId: `tpl-${spec.code.toLowerCase()}`,
    code: spec.code,
    name: spec.name,
    sku: spec.sku,
    ...templateRules(),
    colorMode: "CMYK",
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
  material: BagModel["material"];
}

function bagTemplate(spec: BagSpec): CustomizationTemplate {
  const [widthMm, gussetMm, heightMm] = spec.size;
  const printableMm = heightMm - spec.topFoldMm;
  const face = (code: PrintArea["code"], name: string, faceWidthMm: number): PrintArea => ({
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
    ...templateRules(),
    colorMode: "CMYK",
    maxColors: 4,
    allowedFontCodes: null,
    model: {
      kind: "parametric-bag",
      widthMm,
      gussetMm,
      heightMm,
      topFoldMm: spec.topFoldMm,
      handle: "twisted",
      material: spec.material,
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

/** Shown when the variant has no carton spec yet (submitting fails with NO_CARTON_SPEC). */
export const MOCK_SKU_WITHOUT_CARTON_SPEC = "CUP-PAPER-8OZ-KRAFT";
/** A BLOCKED variant: starting a design on it is VARIANT_UNAVAILABLE. */
export const MOCK_BLOCKED_SKU = "CUP-KRAFT-16OZ";
/** A seeded CUSTOMIZABLE SKU with no print configuration: its print-config answers 404. */
export const MOCK_SKU_WITHOUT_PRINT_CONFIG = "BAG-KRAFT-L";

const TEMPLATES: CustomizationTemplate[] = [
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
    sku: MOCK_SKU_WITHOUT_CARTON_SPEC,
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
    sku: MOCK_BLOCKED_SKU,
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
    material: "kraft-brown",
  }),
];

/**
 * The one mock variant with a `.glb` (`public/models/sample-cup-12oz.glb`, built from the 12 oz cup's
 * numbers by `scripts/make-sample-glb.mjs`): the studio, the preview and "Xem 3D" can be seen with a
 * real model on the mock. `CUP12-LOGO` shares the size spec but not the file.
 */
export const MOCK_SKU_WITH_MODEL3D = "CUP-PAPER-12OZ-WHT";
const MOCK_MODEL3D: Model3dRef = {
  url: "/models/sample-cup-12oz.glb",
  surfaces: [{ printAreaCode: "BODY", meshName: "print:BODY" }],
};

const CATALOG = seedMockCatalog();

/** The mock catalogue's product of a SKU: its slug and title. */
function catalogProductOf(sku: string) {
  const product = CATALOG.find((p) => p.variants.some((v) => v.sku === sku));
  if (!product) throw new Error(`The mock catalogue has no SKU ${sku}`);
  return { slug: product.slug, title: product.title, status: "PUBLISHED" };
}

/** The print configuration by SKU: it hangs off the variant (BE decision D5). */
export const MOCK_PRINT_CONFIGS: Readonly<Record<string, PrintConfigRow>> = Object.fromEntries(
  TEMPLATES.map((template): [string, PrintConfigRow] => [
    template.sku,
    {
      sku: template.sku,
      product: catalogProductOf(template.sku),
      variantStatus: template.sku === MOCK_BLOCKED_SKU ? "BLOCKED" : "ACTIVE",
      hasCartonSpec: template.sku !== MOCK_SKU_WITHOUT_CARTON_SPEC,
      template,
      ...(template.sku === MOCK_SKU_WITH_MODEL3D ? { model3d: structuredClone(MOCK_MODEL3D) } : {}),
      fileRules: structuredClone(DEFAULT_FILE_RULES),
    },
  ]),
);

const DEFAULT_BAG_SKU = "BAG-KRAFT-M";
const DEFAULT_CUP_SKU = "CUP-PET-500ML";

/**
 * The print configuration of a variant, or null when it has none. A product of the mock catalogue
 * has one only for its own SKUs listed above (the server checks the SKU belongs to the product).
 */
export function printConfigFor(slug: string, sku: string): PrintConfigRow | null {
  if (CATALOG.some((p) => p.slug === slug)) {
    const config = MOCK_PRINT_CONFIGS[sku];
    return config && config.product.slug === slug ? structuredClone(config) : null;
  }
  // ASSUMPTION (mock only): a product the mock catalogue does not know — the real catalogue's when
  // USE_MOCK=false — gets the default kraft bag when its slug says "tui"/"bag", else the default PET
  // cup, for the asked SKU, titled by its slug (spec 2026-11-09 §5).
  const base = structuredClone(
    MOCK_PRINT_CONFIGS[/tui|bag/.test(slug) ? DEFAULT_BAG_SKU : DEFAULT_CUP_SKU]!,
  );
  return {
    ...base,
    sku,
    product: { slug, title: slug, status: "PUBLISHED" },
    template: { ...base.template, sku },
  };
}
