"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { AvailabilityBadge } from "@/components/storefront/availability-badge";
import { VariantSelector } from "@/components/storefront/variant-selector";
import { badgeStatus } from "@/lib/catalog/selectors";
import { variantLabel } from "@/lib/catalog/variant-label";
import type { Availability } from "@/lib/catalog/types";

import type { CatalogVariant } from "../types";

interface ProductPurchasePanelProps {
  variants: CatalogVariant[];
  /** The product's title: a variant's name starts with it, so only what follows is shown. */
  productTitle: string;
  sku: string;
  onSkuChange: (sku: string) => void;
  /** Stock per SKU: the richer /availability answer, else the detail's own IN/OUT. */
  availabilityOf: (sku: string) => Availability | undefined;
  /** The design feature's entry for the chosen SKU (composed by the page); absent for a product that cannot be customized. */
  designEntry?: ReactNode;
  /** Where the customer talks to Sales about this product. */
  chatHref: string;
}

/**
 * What a customer can do on a product (kltn-docs 13 §4, BR-01): see the versions and whether they
 * are in stock, design one printed to their own artwork, or ask Sales. The portal shows no price
 * and takes no order (13, 14 BR-01 — decided 2026-11-04/05): Sales quote by the carton and draw
 * the order up from the accepted quote.
 */
export function ProductPurchasePanel({
  variants,
  productTitle,
  sku,
  onSkuChange,
  availabilityOf,
  designEntry,
  chatHref,
}: ProductPurchasePanelProps) {
  const availability = availabilityOf(sku);
  const status = badgeStatus(availability);
  const chosen = variants.find((variant) => variant.sku === sku);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {status ? <AvailabilityBadge status={status} /> : null}
        {chosen?.name ? (
          <span className="text-ink-primary text-sm font-medium">
            {variantLabel(chosen, productTitle)}
          </span>
        ) : null}
        <span className="text-ink-tertiary font-mono text-xs">Mã {sku}</span>
      </div>

      {variants.length > 1 ? (
        <VariantSelector
          label="Quy cách"
          value={sku}
          onChange={onSkuChange}
          options={variants.map((variant) => ({
            id: variant.sku,
            label: variantLabel(variant, productTitle),
            disabled: availabilityOf(variant.sku) === "OUT_OF_STOCK" && variant.sku !== sku,
          }))}
        />
      ) : null}

      <div className="space-y-3">
        <div className={designEntry ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
          {designEntry ?? null}
          <Button
            asChild
            variant={designEntry ? "outline" : "default"}
            className="min-h-11 rounded-[var(--r-md)]"
          >
            <Link href={chatHref}>
              <MessageCircle className="size-4" aria-hidden="true" />
              Chat với Sale
            </Link>
          </Button>
        </div>
        <p className="bg-bg-subtle text-ink-secondary rounded-[var(--r-md)] p-3 text-sm">
          {designEntry
            ? "Thiết kế in theo mẫu của bạn; khi bản thiết kế được duyệt, gửi yêu cầu báo giá để Sale báo giá theo số thùng bạn cần."
            : "Giá không hiển thị trên sàn: Sale báo giá theo số thùng bạn cần và chốt đơn với bạn qua hợp đồng."}
        </p>
        {availability === "OUT_OF_STOCK" ? (
          <p className="bg-bg-subtle text-ink-secondary rounded-[var(--r-md)] p-3 text-sm">
            Quy cách này đang hết hàng. Chọn quy cách khác hoặc chat với Sale.
          </p>
        ) : null}
      </div>
    </div>
  );
}
