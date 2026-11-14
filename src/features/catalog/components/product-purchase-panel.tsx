"use client";

import Link from "next/link";
import { MessageCircle, PenTool } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AvailabilityBadge } from "@/components/storefront/availability-badge";
import { VariantSelector } from "@/components/storefront/variant-selector";
import { badgeStatus } from "@/lib/catalog/selectors";
import type { Availability } from "@/lib/catalog/types";

import type { CatalogVariant } from "../types";

interface ProductPurchasePanelProps {
  variants: CatalogVariant[];
  sku: string;
  onSkuChange: (sku: string) => void;
  /** Stock per SKU: the richer /availability answer, else the detail's own IN/OUT. */
  availabilityOf: (sku: string) => Availability | undefined;
  /** The design launcher for the chosen SKU; null for a product that cannot be customized. */
  designHref: string | null;
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
  sku,
  onSkuChange,
  availabilityOf,
  designHref,
  chatHref,
}: ProductPurchasePanelProps) {
  const availability = availabilityOf(sku);
  const status = badgeStatus(availability);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {status ? <AvailabilityBadge status={status} /> : null}
        <span className="text-ink-tertiary font-mono text-xs">{sku}</span>
      </div>

      {variants.length > 1 ? (
        <VariantSelector
          label="Phiên bản (mã SKU)"
          value={sku}
          onChange={onSkuChange}
          options={variants.map((variant) => ({
            id: variant.sku,
            label: variant.sku,
            disabled: availabilityOf(variant.sku) === "OUT_OF_STOCK" && variant.sku !== sku,
          }))}
        />
      ) : null}

      <div className="space-y-3">
        <div className={designHref ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
          {designHref ? (
            <Button asChild className="min-h-11 rounded-[var(--r-md)]">
              <Link href={designHref}>
                <PenTool className="size-4" aria-hidden="true" />
                Bắt đầu thiết kế
              </Link>
            </Button>
          ) : null}
          <Button
            asChild
            variant={designHref ? "secondary" : "default"}
            className="min-h-11 rounded-[var(--r-md)]"
          >
            <Link href={chatHref}>
              <MessageCircle className="size-4" aria-hidden="true" />
              Chat với Sale
            </Link>
          </Button>
        </div>
        <p className="bg-bg-subtle text-ink-secondary rounded-[var(--r-md)] p-3 text-sm">
          {designHref
            ? "Thiết kế in theo mẫu của bạn; khi bản thiết kế được duyệt, gửi yêu cầu báo giá để Sale báo giá theo số thùng bạn cần."
            : "Giá không hiển thị trên sàn: Sale báo giá theo số thùng bạn cần và chốt đơn với bạn qua hợp đồng."}
        </p>
        {availability === "OUT_OF_STOCK" ? (
          <p className="bg-bg-subtle text-ink-secondary rounded-[var(--r-md)] p-3 text-sm">
            Phiên bản này đang hết hàng. Chọn phiên bản khác hoặc chat với Sale.
          </p>
        ) : null}
      </div>
    </div>
  );
}
