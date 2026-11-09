import { describe, expect, it } from "vitest";

import { customizationTemplateSchema } from "@/features/product-design/engine/template/schema";

import { seedMockCatalog } from "./catalog";
import {
  MOCK_BLOCKED_SKU,
  MOCK_PRINT_CONFIGS,
  MOCK_SKU_WITHOUT_CARTON_SPEC,
  MOCK_SKU_WITHOUT_PRINT_CONFIG,
  printConfigFor,
} from "./design-print-configs";

const CATALOG = seedMockCatalog();
const productOf = (sku: string) => CATALOG.find((p) => p.variants.some((v) => v.sku === sku))!;
const customizableSkus = CATALOG.filter((p) => p.kind === "CUSTOMIZABLE").flatMap((p) =>
  p.variants.map((v) => v.sku),
);

describe("MOCK_PRINT_CONFIGS", () => {
  it("covers every CUSTOMIZABLE SKU of the mock catalogue but the one listed without a configuration", () => {
    expect(customizableSkus).toContain(MOCK_SKU_WITHOUT_PRINT_CONFIG);
    expect(Object.keys(MOCK_PRINT_CONFIGS).sort()).toEqual(
      customizableSkus.filter((sku) => sku !== MOCK_SKU_WITHOUT_PRINT_CONFIG).sort(),
    );
  });

  it("serves templates the engine parses, for the catalogue's product, with the docs' default file rules", () => {
    for (const [sku, config] of Object.entries(MOCK_PRINT_CONFIGS)) {
      const product = productOf(sku);
      expect(config.sku, sku).toBe(sku);
      expect(config.product, sku).toEqual({
        slug: product.slug,
        title: product.title,
        status: "PUBLISHED",
      });
      expect(customizationTemplateSchema.safeParse(config.template).success, sku).toBe(true);
      expect(config.template.sku, sku).toBe(sku);
      // docs open-questions B34: 300 DPI, PNG/JPG, 50 MB — as lowercase MIME types.
      expect(config.fileRules).toEqual({
        minDpi: 300,
        formats: ["image/png", "image/jpeg"],
        maxFileSizeMb: 50,
      });
      expect(config.template.minDpi).toBe(config.fileRules.minDpi);
      expect(config.template.allowedFileFormats).toEqual(config.fileRules.formats);
      expect(config.template.maxFileSizeMb).toBe(config.fileRules.maxFileSizeMb);
    }
  });

  it("has one blocked variant and one variant without a carton spec, the others ACTIVE with one", () => {
    expect(MOCK_PRINT_CONFIGS[MOCK_BLOCKED_SKU]).toMatchObject({ variantStatus: "BLOCKED" });
    expect(MOCK_PRINT_CONFIGS[MOCK_SKU_WITHOUT_CARTON_SPEC]).toMatchObject({
      variantStatus: "ACTIVE",
      hasCartonSpec: false,
    });
    const others = Object.values(MOCK_PRINT_CONFIGS).filter(
      (c) => c.sku !== MOCK_BLOCKED_SKU && c.sku !== MOCK_SKU_WITHOUT_CARTON_SPEC,
    );
    expect(others.every((c) => c.variantStatus === "ACTIVE" && c.hasCartonSpec)).toBe(true);
  });
});

describe("printConfigFor", () => {
  it("answers the configuration of a known SKU of its own product, as a copy", () => {
    const config = printConfigFor("ly-giay-2-lop-12oz", "CUP-PAPER-12OZ-WHT");
    expect(config).toEqual(MOCK_PRINT_CONFIGS["CUP-PAPER-12OZ-WHT"]);
    config!.template.printAreas.length = 0;
    expect(MOCK_PRINT_CONFIGS["CUP-PAPER-12OZ-WHT"]!.template.printAreas).toHaveLength(1);
  });

  it("answers null for an unknown SKU of a known product, a SKU of another product, the listed SKU and a STANDARD product", () => {
    expect(printConfigFor("ly-giay-2-lop-12oz", "CUP-NOPE")).toBeNull();
    expect(printConfigFor("ly-giay-2-lop-12oz", "BAG-KRAFT-M")).toBeNull();
    expect(
      printConfigFor(productOf(MOCK_SKU_WITHOUT_PRINT_CONFIG).slug, MOCK_SKU_WITHOUT_PRINT_CONFIG),
    ).toBeNull();
    expect(printConfigFor("nap-ly-90mm", "LID-90MM-BLK")).toBeNull();
  });

  it("gives a product the mock does not know the default bag or PET cup by its slug, titled by the slug", () => {
    const bag = printConfigFor("tui-giay-quai-det", "REAL-BAG-01");
    expect(bag).toMatchObject({
      sku: "REAL-BAG-01",
      product: { slug: "tui-giay-quai-det", title: "tui-giay-quai-det", status: "PUBLISHED" },
      variantStatus: "ACTIVE",
      hasCartonSpec: true,
    });
    expect(bag!.template.model.kind).toBe("parametric-bag");
    expect(bag!.template.sku).toBe("REAL-BAG-01");
    expect(customizationTemplateSchema.safeParse(bag!.template).success).toBe(true);

    expect(printConfigFor("paper-bag-large", "REAL-BAG-02")!.template.model.kind).toBe(
      "parametric-bag",
    );

    const cup = printConfigFor("ly-nhua-cao-cap", "REAL-CUP-01");
    expect(cup!.template.model).toMatchObject({ kind: "parametric-cup", material: "pet-clear" });
    expect(cup!.template.sku).toBe("REAL-CUP-01");
    expect(cup!.product.title).toBe("ly-nhua-cao-cap");
  });
});
