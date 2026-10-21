import { describe, expect, it } from "vitest";

import {
  availabilitySchema,
  priceScheduleDtoSchema,
  skuAvailabilitiesDtoSchema,
  skuListInputSchema,
} from "@/lib/catalog/schemas";

import {
  normalizeSearchText,
  suggestionQueryOf,
  catalogGalleryDtoSchema,
  catalogListInputSchema,
  catalogPageDtoSchema,
  catalogProductDtoSchema,
  searchSuggestionsDtoSchema,
  suggestionInputSchema,
} from "../schemas";
import { beCard, beGallery, bePage, beProduct, beSchedule } from "./fixtures";

describe("catalogue schemas follow the BE DTOs", () => {
  it("parses a page of cards: title and slug only, seoTitle omitted (NON_NULL)", () => {
    const page = catalogPageDtoSchema.parse(bePage());
    expect(page.items[0]).toEqual(beCard);
    expect(page).toMatchObject({ page: 0, totalElements: 1, hasNext: false });
  });

  it("parses the card fields of a row: primaryImageUrl and skus (no price, no stock)", () => {
    const page = catalogPageDtoSchema.parse(
      bePage({
        items: [
          {
            ...beCard,
            primaryImageUrl: "https://cdn.example.vn/p/white.jpg",
            skus: [{ sku: "CUP-PAPER-8OZ-WHT", name: "Ly trắng" }, { sku: "CUP-PAPER-8OZ-KRAFT" }],
          },
        ],
      }),
    );
    expect(page.items[0]).toMatchObject({
      primaryImageUrl: "https://cdn.example.vn/p/white.jpg",
      skus: [{ sku: "CUP-PAPER-8OZ-WHT", name: "Ly trắng" }, { sku: "CUP-PAPER-8OZ-KRAFT" }],
    });
  });

  it("parses a row with an empty skus list and no image (a product with no approved picture)", () => {
    const page = catalogPageDtoSchema.parse(bePage({ items: [{ ...beCard, skus: [] }] }));
    expect(page.items[0]?.skus).toEqual([]);
    expect(page.items[0]?.primaryImageUrl).toBeUndefined();
  });

  it("refuses a SKU entry with no sku, and an empty image URL", () => {
    expect(
      catalogPageDtoSchema.safeParse(bePage({ items: [{ ...beCard, skus: [{ name: "x" }] }] }))
        .success,
    ).toBe(false);
    expect(
      catalogPageDtoSchema.safeParse(bePage({ items: [{ ...beCard, primaryImageUrl: "" }] }))
        .success,
    ).toBe(false);
  });

  it("requires the PageResponse paging flags", () => {
    const { hasNext: _omit, ...withoutHasNext } = bePage();
    expect(catalogPageDtoSchema.safeParse(withoutHasNext).success).toBe(false);
  });

  it("parses a product whose description and SEO fields are absent", () => {
    const { description: _description, galleryUrl: _gallery, ...minimal } = beProduct;
    const parsed = catalogProductDtoSchema.parse(minimal);
    expect(parsed.description).toBeUndefined();
    expect(parsed.variants).toHaveLength(2);
  });

  it("parses a gallery whose alt text and variant id are absent", () => {
    const parsed = catalogGalleryDtoSchema.parse(beGallery);
    expect(parsed.images[0]?.altText).toBeUndefined();
    expect(parsed.images[0]?.variantId).toBeUndefined();
  });

  it("parses availability the FE does not know yet as UNKNOWN instead of failing the page", () => {
    expect(availabilitySchema.parse("PRE_ORDER")).toBe("UNKNOWN");
    expect(skuAvailabilitiesDtoSchema.parse([{ sku: "A", availability: "BACKORDER" }])).toEqual([
      { sku: "A", availability: "UNKNOWN" },
    ]);
    const product = catalogProductDtoSchema.parse({
      ...beProduct,
      variants: [{ ...beProduct.variants[0], availability: "PRE_ORDER" }],
    });
    expect(product.variants[0]?.availability).toBe("UNKNOWN");
  });

  it("still rejects an availability that is missing or not a string", () => {
    expect(availabilitySchema.safeParse(undefined).success).toBe(false);
    expect(availabilitySchema.safeParse(3).success).toBe(false);
  });

  it("parses a price schedule, and a source newer than the FE as UNKNOWN", () => {
    expect(priceScheduleDtoSchema.parse(beSchedule).tiers).toHaveLength(2);
    expect(priceScheduleDtoSchema.parse({ ...beSchedule, source: "PROMO" }).source).toBe("UNKNOWN");
  });

  it("rejects a price that is not a number, a MOQ of 0 and a tier below 1 unit", () => {
    expect(priceScheduleDtoSchema.safeParse({ ...beSchedule, moq: 0 }).success).toBe(false);
    expect(
      priceScheduleDtoSchema.safeParse({
        ...beSchedule,
        tiers: [{ minQuantity: 1, unitPrice: "780" }],
      }).success,
    ).toBe(false);
    expect(
      priceScheduleDtoSchema.safeParse({ ...beSchedule, tiers: [{ minQuantity: 0, unitPrice: 1 }] })
        .success,
    ).toBe(false);
  });

  it("accepts the ids the BE really sends, RFC version/variant bits or not (dev data, 2026-10-20)", () => {
    // Java UUID takes any 8-4-4-4-12 hex; these two came back from GET /catalog/products on dev.
    const ids = ["e5c50b95-014a-18a3-7a2b-5fd7a1dcb8ed", "d2738a4c-38f0-d893-b2d5-349038e4bb20"];
    const page = catalogPageDtoSchema.safeParse({
      ...bePage(),
      items: ids.map((productId) => ({ ...beCard, productId })),
    });
    expect(page.success).toBe(true);
    expect(catalogProductDtoSchema.safeParse({ ...beProduct, productId: ids[0] }).success).toBe(
      true,
    );
    const image = { ...beGallery.images[0], id: ids[0], variantId: ids[1] };
    expect(catalogGalleryDtoSchema.safeParse({ images: [image] }).success).toBe(true);
    expect(
      catalogPageDtoSchema.safeParse({ ...bePage(), items: [{ ...beCard, productId: "nope" }] })
        .success,
    ).toBe(false);
  });

  it("parses the search samples of the BE contract (CatalogSearchIntegrationTest, SCRUM-170)", () => {
    // seoTitle null is left out of the JSON (non_null); totalElements stops at the 500 window.
    const page = catalogPageDtoSchema.parse({
      items: [{ productId: beCard.productId, slug: "ban-an-go-soi", title: "Bàn ăn gỗ sồi" }],
      page: 0,
      size: 20,
      totalElements: 500,
      totalPages: 25,
      hasNext: true,
      hasPrevious: false,
    });
    expect(page.items[0]?.seoTitle).toBeUndefined();
    expect(
      searchSuggestionsDtoSchema.parse([
        { title: "Bàn ăn gỗ sồi", slug: "ban-an-go-soi", sku: "TABLE-OAK-160" },
      ])[0],
    ).toEqual({ title: "Bàn ăn gỗ sồi", slug: "ban-an-go-soi", sku: "TABLE-OAK-160" });
  });

  it("parses suggestions: title, slug and the SKU the text matched", () => {
    expect(
      searchSuggestionsDtoSchema.parse([{ title: "Ly giấy", slug: "ly-giay", sku: "CUP-1" }]),
    ).toHaveLength(1);
    // The BE sends the matched or first published SKU; with none it leaves `sku` out (non_null).
    expect(
      searchSuggestionsDtoSchema.safeParse([{ title: "Ly giấy", slug: "ly-giay" }]).success,
    ).toBe(true);
    expect(searchSuggestionsDtoSchema.safeParse([{ title: "Ly giấy" }]).success).toBe(false);
  });
});

describe("catalogue inputs refuse what the BE refuses", () => {
  it("accepts the BE sorts and refuses price (SCRUM-428) and anything else", () => {
    for (const sort of ["relevance", "newest", "title"]) {
      expect(catalogListInputSchema.safeParse({ sort, page: 0, size: 12 }).success).toBe(true);
    }
    expect(catalogListInputSchema.safeParse({ sort: "price", page: 0, size: 12 }).success).toBe(
      false,
    );
  });

  it("bounds the search text (100), the page and the page size (1..200)", () => {
    expect(
      catalogListInputSchema.safeParse({ q: "x".repeat(100), page: 0, size: 12 }).success,
    ).toBe(true);
    expect(
      catalogListInputSchema.safeParse({ q: "x".repeat(101), page: 0, size: 12 }).success,
    ).toBe(false);
    expect(catalogListInputSchema.safeParse({ page: -1, size: 12 }).success).toBe(false);
    expect(catalogListInputSchema.safeParse({ page: 0, size: 0 }).success).toBe(false);
    expect(catalogListInputSchema.safeParse({ page: 0, size: 201 }).success).toBe(false);
  });

  it("drops a blank search text", () => {
    expect(catalogListInputSchema.parse({ q: "   ", page: 0, size: 12 }).q).toBeUndefined();
  });

  it("asks suggestions only for 2 to 100 characters, and at most 10 results", () => {
    expect(suggestionInputSchema.safeParse({ q: "l" }).success).toBe(false);
    expect(suggestionInputSchema.safeParse({ q: " l " }).success).toBe(false);
    expect(suggestionInputSchema.safeParse({ q: "ly" }).success).toBe(true);
    expect(suggestionInputSchema.safeParse({ q: "ly", limit: 11 }).success).toBe(false);
  });

  it("normalises SKUs to upper case and refuses what BE Sku refuses", () => {
    expect(skuListInputSchema.parse([" cup-paper-8oz-wht "])).toEqual(["CUP-PAPER-8OZ-WHT"]);
    expect(skuListInputSchema.safeParse([]).success).toBe(false);
    expect(skuListInputSchema.safeParse(["-LEADING-SEPARATOR"]).success).toBe(false);
    expect(skuListInputSchema.safeParse(["HAS SPACE"]).success).toBe(false);
    expect(skuListInputSchema.safeParse(["A".repeat(65)]).success).toBe(false);
    expect(skuListInputSchema.safeParse(["A.b_c-1"]).success).toBe(true);
    expect(
      skuListInputSchema.safeParse(Array.from({ length: 51 }, (_, i) => `S${i}`)).success,
    ).toBe(false);
  });
});

describe("suggestion text is normalised like the BE (SearchQueryNormalizer) before asking", () => {
  it("folds accents and turns anything that is not a letter or digit into a word break", () => {
    expect(normalizeSearchText("  Bàn GỖ!!  (đẹp) ")).toBe("Ban GO dep");
    expect(normalizeSearchText("SOFA-3S_grey")).toBe("SOFA 3S grey");
    expect(normalizeSearchText("ô̂")).toBe("o"); // combining marks typed decomposed
  });

  it("asks only when at least 2 letters or digits are left, by code points", () => {
    expect(suggestionQueryOf("ly")).toBe("ly");
    expect(suggestionQueryOf(" ly ")).toBe("ly");
    // One letter plus punctuation would pass a naive length check and make the BE answer 400.
    for (const text of ["l", "l!", "  l  ", "!!", "-- --", "()", ""]) {
      expect(suggestionQueryOf(text)).toBeUndefined();
    }
    expect(suggestionQueryOf("l 1")).toBe("l 1"); // "l 1" is 3 characters once normalised
  });

  it("does not ask for more than the BE's 100 code points (counted as code points, not UTF-16 units)", () => {
    expect(suggestionQueryOf("a".repeat(100))).toBeDefined();
    expect(suggestionQueryOf("a".repeat(101))).toBeUndefined();
    // 100 astral code points are 200 UTF-16 units: still within the BE's limit.
    expect(suggestionQueryOf("𝒜".repeat(100))).toBeDefined();
    expect(suggestionQueryOf("𝒜".repeat(101))).toBeUndefined();
  });

  it("applies the same counting to the list's search text", () => {
    expect(
      catalogListInputSchema.safeParse({ q: "𝒜".repeat(100), page: 0, size: 12 }).success,
    ).toBe(true);
    expect(
      catalogListInputSchema.safeParse({ q: "𝒜".repeat(101), page: 0, size: 12 }).success,
    ).toBe(false);
  });
});
