import { describe, expect, it } from "vitest";

import { createMockCatalog, seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import { priceSchedulesDtoSchema, skuAvailabilitiesDtoSchema } from "@/lib/catalog/schemas";

import {
  catalogGalleryDtoSchema,
  catalogPageDtoSchema,
  catalogProductDtoSchema,
  searchSuggestionsDtoSchema,
} from "../schemas";

// USE_MOCK must answer what the real BE answers, or the screens are tested against a fiction.
// Lives on the feature side: features may import lib, lib may not import features.
const dataOf = (result: { data: unknown }) => (result.data as { data: unknown }).data;
const catalog = createMockCatalog(seedMockCatalog());
const slugs = (dataOf(catalog.list({ size: 200 })) as { items: Array<{ slug: string }> }).items.map(
  (c) => c.slug,
);

// The BE refuses the whole detail when a variant has no base price (409 PRICE_NOT_AVAILABLE).
const NO_PRICE_SLUG = "ly-giay-kraft-16oz";

describe("mock catalogue satisfies the FE catalogue contract", () => {
  it("answers GET /catalog/products with a page the schema accepts, on every page", () => {
    for (const page of [0, 1]) {
      expect(catalogPageDtoSchema.safeParse(dataOf(catalog.list({ page, size: 12 }))).success).toBe(
        true,
      );
    }
  });

  it("answers every product's detail and gallery with bodies the schemas accept", () => {
    expect(slugs.length).toBeGreaterThan(12);
    for (const slug of slugs.filter((s) => s !== NO_PRICE_SLUG)) {
      expect(catalogProductDtoSchema.safeParse(dataOf(catalog.detail(slug))).success).toBe(true);
      expect(catalogGalleryDtoSchema.safeParse(dataOf(catalog.gallery(slug))).success).toBe(true);
    }
  });

  it("answers a product with an unpriced variant like the BE: 409 PRICE_NOT_AVAILABLE on the detail only", () => {
    expect(catalog.detail(NO_PRICE_SLUG)).toMatchObject({
      status: 409,
      data: { errorCode: "PRICE_NOT_AVAILABLE" },
    });
    expect(catalogGalleryDtoSchema.safeParse(dataOf(catalog.gallery(NO_PRICE_SLUG))).success).toBe(
      true,
    );
  });

  it("answers suggestions, availability and prices with bodies the schemas accept", () => {
    expect(
      searchSuggestionsDtoSchema.safeParse(dataOf(catalog.suggestions({ q: "ly" }))).success,
    ).toBe(true);
    const skus = ["CUP-PAPER-8OZ-WHT", "CUP-PET-500ML", "CUP-CUSTOM-LOGO"];
    expect(skuAvailabilitiesDtoSchema.safeParse(dataOf(catalog.availability(skus))).success).toBe(
      true,
    );
    expect(priceSchedulesDtoSchema.safeParse(dataOf(catalog.prices(skus))).success).toBe(true);
  });
});
