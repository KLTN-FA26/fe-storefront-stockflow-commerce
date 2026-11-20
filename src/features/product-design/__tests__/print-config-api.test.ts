import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import { getDesignPrintConfig, getPrintConfig } from "../api";
import { preflightVariant } from "../components/studio/use-preflight";
import { variantIssues } from "../engine/preflight/rules/variant";
import { templateDtoSchema } from "../print-config-dtos";
import { toPrintConfig } from "../print-config-mappers";
import { isPrintConfigUsable } from "../selectors";
import { customizationDto, design, ids, templateDto } from "./fixtures";

// The BE has no print-config object: a variant's comes from the product's customization, a
// design's from its own template. What it does not give is decided in `print-config-mappers.ts`
// and `api-print-config.ts` (F-22, F-23, F-7), as asserted here.

afterEach(() => vi.restoreAllMocks());

const SKU = templateDto().sku as string;
const SLUG = "ly-giay-2-lop-12oz";
const MODEL3D = {
  url: "https://files.example.vn/cup.glb?sig=abc",
  surfaces: [{ printAreaCode: "BODY", meshName: "print:BODY" }],
};

/** `api.get` answering by path: the customization, the product detail and the design's template. */
function backend(answers: { customization?: unknown; product?: unknown; template?: unknown }) {
  return vi.spyOn(api, "get").mockImplementation(async (url) => {
    const path = String(url);
    const answer = path.endsWith("/customization")
      ? answers.customization
      : path.endsWith("/template")
        ? answers.template
        : answers.product;
    if (answer instanceof Error) throw answer;
    return { data: answer };
  });
}

describe("a variant's print configuration, from the product's customization (F-22)", () => {
  it("maps a template with its nulls omitted, and the fields the BE does not give", async () => {
    const get = backend({
      customization: customizationDto([
        templateDto({ sku: "OTHER", code: "OTHER" }),
        templateDto({ hasCartonSpec: true }),
      ]),
      product: { title: "Ly giấy 2 lớp 12oz", slug: SLUG },
    });

    const config = await getPrintConfig(SLUG, SKU);

    expect(config).toMatchObject({
      sku: SKU,
      // F-22: listed means ACTIVE of a PUBLISHED product.
      variantStatus: "ACTIVE",
      product: { slug: SLUG, title: "Ly giấy 2 lớp 12oz", status: "PUBLISHED" },
      hasCartonSpec: true,
      // `maxColors` / `allowedFontCodes` left out by the BE are `null`.
      template: { maxColors: null, allowedFontCodes: null, code: "CUP12-BODY" },
      // F-22: the template's own limits are the file rules.
      fileRules: {
        minDpi: 300,
        formats: ["image/png", "image/jpeg", "image/webp"],
        maxFileSizeMb: 20,
      },
      model3d: null, // omitted, not null, when the template has no file
    });
    // The real BE gets the plain read: the `sku` hint is for the design mock only.
    expect(get).toHaveBeenCalledWith(`/catalog/products/${SLUG}/customization`, {});
  });

  it("carries the template's own .glb to model3d, and drops an invalid one to null with a warning", async () => {
    backend({
      customization: customizationDto([templateDto({ hasCartonSpec: true, model3d: MODEL3D })]),
      product: { title: "Ly" },
    });
    expect((await getPrintConfig(SLUG, SKU)).model3d).toEqual(MODEL3D);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    backend({
      customization: customizationDto([
        templateDto({ hasCartonSpec: true, model3d: { url: "x", surfaces: [] } }),
      ]),
      product: { title: "Ly" },
    });
    expect((await getPrintConfig(SLUG, SKU)).model3d).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("model3d ignored"));
  });

  it("is a 404 PRINT_CONFIG_NOT_FOUND when the BE does not list the variant (no template, blocked, unpublished)", async () => {
    backend({ customization: customizationDto([templateDto({ sku: "OTHER" })]), product: {} });
    await expect(getPrintConfig(SLUG, SKU)).rejects.toMatchObject({
      status: 404,
      code: "PRINT_CONFIG_NOT_FOUND",
    });
  });

  it("lets the BE's 409 PRODUCT_NOT_CUSTOMIZABLE and 404 through", async () => {
    backend({
      customization: new ApiError(409, "PRODUCT_NOT_CUSTOMIZABLE", "x"),
      product: { title: "Ly" },
    });
    await expect(getPrintConfig(SLUG, SKU)).rejects.toMatchObject({ status: 409 });
  });

  it("takes the product title from the catalogue (F-7), the slug when it cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    backend({
      customization: customizationDto([templateDto({ hasCartonSpec: true })]),
      product: new ApiError(500, "INTERNAL_ERROR", "x"),
    });

    const config = await getPrintConfig(SLUG, SKU);

    expect(config.product.title).toBe(SLUG);
    expect(warn).toHaveBeenCalled();
  });

  it("does not let one unreadable template hide the product's other variants", async () => {
    backend({
      customization: customizationDto([
        { code: "BAD", sku: "BAD-SKU", model: { kind: "unknown" } },
        templateDto({ hasCartonSpec: true }),
      ]),
      product: { title: "Ly" },
    });
    expect((await getPrintConfig(SLUG, SKU)).sku).toBe(SKU);
    expect(() => templateDtoSchema.parse({ code: "BAD", sku: "BAD-SKU" })).toThrow();
  });

  it("refuses a template that breaks the cup geometry, like the engine's own schema", () => {
    const broken = templateDtoSchema.parse(
      templateDto({
        printAreas: [{ ...templateDto().printAreas[0], shape: { type: "rect" } }],
      }),
    );
    expect(() =>
      toPrintConfig({
        template: broken,
        product: { slug: SLUG, title: "Ly", status: "PUBLISHED" },
        variantStatus: "ACTIVE",
        hasCartonSpec: true,
      }),
    ).toThrow();
  });
});

describe("a design's print configuration, from its own template (F-23)", () => {
  const draft = design();
  const answers = (
    customization: unknown,
    template: unknown = { ...templateDto(), active: true },
  ) => backend({ customization, template });

  it("reads the design's template and, from a BE before BE-11, the carton spec from the customization", async () => {
    const get = answers(customizationDto([templateDto({ hasCartonSpec: false })]));

    const config = await getDesignPrintConfig(draft);

    expect(config).toMatchObject({
      sku: SKU,
      variantStatus: "ACTIVE",
      hasCartonSpec: false, // from the customization, the template read has none
      product: { slug: SLUG, title: "Ly giấy 2 lớp 12oz", status: "PUBLISHED" }, // the design's own name
    });
    expect(get).toHaveBeenCalledWith(`/designs/${ids.design}/template`, {});
  });

  it("takes the .glb from the design's template, which reaches the config", async () => {
    answers(customizationDto(), { ...templateDto({ model3d: MODEL3D }), active: true });
    expect((await getDesignPrintConfig(draft)).model3d).toEqual(MODEL3D);
  });

  it("marks a variant the customization no longer lists BLOCKED, so the preflight refuses a submit", async () => {
    answers(customizationDto([templateDto({ sku: "OTHER" })]));
    expect(await getDesignPrintConfig(draft)).toMatchObject({
      variantStatus: "BLOCKED",
      hasCartonSpec: false,
    });
  });

  it("takes designable and hasCartonSpec from the design's template read when it has them (BE-11)", async () => {
    // The customization still lists the variant, but the template read is the preflight's rule.
    answers(customizationDto([templateDto({ hasCartonSpec: false })]), {
      ...templateDto(),
      active: true,
      designable: false,
      hasCartonSpec: true,
    });
    expect(await getDesignPrintConfig(draft)).toMatchObject({
      variantStatus: "BLOCKED",
      hasCartonSpec: true,
    });

    answers(customizationDto([templateDto({ sku: "OTHER" })]), {
      ...templateDto(),
      active: true,
      designable: true,
      hasCartonSpec: false,
    });
    expect(await getDesignPrintConfig(draft)).toMatchObject({
      variantStatus: "ACTIVE",
      hasCartonSpec: false,
    });
  });

  it("an approved product not yet listed still takes a submission: designable on the template read decides, not the listing (BE-11)", async () => {
    answers(new ApiError(404, "NOT_FOUND", "x"), {
      ...templateDto(),
      active: true,
      designable: true,
      hasCartonSpec: true,
    });
    const config = await getDesignPrintConfig(draft);

    expect(config).toMatchObject({ variantStatus: "ACTIVE", product: { status: "APPROVED" } });
    expect(isPrintConfigUsable(config)).toBe(true);
    expect(variantIssues(preflightVariant(config))).toEqual([]);
  });

  it("designable false blocks the submission with its sentence, even when the product is listed", async () => {
    answers(customizationDto(), {
      ...templateDto(),
      active: true,
      designable: false,
      hasCartonSpec: true,
    });
    const config = await getDesignPrintConfig(draft);

    expect(isPrintConfigUsable(config)).toBe(false);
    expect(variantIssues(preflightVariant(config))).toEqual([
      expect.objectContaining({
        ruleId: "VARIANT_UNAVAILABLE",
        message: "Quy cách này hiện không còn nhận thiết kế.",
      }),
    ]);
  });

  it("reads no customization for a design whose product is gone (no slug), and still decides by designable", async () => {
    const get = answers(customizationDto(), { ...templateDto(), active: true, designable: false });
    const gone = design({ product: { slug: null, title: "Ly" } });

    expect(await getDesignPrintConfig(gone)).toMatchObject({
      variantStatus: "BLOCKED",
      product: { slug: null, status: "UNPUBLISHED" },
    });
    expect(get.mock.calls.map(([url]) => String(url))).toEqual([`/designs/${ids.design}/template`]);
  });

  it("marks the product UNPUBLISHED when the customization read answers 404 or 409", async () => {
    answers(new ApiError(404, "NOT_FOUND", "x"));
    expect(await getDesignPrintConfig(draft)).toMatchObject({
      variantStatus: "BLOCKED",
      product: { status: "UNPUBLISHED" },
    });
    answers(new ApiError(409, "PRODUCT_NOT_CUSTOMIZABLE", "x"));
    expect((await getDesignPrintConfig(draft)).product.status).toBe("UNPUBLISHED");
  });

  it("fails on any other failure of either read: a submit must not be refused by a guess", async () => {
    answers(new ApiError(500, "INTERNAL_ERROR", "x"));
    await expect(getDesignPrintConfig(draft)).rejects.toMatchObject({ status: 500 });
    answers(customizationDto(), new ApiError(404, "NOT_FOUND", "x"));
    await expect(getDesignPrintConfig(draft)).rejects.toMatchObject({ status: 404 });
  });
});
