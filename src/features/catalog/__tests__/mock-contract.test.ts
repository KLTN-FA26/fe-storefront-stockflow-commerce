import { AxiosError, type AxiosResponse } from "axios";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/error";

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

  it("gives every list row the card fields the BE sends: the SKUs, and the image the gallery leads with", () => {
    const rows = (
      dataOf(catalog.list({ size: 200 })) as {
        items: Array<{ slug: string; primaryImageUrl?: string; skus: Array<{ sku: string }> }>;
      }
    ).items;
    for (const row of rows) {
      const gallery = dataOf(catalog.gallery(row.slug)) as {
        images: Array<{ url: string; primary: boolean }>;
      };
      expect(row.primaryImageUrl).toBe(gallery.images.find((i) => i.primary)?.url);
      // The SKUs the row lists are the ones the stock and price calls will be asked for.
      expect(row.skus.length).toBeGreaterThan(0);
      expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["price", "availability"]));
    }
  });

  it("leads a list row's image with the primary one even when it is not the first (several variants may each have a primary)", () => {
    const base = seedMockCatalog()[0]!;
    const custom = createMockCatalog([
      {
        ...base,
        images: [
          { sku: "A", url: "https://img.test/a.jpg", primary: false },
          { sku: "B", url: "https://img.test/b.jpg", primary: true },
        ],
      },
    ]);
    const row = (dataOf(custom.list({ size: 5 })) as { items: Array<{ primaryImageUrl?: string }> })
      .items[0];
    expect(row?.primaryImageUrl).toBe("https://img.test/b.jpg");
    const gallery = dataOf(custom.gallery(base.slug)) as {
      images: Array<{ url: string; primary: boolean }>;
    };
    expect(gallery.images.filter((i) => i.primary).map((i) => i.url)).toEqual([
      "https://img.test/b.jpg",
    ]);
  });

  it("answers every product's detail and gallery with bodies the schemas accept", () => {
    expect(slugs.length).toBeGreaterThan(12);
    for (const slug of slugs.filter((s) => s !== NO_PRICE_SLUG)) {
      expect(catalogProductDtoSchema.safeParse(dataOf(catalog.detail(slug))).success).toBe(true);
      expect(catalogGalleryDtoSchema.safeParse(dataOf(catalog.gallery(slug))).success).toBe(true);
    }
  });

  it("tells a customizable product from a standard one on the card and the detail, as the schemas read them", () => {
    const cards = catalogPageDtoSchema.parse(dataOf(catalog.list({ size: 200 }))).items;
    expect(cards.find((c) => c.slug === "tui-giay-kraft")?.kind).toBe("CUSTOMIZABLE");
    expect(cards.find((c) => c.slug === "nap-ly-90mm")?.kind).toBe("STANDARD");
    expect(catalogProductDtoSchema.parse(dataOf(catalog.detail("tui-giay-kraft"))).kind).toBe(
      "CUSTOMIZABLE",
    );
    expect(catalogProductDtoSchema.parse(dataOf(catalog.detail("nap-ly-90mm"))).kind).toBe(
      "STANDARD",
    );
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

  it("refuses search like the BE, with the ApiResponse error envelope the client reads", () => {
    // What client.ts does with a non-2xx answer: ApiError.from(the AxiosError).
    const asApiError = (result: { status: number; data: unknown }) =>
      ApiError.from(
        new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
          status: result.status,
          data: result.data,
        } as AxiosResponse),
      );

    const tooLong = catalog.suggestions({ q: "a".repeat(101) });
    expect(tooLong.data).toMatchObject({
      success: false,
      errorCode: "VALIDATION_FAILED",
      fieldErrors: [{ field: "q", message: expect.any(String) }],
      correlationId: expect.any(String),
    });
    expect(asApiError(tooLong)).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
    expect(asApiError(tooLong).fieldErrors).toHaveProperty("q");

    const listTooLong = catalog.list({ q: "a".repeat(101) });
    expect(asApiError(listTooLong)).toMatchObject({ status: 400, code: "VALIDATION_FAILED" });

    let limited = catalog.suggestions({ q: "ly" });
    const burst = createMockCatalog(seedMockCatalog(), { now: () => 0 });
    for (let i = 0; i <= 30; i++) limited = burst.suggestions({ q: "ly" });
    expect(limited.data).toMatchObject({ success: false, errorCode: "RATE_LIMITED" });
    expect(asApiError(limited)).toMatchObject({ status: 429, code: "RATE_LIMITED" });
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
