import { useState } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";

import { hasErrorCode } from "@/lib/api/describe-error";
import { QUERY_TIMES } from "@/lib/api/query-client";
import { retryTransient } from "@/lib/api/retry";

import { getCatalogGallery, getCatalogPage, getCatalogProduct, getSearchSuggestions } from "./api";
import { suggestionQueryOf } from "./schemas";
import type { CatalogCard, CatalogListParams, SearchSuggestion } from "./types";

export const catalogKeys = {
  all: ["catalog"] as const,
  lists: () => [...catalogKeys.all, "list"] as const,
  list: (params: CatalogListParams) => [...catalogKeys.lists(), params] as const,
  products: () => [...catalogKeys.all, "product"] as const,
  product: (slug: string) => [...catalogKeys.products(), slug] as const,
  gallery: (slug: string) => [...catalogKeys.all, "gallery", slug] as const,
  suggestions: (q: string) => [...catalogKeys.all, "suggestions", q] as const,
};

export const CATALOG_PAGE_SIZE = 12;

export function useCatalogPage(params: CatalogListParams, enabled = true) {
  return useQuery({
    queryKey: catalogKeys.list(params),
    queryFn: ({ signal }) => getCatalogPage(params, signal),
    enabled,
    placeholderData: keepPreviousData, // no flash between pages
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}

export function useCatalogProduct(slug: string, enabled = true) {
  return useQuery({
    queryKey: catalogKeys.product(slug),
    queryFn: ({ signal }) => getCatalogProduct(slug, signal),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

export function useCatalogGallery(slug: string, enabled = true) {
  return useQuery({
    queryKey: catalogKeys.gallery(slug),
    queryFn: ({ signal }) => getCatalogGallery(slug, signal),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/** One detail and one gallery per card: the card row itself carries no image, SKU or price. */
export function useCardDetails(cards: readonly CatalogCard[], enabled = true) {
  const products = useQueries({
    queries: cards.map((card) => ({
      queryKey: catalogKeys.product(card.slug),
      queryFn: ({ signal }: { signal: AbortSignal }) => getCatalogProduct(card.slug, signal),
      enabled,
      retry: retryTransient,
      ...QUERY_TIMES.detail,
    })),
  });
  const galleries = useQueries({
    queries: cards.map((card) => ({
      queryKey: catalogKeys.gallery(card.slug),
      queryFn: ({ signal }: { signal: AbortSignal }) => getCatalogGallery(card.slug, signal),
      enabled,
      retry: retryTransient,
      ...QUERY_TIMES.detail,
    })),
  });
  return { products, galleries };
}

const NO_SUGGESTIONS: SearchSuggestion[] = [];

/**
 * Search-box completions; nothing is asked that the BE would answer with 400 (see suggestionQueryOf).
 * The BE allows 30 calls per 10 s per user and answers 429 RATE_LIMITED past that: the last
 * completions stay on screen then (SCRUM-469, BE contract in the SCRUM-170 comment). Any other
 * failure just shows none: completions are optional.
 */
export function useSearchSuggestions(q: string, enabled = true) {
  const text = suggestionQueryOf(q);
  const query = useQuery({
    queryKey: catalogKeys.suggestions(text ?? ""),
    queryFn: ({ signal }) => getSearchSuggestions(text ?? "", signal),
    enabled: enabled && text !== undefined,
    placeholderData: keepPreviousData, // no flicker while the next text is asked
    retry: false,
    staleTime: 60_000,
  });
  // The last list the BE actually answered, kept from earlier renders (no effect, no ref).
  const [held, setHeld] = useState<SearchSuggestion[]>(NO_SUGGESTIONS);
  if (query.data && !query.isPlaceholderData && query.data !== held) setHeld(query.data);
  const suggestions =
    query.data ?? (hasErrorCode(query.error, "RATE_LIMITED") ? held : NO_SUGGESTIONS);
  return { ...query, suggestions };
}
