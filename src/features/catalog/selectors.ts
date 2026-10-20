import { normalizeSku } from "@/lib/catalog/schemas";

import { CATALOG_QUERY_MAX } from "./schemas";

import type { CatalogGallery, GalleryImage } from "./types";

/** Gallery order is the BE's `sortOrder`; the primary image leads when none is chosen. */
export function sortedImages(gallery: CatalogGallery | undefined): GalleryImage[] {
  return [...(gallery?.images ?? [])].sort(
    (a, b) => Number(b.primary) - Number(a.primary) || a.sortOrder - b.sortOrder,
  );
}

/** The picture for a SKU when the gallery has one, else the primary image. */
export function imageFor(
  gallery: CatalogGallery | undefined,
  sku?: string,
): GalleryImage | undefined {
  const images = sortedImages(gallery);
  const wanted = sku ? normalizeSku(sku) : undefined;
  return (
    (wanted && images.find((image) => image.sku && normalizeSku(image.sku) === wanted)) || images[0]
  );
}

/** The browser title of /search: the text searched, so tabs and history tell searches apart. */
export function searchPageTitle(q: string | undefined): string {
  const text = [...(q?.trim() ?? "")].slice(0, CATALOG_QUERY_MAX).join("");
  return text ? `Tìm “${text}”` : "Tìm kiếm";
}
