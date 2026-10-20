import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { availabilitySchema, currencySchema } from "@/lib/catalog/schemas";
import { beId } from "@/lib/validation/primitives";

// Jackson runs with `default-property-inclusion: non_null`: a nullable field is absent from the
// JSON, not null, so every optional field is `.nullish()`.
// Ids are beId() (any 8-4-4-4-12 hex): the dev catalogue has ids without RFC version/variant bits.

/** One row of GET /catalog/products (CatalogCardResponse): no image, SKU, price or stock. */
export const catalogCardDtoSchema = z.object({
  productId: beId(),
  slug: z.string().min(1),
  title: z.string().min(1),
  seoTitle: z.string().nullish(),
});
export const catalogPageDtoSchema = pageResponseSchema(catalogCardDtoSchema);

export const catalogVariantDtoSchema = z.object({
  sku: z.string().min(1),
  // The listing's own price. The customer's price list (tiers, MOQ) is GET /catalog/products/prices.
  price: z.number().nonnegative(),
  currency: currencySchema,
  // The detail only knows IN_STOCK / OUT_OF_STOCK; LOW_STOCK comes from /availability.
  availability: availabilitySchema,
});

/** GET /catalog/products/{slug} (CatalogProductResponse). */
export const catalogProductDtoSchema = z.object({
  productId: beId(),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullish(),
  seoTitle: z.string().nullish(),
  seoDescription: z.string().nullish(),
  variants: z.array(catalogVariantDtoSchema),
  galleryUrl: z.string().nullish(),
});

export const galleryImageDtoSchema = z.object({
  id: beId(),
  variantId: beId().nullish(),
  sku: z.string().nullish(),
  // Public canonical media URL (absolute), not a private storage key.
  url: z.string().min(1),
  altText: z.string().nullish(),
  sortOrder: z.number().int(),
  primary: z.boolean(),
});

/** GET /catalog/products/{slug}/gallery (CatalogGalleryResponse). */
export const catalogGalleryDtoSchema = z.object({ images: z.array(galleryImageDtoSchema) });

/**
 * GET /catalog/search/suggestions (SearchSuggestionResponse). `sku` is the SKU the text matched,
 * else the listing's first published one; with none published it is null, so absent (non_null).
 */
export const searchSuggestionDtoSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  sku: z.string().min(1).nullish(),
});
export const searchSuggestionsDtoSchema = z.array(searchSuggestionDtoSchema);

// ── Inputs: what the BE refuses is refused before it is sent ──

export const CATALOG_SORTS = ["relevance", "newest", "title"] as const;
export const CATALOG_QUERY_MAX = 100; // BE: longer text is 400 VALIDATION_FAILED
export const CATALOG_PAGE_SIZE_MAX = 200; // BE Pages.MAX_PAGE_SIZE
export const SUGGESTION_MIN_LENGTH = 2; // BE CatalogSearchService.MIN_SUGGEST_LENGTH
export const SUGGESTION_LIMIT_MAX = 10;
export const SUGGESTION_LIMIT = 5; // SCRUM-469: the header box shows 5 completions
// BE stockflow.catalog.search.ranking-window: list and search rank and page only this many, so a
// total equal to it means "at least". ASSUMPTION: the BE keeps its default (500, SCRUM-170).
export const CATALOG_RESULT_WINDOW = 500;

/** The BE counts code points (`codePointCount`), not UTF-16 units: an emoji or a decomposed accent is not two. */
export const codePointLength = (text: string) => [...text].length;

/**
 * BE SearchQueryNormalizer: accents folded, every character that is not a letter or digit a word
 * break. What is left must be at least 2 characters for a suggestion, or the BE answers 400
 * VALIDATION_FAILED; punctuation only is "nothing to search" there.
 */
export function normalizeSearchText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/đ/g, "d") // no decomposition: the BE maps it by hand too
    .replace(/Đ/g, "D")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The text to ask suggestions for, or undefined when the BE would refuse it (too short or too long). */
export function suggestionQueryOf(raw: string): string | undefined {
  const text = raw.trim();
  if (codePointLength(text) > CATALOG_QUERY_MAX) return undefined;
  return codePointLength(normalizeSearchText(text)) >= SUGGESTION_MIN_LENGTH ? text : undefined;
}

export const catalogListInputSchema = z.object({
  q: z
    .string()
    .trim()
    .refine((q) => codePointLength(q) <= CATALOG_QUERY_MAX)
    .optional()
    .transform((q) => (q ? q : undefined)),
  sort: z.enum(CATALOG_SORTS).optional(),
  page: z.number().int().nonnegative(),
  size: z.number().int().min(1).max(CATALOG_PAGE_SIZE_MAX),
});

export const suggestionInputSchema = z.object({
  q: z
    .string()
    .trim()
    .refine((q) => suggestionQueryOf(q) !== undefined),
  limit: z.number().int().min(1).max(SUGGESTION_LIMIT_MAX).optional(),
});
