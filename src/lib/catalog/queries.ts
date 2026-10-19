import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { retryTransient } from "@/lib/api/retry";

import { getAvailability, getPrices } from "./api";
import { normalizeSku } from "./schemas";

export const catalogReadKeys = {
  availabilities: () => ["catalog-read", "availability"] as const,
  availability: (skus: readonly string[]) => [...catalogReadKeys.availabilities(), skus] as const,
  prices: () => ["catalog-read", "prices"] as const,
  price: (skus: readonly string[]) => [...catalogReadKeys.prices(), skus] as const,
};

/** Sorted and de-duplicated, so the same set of SKUs is one cache entry whatever order it came in. */
export const skuKey = (skus: readonly string[]) => [...new Set(skus.map(normalizeSku))].sort();

/**
 * Stock indicator for these SKUs (kltn-docs 13 BR-03, SCRUM-158). Short staleTime: the BE caches
 * 10 s and "in stock" must never be older than that.
 */
export function useAvailability(skus: readonly string[], enabled = true) {
  const key = skuKey(skus);
  return useQuery({
    queryKey: catalogReadKeys.availability(key),
    queryFn: ({ signal }) => getAvailability(key, signal),
    enabled: enabled && key.length > 0,
    retry: retryTransient,
    ...QUERY_TIMES.tracking,
  });
}

/** The signed-in customer's price list for these SKUs (kltn-docs 13 BR-02, BR-05). */
export function usePrices(skus: readonly string[], enabled = true) {
  const key = skuKey(skus);
  return useQuery({
    queryKey: catalogReadKeys.price(key),
    queryFn: ({ signal }) => getPrices(key, signal),
    enabled: enabled && key.length > 0,
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}
