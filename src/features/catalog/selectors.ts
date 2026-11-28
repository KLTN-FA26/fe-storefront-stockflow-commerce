import { normalizeSku } from "@/lib/catalog/schemas";
import { formatNumber } from "@/lib/format/number";

import type { CatalogAttribute, CatalogGallery, CatalogVariant, GalleryImage } from "./types";

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

/* ── Product page: variant axes and descriptive attributes (BE #493, ADR-0013) ── */

/** One axis the customer picks a value on, e.g. "Dung tích": 8oz / 12oz; values in first-seen order. */
export interface VariantAxis {
  code: string;
  name: string;
  values: Array<{ code: string; label: string }>;
}

/**
 * The axes to pick on, or `[]` when the variants cannot be chosen axis by axis: a BE without `options`, a product
 * without axes, or variants that do not all carry every axis - the page then lists the variants themselves.
 */
export function variantAxes(variants: readonly CatalogVariant[]): VariantAxis[] {
  if (variants.length === 0 || variants.some((v) => !v.options?.length)) return [];
  const axes = new Map<string, VariantAxis>();
  for (const variant of variants) {
    for (const option of variant.options ?? []) {
      const axis = axes.get(option.axisCode) ?? {
        code: option.axisCode,
        name: option.axisName,
        values: [],
      };
      if (!axis.values.some((value) => value.code === option.valueCode)) {
        axis.values.push({ code: option.valueCode, label: option.label });
      }
      axes.set(option.axisCode, axis);
    }
  }
  const codes = [...axes.keys()];
  const complete = variants.every((v) =>
    codes.every((code) => v.options?.some((o) => o.axisCode === code)),
  );
  return complete ? [...axes.values()] : [];
}

/** The value code a variant has on an axis. */
export function valueOn(variant: CatalogVariant | undefined, axisCode: string): string | undefined {
  return variant?.options?.find((option) => option.axisCode === axisCode)?.valueCode;
}

/**
 * The variant to show when the customer picks `valueCode` on `axisCode` while `current` is shown: the one that keeps
 * every other axis as it is, else the first with that value. `undefined` when no variant has it.
 */
export function variantForPick(
  variants: readonly CatalogVariant[],
  current: CatalogVariant | undefined,
  axisCode: string,
  valueCode: string,
): CatalogVariant | undefined {
  const withValue = variants.filter((v) => valueOn(v, axisCode) === valueCode);
  return (
    withValue.find((v) =>
      (v.options ?? []).every(
        (o) => o.axisCode === axisCode || valueOn(current, o.axisCode) === o.valueCode,
      ),
    ) ?? withValue[0]
  );
}

/** A descriptive attribute as one line of text, by its data type; "" when it holds nothing. */
export function attributeText(attribute: CatalogAttribute): string {
  if (attribute.values?.length) return attribute.values.join(", ");
  if (attribute.text) return attribute.text;
  if (attribute.number !== null && attribute.number !== undefined) {
    const number = formatNumber(attribute.number);
    return attribute.unit ? `${number} ${attribute.unit}` : number;
  }
  if (attribute.bool !== null && attribute.bool !== undefined)
    return attribute.bool ? "Có" : "Không";
  return "";
}
