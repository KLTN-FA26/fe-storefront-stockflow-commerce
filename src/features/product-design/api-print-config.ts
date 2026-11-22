import { api } from "@/lib/api/client";
import { isDesignMockMode } from "@/lib/api/design-mock-flag";
import { ApiError } from "@/lib/api/error";

import { designPath, withSignal } from "./api-request";
import {
  customizationDtoSchema,
  productTitleDtoSchema,
  templateDtoSchema,
  type CustomizationDto,
} from "./print-config-dtos";
import { toPrintConfig } from "./print-config-mappers";
import type { Design, PrintConfig } from "./types";

// The print configuration, which the BE serves as two reads (F-22, F-23); re-exported by `api.ts`.
//  - a variant's, for the launcher and for creating a design: the product's customization, by SKU;
//  - a design's, for the studio and the export: the design's own template, beside what the
//    customization says of the variant (its carton spec and whether it can still be designed on).

const productPath = (slug: string) => `/catalog/products/${encodeURIComponent(slug)}`;

/**
 * GET /catalog/products/{slug}/customization. In design mock mode only, a `sku` query rides along as
 * a hint the mock uses for a product it does not know; the real BE gets the plain read.
 */
export async function readCustomization(
  productSlug: string,
  sku: string,
  signal?: AbortSignal,
): Promise<CustomizationDto> {
  const { data } = await api.get<unknown>(`${productPath(productSlug)}/customization`, {
    ...(isDesignMockMode() ? { params: { sku } } : {}),
    ...withSignal(signal),
  });
  return customizationDtoSchema.parse(data);
}

/** The template a customization lists for `sku`, or the 404 the old print-config read answered. */
export function templateOfSku(customization: CustomizationDto, sku: string) {
  const found = customization.templates.find((template) => template.sku === sku);
  if (!found) {
    throw new ApiError(404, "PRINT_CONFIG_NOT_FOUND", "This variant has no customization template");
  }
  return found;
}

/** The product's title for the default design name (F-7); its slug when the catalogue cannot say. */
async function readProductTitle(slug: string, signal?: AbortSignal): Promise<string> {
  try {
    const { data } = await api.get<unknown>(productPath(slug), withSignal(signal));
    return productTitleDtoSchema.parse(data).title;
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn(`The title of product ${slug} could not be read; its slug stands in.`, error);
    return slug;
  }
}

/**
 * A variant's print configuration, from the product's customization (F-22). A variant the BE does
 * not list has none: it has no template, is no longer ACTIVE, or its product is not published (404
 * `PRINT_CONFIG_NOT_FOUND`, like the read this replaces). One it lists is ACTIVE of a PUBLISHED
 * product. A product that is not customizable is 409 `PRODUCT_NOT_CUSTOMIZABLE`, as the BE says.
 */
export async function getPrintConfig(
  productSlug: string,
  sku: string,
  signal?: AbortSignal,
): Promise<PrintConfig> {
  return printConfigOfSku(await readProductCustomization(productSlug, sku, signal), sku);
}

/** A product's customization and its title: what every variant's print configuration is made from. */
export type ProductCustomization = {
  slug: string;
  customization: CustomizationDto;
  title: string;
};

/**
 * The two reads a product's print configurations share (the customization lists every variant's
 * template), made once for all its variants (Data M-7). `sku` is only the design mock's hint.
 */
export async function readProductCustomization(
  productSlug: string,
  sku: string,
  signal?: AbortSignal,
): Promise<ProductCustomization> {
  const [customization, title] = await Promise.all([
    readCustomization(productSlug, sku, signal),
    readProductTitle(productSlug, signal),
  ]);
  return { slug: productSlug, customization, title };
}

/** One variant's print configuration from its product's customization (see `getPrintConfig`). */
export function printConfigOfSku(
  { slug: productSlug, customization, title }: ProductCustomization,
  sku: string,
): PrintConfig {
  const listed = templateOfSku(customization, sku);
  return toPrintConfig({
    template: templateDtoSchema.parse(listed),
    product: { slug: productSlug, title, status: "PUBLISHED" },
    variantStatus: "ACTIVE",
    hasCartonSpec: listed.hasCartonSpec ?? false,
  });
}

/** A product the customization read refuses to list (not published, not customizable) lists nothing. */
const isNotListed = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.code === "PRODUCT_NOT_CUSTOMIZABLE");

/**
 * The product's status as far as a design needs it. The customization answers only for a PUBLISHED
 * product (404 otherwise), so without it the template read's `designable` decides: BE `designable`
 * implies the product is APPROVED or PUBLISHED, so an approved product not yet listed still takes
 * designs. Neither answer (a BE from before BE-11, or `designable` false): UNPUBLISHED.
 */
function productStatusOf(customization: unknown, designable: boolean | undefined) {
  if (customization) return "PUBLISHED";
  return designable === true ? "APPROVED" : "UNPUBLISHED";
}

/**
 * The print configuration of one design (F-23): the template it is drawn on (the current one for a
 * draft, the frozen one once approved, with its `.glb`) and whether a submission can pass, as the
 * template read says (BE-11, the very rule the submission's preflight uses):
 *  - `variantStatus`: ACTIVE when `designable`, else BLOCKED ("no longer takes designs");
 *  - `hasCartonSpec` as the template read gives it.
 * A backend from before BE-11 sends neither: the customization read stands in (ACTIVE when the
 * variant is listed, its `hasCartonSpec`). `product.status` is PUBLISHED when the customization
 * answered, else APPROVED when `designable` says so, else UNPUBLISHED; `product.title` is the design's own `productName`.
 */
export async function getDesignPrintConfig(
  design: Pick<Design, "id" | "product" | "variant">,
  signal?: AbortSignal,
): Promise<PrintConfig> {
  const { slug, title } = design.product;
  const [template, customization] = await Promise.all([
    api.get<unknown>(designPath(design.id, "/template"), withSignal(signal)),
    // A product that is gone has no slug to read: it lists nothing, as a 404 would say.
    slug === null
      ? null
      : readCustomization(slug, design.variant.sku, signal).catch((error: unknown) => {
          if (isNotListed(error)) return null;
          throw error;
        }),
  ]);
  const listed = customization?.templates.find((candidate) => candidate.sku === design.variant.sku);
  const dto = templateDtoSchema.parse(template.data);
  const designable = dto.designable ?? listed !== undefined;
  return toPrintConfig({
    template: dto,
    product: { slug, title, status: productStatusOf(customization, dto.designable) },
    variantStatus: designable ? "ACTIVE" : "BLOCKED",
    hasCartonSpec: dto.hasCartonSpec ?? listed?.hasCartonSpec ?? false,
  });
}
