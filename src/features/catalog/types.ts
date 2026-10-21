import type { z } from "zod";

import type {
  catalogCardDtoSchema,
  catalogCardSkuDtoSchema,
  catalogGalleryDtoSchema,
  catalogListInputSchema,
  catalogProductDtoSchema,
  catalogVariantDtoSchema,
  galleryImageDtoSchema,
  searchSuggestionDtoSchema,
} from "./schemas";

export type CatalogCard = z.infer<typeof catalogCardDtoSchema>;
export type CatalogCardSku = z.infer<typeof catalogCardSkuDtoSchema>;
export type CatalogVariant = z.infer<typeof catalogVariantDtoSchema>;
export type CatalogProduct = z.infer<typeof catalogProductDtoSchema>;
export type GalleryImage = z.infer<typeof galleryImageDtoSchema>;
export type CatalogGallery = z.infer<typeof catalogGalleryDtoSchema>;
export type SearchSuggestion = z.infer<typeof searchSuggestionDtoSchema>;
export type CatalogListInput = z.input<typeof catalogListInputSchema>;

/** One page of the catalogue on the FE side: `page` is 1-based, the rest is the BE PageResponse. */
export interface CatalogPage {
  items: CatalogCard[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface CatalogListParams {
  q?: string | undefined;
  sort?: "relevance" | "newest" | "title" | undefined;
  /** 1-based page from the URL. */
  page: number;
  size: number;
}
