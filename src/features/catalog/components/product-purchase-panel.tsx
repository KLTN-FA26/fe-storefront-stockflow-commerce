"use client";

import Link from "next/link";
import { MessageCircle, ShoppingCart } from "lucide-react";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { AvailabilityBadge } from "@/components/storefront/availability-badge";
import { PriceDisplay } from "@/components/storefront/price-display";
import { QuantityStepper } from "@/components/storefront/quantity-stepper";
import { VariantSelector } from "@/components/storefront/variant-selector";
import { badgeStatus, canBuy, unitPriceFor } from "@/lib/catalog/selectors";
import type { Availability, PriceSchedule } from "@/lib/catalog/types";

import type { CatalogVariant } from "../types";
import { PriceTiers } from "./price-tiers";

interface ProductPurchasePanelProps {
  variants: CatalogVariant[];
  sku: string;
  onSkuChange: (sku: string) => void;
  /** Stock per SKU: the richer /availability answer, else the detail's own IN/OUT. */
  availabilityOf: (sku: string) => Availability | undefined;
  /** The customer's price list for the chosen SKU; undefined while loading or when there is none. */
  schedule: PriceSchedule | undefined;
  pricesState: "loading" | "ready" | "restricted" | "error";
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onAdd: () => void;
  /** The design launcher for the chosen SKU; null for a product that cannot be customized. */
  designHref: string | null;
  /**
   * Where a customer asks Sales for a quote; set for a product printed to a design, which is quoted
   * and never added to the cart (owner decision DESIGN-QUOTE, 28/10). null for stock goods.
   */
  quoteHref: string | null;
}

export function ProductPurchasePanel({
  variants,
  sku,
  onSkuChange,
  availabilityOf,
  schedule,
  pricesState,
  quantity,
  onQuantityChange,
  onAdd,
  designHref,
  quoteHref,
}: ProductPurchasePanelProps) {
  const availability = availabilityOf(sku);
  const unitPrice = unitPriceFor(schedule, quantity);
  const moq = schedule?.moq ?? 1;
  const belowMoq = Boolean(schedule) && quantity < moq;
  const noPrice = pricesState === "ready" && !schedule;
  const canAdd = canBuy(availability) && Boolean(schedule) && !belowMoq;
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

      <div className="border-border-default space-y-4 border-y py-5">
        {pricesState === "loading" ? (
          <p className="text-ink-secondary text-sm" role="status">
            Đang tải giá…
          </p>
        ) : unitPrice !== undefined ? (
          <div>
            <PriceDisplay price={unitPrice} currency={schedule?.currency} size="lg" />
            <p className="text-ink-secondary text-sm">/ đơn vị, theo số lượng đã chọn</p>
          </div>
        ) : null}
        {schedule ? <PriceTiers schedule={schedule} quantity={quantity} /> : null}
        {pricesState === "restricted" ? (
          <Alert tone="warning" title="Không xem được giá.">
            Chỉ tài khoản khách hàng đã kích hoạt mới có bảng giá riêng.
          </Alert>
        ) : null}
        {pricesState === "error" ? (
          <Alert tone="warning" title="Chưa tải được giá.">
            Vui lòng tải lại trang. Giá cuối cùng luôn được xác nhận khi đặt hàng.
          </Alert>
        ) : null}
        {noPrice ? (
          <Alert tone="info" title="Chưa có giá cho sản phẩm này.">
            Hãy chat với Sales để được báo giá.
          </Alert>
        ) : null}
        <QuantityStepper value={quantity} min={moq} onChange={onQuantityChange} />
        {belowMoq ? (
          <p role="alert" className="text-danger text-sm">
            Số lượng tối thiểu của bảng giá là {moq}.
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className={designHref ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
          {quoteHref ? (
            <Button asChild className="min-h-11 rounded-[var(--r-md)]">
              <Link href={quoteHref}>
                <MessageCircle className="size-4" aria-hidden="true" />
                Liên hệ Sale báo giá
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-11 rounded-[var(--r-md)]"
              disabled={!canAdd}
              onClick={onAdd}
            >
              <ShoppingCart className="size-4" aria-hidden="true" />
              Thêm vào giỏ
            </Button>
          )}
          {designHref ? (
            <Button asChild variant="secondary" className="min-h-11 rounded-[var(--r-md)]">
              <Link href={designHref}>Bắt đầu thiết kế</Link>
            </Button>
          ) : null}
        </div>
        {quoteHref ? (
          <p className="bg-bg-subtle text-ink-secondary rounded-[var(--r-md)] p-3 text-sm">
            Sản phẩm in theo thiết kế của bạn được báo giá riêng, nên không thêm vào giỏ hàng. Hãy
            liên hệ Sale để được báo giá.
          </p>
        ) : null}
        {availability === "OUT_OF_STOCK" ? (
          <p className="bg-bg-subtle text-ink-secondary rounded-[var(--r-md)] p-3 text-sm">
            Phiên bản này đang hết hàng. Chọn phiên bản khác hoặc chat với Sales.
          </p>
        ) : null}
      </div>
    </div>
  );
}
