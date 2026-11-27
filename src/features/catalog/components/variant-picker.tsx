"use client";

import { VariantSelector } from "@/components/storefront/variant-selector";
import { normalizeSku } from "@/lib/catalog/schemas";
import type { Availability } from "@/lib/catalog/types";

import { valueOn, variantAxes, variantForPick } from "../selectors";
import type { CatalogVariant } from "../types";

/**
 * Picks the variant (quy cách) axis by axis - "Dung tích", then "Màu"… - from the values the BE sends per variant
 * (BE #493). A BE without axes, or variants that do not all carry every axis, get the plain list of variants, named
 * by their name when the BE sends one. An out-of-stock choice is disabled, as before (13 BR-11).
 */
export function VariantPicker({
  variants,
  sku,
  onSkuChange,
  availabilityOf,
}: {
  variants: CatalogVariant[];
  sku: string;
  onSkuChange: (sku: string) => void;
  availabilityOf: (sku: string) => Availability | undefined;
}) {
  const current = variants.find((v) => normalizeSku(v.sku) === normalizeSku(sku));
  const axes = variantAxes(variants);
  const soldOut = (variant: CatalogVariant | undefined) =>
    !variant || (availabilityOf(variant.sku) === "OUT_OF_STOCK" && variant.sku !== sku);

  if (axes.length === 0) {
    return variants.length > 1 ? (
      <VariantSelector
        label="Phiên bản"
        value={sku}
        onChange={onSkuChange}
        options={variants.map((variant) => ({
          id: variant.sku,
          label: variant.name || variant.sku,
          disabled: soldOut(variant),
        }))}
      />
    ) : null;
  }
  return (
    <div className="space-y-4">
      {axes.map((axis) => (
        <VariantSelector
          key={axis.code}
          label={axis.name}
          value={valueOn(current, axis.code) ?? ""}
          onChange={(valueCode) => {
            const next = variantForPick(variants, current, axis.code, valueCode);
            if (next) onSkuChange(next.sku);
          }}
          options={axis.values.map((value) => ({
            id: value.code,
            label: value.label,
            disabled: soldOut(variantForPick(variants, current, axis.code, value.code)),
          }))}
        />
      ))}
    </div>
  );
}
