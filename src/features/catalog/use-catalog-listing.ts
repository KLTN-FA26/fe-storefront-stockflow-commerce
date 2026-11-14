import { useMemo } from "react";

import { useAvailability } from "@/lib/catalog/queries";
import { normalizeSku } from "@/lib/catalog/schemas";
import { availabilityBySku, bestAvailability } from "@/lib/catalog/selectors";
import type { Availability } from "@/lib/catalog/types";

import { isProductNotFound } from "./errors";
import { hasCardFields, useCardDetails, useCatalogPage } from "./queries";
import { imageFor } from "./selectors";
import type { CatalogCard, CatalogListParams } from "./types";

export interface CatalogListingItem {
  card: CatalogCard;
  imageUrl?: string | undefined;
  imageAlt?: string | undefined;
  availability?: Availability | undefined;
  /** The detail answered 404: the product was unpublished after the list was built. */
  unavailable: boolean;
}

/**
 * The catalogue page with what a card needs: one list call, then stock once for all
 * SKUs of the page. The list row carries `primaryImageUrl` and `skus`, so a card makes no detail
 * or gallery call of its own. A row without them (an older BE) falls back to reading its detail
 * and gallery, the same queries the product page uses, so opening one is free. Stock
 * are CUSTOMER-only: a staff token still lists products, just without the figures (`restricted`).
 */
export function useCatalogListing(params: CatalogListParams, enabled: boolean) {
  const page = useCatalogPage(params, enabled);
  const cards = useMemo(() => page.data?.items ?? [], [page.data]);
  const fallback = useMemo(() => cards.filter((card) => !hasCardFields(card)), [cards]);
  const { products, galleries } = useCardDetails(fallback, enabled);

  const detailsSettled = cards.length > 0 && products.every((query) => !query.isPending);
  const skus = useMemo(() => {
    const own = cards.flatMap((card) => card.skus?.map((entry) => entry.sku) ?? []);
    const read = products.flatMap((query) => query.data?.variants.map((v) => v.sku) ?? []);
    return [...own, ...read];
  }, [cards, products]);
  const stock = useAvailability(skus, enabled && detailsSettled);

  const items = useMemo<CatalogListingItem[]>(() => {
    const stockBySku = availabilityBySku(stock.data);
    const slot = new Map(fallback.map((card, index) => [card.productId, index]));
    return cards.map((card) => {
      const index = slot.get(card.productId);
      const product = index === undefined ? undefined : products[index]?.data;
      const image = index === undefined ? undefined : imageFor(galleries[index]?.data);
      const productSkus = (
        card.skus?.map((entry) => entry.sku) ??
        product?.variants.map((variant) => variant.sku) ??
        []
      ).map(normalizeSku);
      const availabilities = productSkus.flatMap((sku) => stockBySku.get(sku) ?? []);
      return {
        card,
        imageUrl: card.primaryImageUrl ?? image?.url,
        imageAlt: image?.altText ?? card.title,
        availability: bestAvailability(availabilities),
        unavailable: index !== undefined && isProductNotFound(products[index]?.error),
      };
    });
  }, [cards, fallback, products, galleries, stock.data]);

  return {
    page,
    items,
    figuresPending: detailsSettled && stock.isPending,
    figuresError: stock.error,
  };
}
