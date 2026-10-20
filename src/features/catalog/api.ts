import { api } from "@/lib/api/client";

import {
  SUGGESTION_LIMIT,
  catalogGalleryDtoSchema,
  catalogListInputSchema,
  catalogPageDtoSchema,
  catalogProductDtoSchema,
  searchSuggestionsDtoSchema,
  suggestionInputSchema,
} from "./schemas";
import type {
  CatalogGallery,
  CatalogListParams,
  CatalogPage,
  CatalogProduct,
  SearchSuggestion,
} from "./types";

// BE catalog controllers: /api/v1/catalog/** — the /v1 prefix lives in API_URL. Every one needs a
// signed-in caller (no anonymous catalog since 2026-10-06). Stock and prices: lib/catalog.

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

/** GET /catalog/products — the published catalogue, searched when `q` is given. */
export async function getCatalogPage(
  params: CatalogListParams,
  signal?: AbortSignal,
): Promise<CatalogPage> {
  const input = catalogListInputSchema.parse({
    q: params.q,
    sort: params.sort,
    page: Math.max(params.page, 1) - 1, // the BE is 0-based
    size: params.size,
  });
  const { data } = await api.get<unknown>("/catalog/products", {
    params: input,
    ...withSignal(signal),
  });
  const page = catalogPageDtoSchema.parse(data);
  return { ...page, page: page.page + 1 };
}

/** GET /catalog/products/{slug} — an unpublished or unknown slug answers 404 NOT_FOUND. */
export async function getCatalogProduct(
  slug: string,
  signal?: AbortSignal,
): Promise<CatalogProduct> {
  const { data } = await api.get<unknown>(
    `/catalog/products/${encodeURIComponent(slug)}`,
    withSignal(signal),
  );
  return catalogProductDtoSchema.parse(data);
}

/** GET /catalog/products/{slug}/gallery */
export async function getCatalogGallery(
  slug: string,
  signal?: AbortSignal,
): Promise<CatalogGallery> {
  const { data } = await api.get<unknown>(
    `/catalog/products/${encodeURIComponent(slug)}/gallery`,
    withSignal(signal),
  );
  return catalogGalleryDtoSchema.parse(data);
}

/** GET /catalog/search/suggestions — at least 2 characters; at most 10 results (BE budget 30/10s). */
export async function getSearchSuggestions(
  q: string,
  signal?: AbortSignal,
): Promise<SearchSuggestion[]> {
  const params = suggestionInputSchema.parse({ q, limit: SUGGESTION_LIMIT });
  const { data } = await api.get<unknown>("/catalog/search/suggestions", {
    params,
    ...withSignal(signal),
  });
  return searchSuggestionsDtoSchema.parse(data);
}
