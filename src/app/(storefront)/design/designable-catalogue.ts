import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import { catalogKeys, type CatalogCard } from "@/features/catalog";
import { getCatalogPage, getCatalogProduct } from "@/features/catalog/api";
import { CATALOG_QUERY_MAX } from "@/features/catalog/schemas";
import type { DesignableProduct } from "@/features/product-design";
import { QUERY_TIMES } from "@/lib/api/query-client";
import { retryTransient } from "@/lib/api/retry";

/** Products read per page of the catalogue; "Xem thêm" reads the next. */
export const DESIGNABLE_PAGE_SIZE = 50;

/**
 * The dialog's search text as the catalogue takes it: trimmed and cut to the BE's 100 code points
 * (it counts code points), so a long paste searches its start instead of failing with 400.
 */
export const designableSearchText = (raw: string) =>
  [...raw.trim()].slice(0, CATALOG_QUERY_MAX).join("");

/**
 * The SKUs of a product's variants with their names, for "Nhân bản sang quy cách khác" (the catalogue's product
 * detail).
 */
export async function productSkusOf(
  productSlug: string,
  signal?: AbortSignal,
): Promise<{ sku: string; name?: string | null | undefined }[]> {
  const product = await getCatalogProduct(productSlug, signal);
  return product.variants.map(({ sku, name }) => ({ sku, name }));
}

/** The customizable products of a page with their SKUs: what "Thiết kế mới" can start a design on. */
export const designableOf = (cards: readonly CatalogCard[]): DesignableProduct[] =>
  cards
    // A kind the catalogue does not send reads as customizable: the print config decides later.
    .filter((card) => card.kind === undefined || card.kind === "CUSTOMIZABLE")
    .flatMap((card) =>
      card.skus && card.skus.length > 0
        ? [
            {
              slug: card.slug,
              title: card.title,
              skus: card.skus.map(({ sku }) => sku),
              skuNames: Object.fromEntries(
                card.skus.flatMap(({ sku, name }) => (name?.trim() ? [[sku, name.trim()]] : [])),
              ),
              image: card.primaryImageUrl ?? null,
            },
          ]
        : [],
    );

/**
 * The catalogue page after page for "Thiết kế mới" (`fetchNextPage` reads the next), searched by
 * `q`. A new `q` is a new query: the read of the previous text is called off through its signal.
 * A refetch reads every loaded page again, so coming back to the tab does not trigger one.
 */
export function useDesignableCataloguePages(q: string, enabled: boolean) {
  const params = { q, size: DESIGNABLE_PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: [...catalogKeys.lists(), "designable", params] as const,
    queryFn: ({ pageParam, signal }) => getCatalogPage({ ...params, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled,
    placeholderData: keepPreviousData, // the previous text's products stay while the next loads
    retry: retryTransient,
    ...QUERY_TIMES.list,
    refetchOnWindowFocus: false,
  });
}
