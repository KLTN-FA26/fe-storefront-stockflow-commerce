import { useMemo } from "react";

import { useAvailability, usePrices } from "@/lib/catalog/queries";
import { normalizeSku } from "@/lib/catalog/schemas";
import {
  availabilityBySku,
  bestAvailability,
  indexBySku,
  lowestUnitPrice,
} from "@/lib/catalog/selectors";
import type { Availability } from "@/lib/catalog/types";

import { isProductNotFound } from "./errors";
import { useCardDetails, useCatalogPage } from "./queries";
import { imageFor } from "./selectors";
import type { CatalogCard, CatalogListParams } from "./types";

export interface CatalogListingItem {
  card: CatalogCard;
  imageUrl?: string | undefined;
  imageAlt?: string | undefined;
  /** The customer's lowest unit price over the product's SKUs; absent when none is priced. */
  priceFrom?: number | undefined;
  availability?: Availability | undefined;
  /** The detail answered 404: the product was unpublished after the list was built. */
  unavailable: boolean;
}

/**
 * The catalogue page with what a card needs. `GET /catalog/products` rows carry only title and
 * slug (no image, SKU, price or stock), so each card reads its detail and gallery (the same
 * queries the product page uses, so opening one is free), then the page asks for stock and
 * prices once for all SKUs. Both are CUSTOMER-only: a staff token still lists products, just
 * without the figures (`restricted`).
 */
export function useCatalogListing(params: CatalogListParams, enabled: boolean) {
  const page = useCatalogPage(params, enabled);
  const cards = useMemo(() => page.data?.items ?? [], [page.data]);
  const { products, galleries } = useCardDetails(cards, enabled);

  const detailsSettled = cards.length > 0 && products.every((query) => !query.isPending);
  const skus = useMemo(
    () => products.flatMap((query) => query.data?.variants.map((variant) => variant.sku) ?? []),
    [products],
  );
  const stock = useAvailability(skus, enabled && detailsSettled);
  const prices = usePrices(skus, enabled && detailsSettled);

  const items = useMemo<CatalogListingItem[]>(() => {
    const stockBySku = availabilityBySku(stock.data);
    const priceBySku = indexBySku(prices.data);
    return cards.map((card, index) => {
      const product = products[index]?.data;
      const image = imageFor(galleries[index]?.data);
      const productSkus = (product?.variants ?? []).map((variant) => normalizeSku(variant.sku));
      const schedules = productSkus.flatMap((sku) => priceBySku.get(sku) ?? []);
      const availabilities = productSkus.flatMap((sku) => stockBySku.get(sku) ?? []);
      return {
        card,
        imageUrl: image?.url,
        imageAlt: image?.altText ?? card.title,
        priceFrom: lowestUnitPrice(schedules),
        availability: bestAvailability(availabilities),
        unavailable: isProductNotFound(products[index]?.error),
      };
    });
  }, [cards, products, galleries, stock.data, prices.data]);

  return {
    page,
    items,
    figuresPending: detailsSettled && (stock.isPending || prices.isPending),
    figuresError: stock.error ?? prices.error,
  };
}
