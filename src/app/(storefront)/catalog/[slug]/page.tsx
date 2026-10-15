"use client";

import Link from "next/link";
import { useState } from "react";

import { APP_ROUTES, STORE_ROUTES } from "@/constants";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvailabilityBadge } from "@/components/storefront/availability-badge";
import { DeliveryPromise, ProductSpecs } from "@/components/storefront/catalog/product-info-panels";
import { ImageGallery } from "@/components/storefront/image-gallery";
import { PageShell, Section } from "@/components/storefront/layout";
import { PriceDisplay } from "@/components/storefront/price-display";
import { ProductGrid } from "@/components/storefront/product-grid";
import { QuantityStepper } from "@/components/storefront/quantity-stepper";
import { RatingStars } from "@/components/storefront/rating-stars";
import { VariantSelector } from "@/components/storefront/variant-selector";
import { relatedProducts } from "@/components/storefront/demo-commerce-data";

const colorOptions = [
  { id: "ink", label: "Ink", value: "var(--ink-primary)" },
  { id: "surface", label: "Trắng", value: "var(--bg-surface)" },
  { id: "accent", label: "Blue", value: "var(--accent)" },
];

const breadcrumbs = [
  { label: "Trang chủ", href: APP_ROUTES.home },
  { label: "Sản phẩm", href: STORE_ROUTES.catalog.list },
  { label: "Áo thun cotton premium" },
];

export default function ProductDetailPage() {
  const [color, setColor] = useState("ink");
  const [size, setSize] = useState("m");
  const [qty, setQty] = useState(1);
  const customProduct = true;

  return (
    <PageShell breadcrumbs={breadcrumbs}>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-10">
        <div className="lg:sticky lg:top-[var(--sticky-top)] lg:self-start">
          <ImageGallery
            images={[
              { src: "/logo.png", alt: "Áo thun cotton premium" },
              { src: "/logo.png", alt: "Preview in logo" },
              { src: "/logo.png", alt: "Chi tiết chất liệu" },
            ]}
          />
        </div>

        <div className="min-w-0 space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <AvailabilityBadge status="in-stock" quantity={24} />
              <Badge className="bg-accent/10 text-accent hover:bg-accent/10 rounded-full">
                Custom design
              </Badge>
            </div>
            <h1 className="font-display text-ink-primary text-2xl font-bold tracking-tight sm:text-3xl">
              Áo thun cotton premium
            </h1>
            <RatingStars rating={4.8} count={124} />
            <p className="text-ink-secondary text-sm sm:text-base">
              Áo cotton form unisex, phù hợp in logo đội nhóm, sự kiện hoặc merchandise thương hiệu.
            </p>
          </div>

          <PriceDisplay price={249000} compareAtPrice={319000} size="lg" />

          <div className="border-border-default space-y-5 border-y py-5">
            <VariantSelector
              label="Màu"
              type="color"
              value={color}
              onChange={setColor}
              options={colorOptions}
            />
            <VariantSelector
              label="Size"
              value={size}
              onChange={setSize}
              options={[
                { id: "s", label: "S" },
                { id: "m", label: "M" },
                { id: "l", label: "L" },
                { id: "xl", label: "XL", disabled: true },
              ]}
            />
            <QuantityStepper value={qty} onChange={setQty} max={24} />
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button className="min-h-11 rounded-[var(--r-md)]" disabled={customProduct}>
                Thêm vào giỏ
              </Button>
              <Button asChild variant="secondary" className="min-h-11 rounded-[var(--r-md)]">
                <Link href={STORE_ROUTES.design.new}>Bắt đầu thiết kế</Link>
              </Button>
            </div>
            {customProduct && (
              <p className="bg-bg-subtle text-ink-secondary rounded-[var(--r-md)] p-3 text-sm">
                Sản phẩm tùy chỉnh cần xác nhận thiết kế trước khi thêm vào giỏ.
              </p>
            )}
          </div>

          <DeliveryPromise />
        </div>
      </section>

      <ProductSpecs />

      <Section title="Sản phẩm liên quan" eyebrow="Có thể bạn cũng thích">
        <ProductGrid products={relatedProducts} columns={4} />
      </Section>
    </PageShell>
  );
}
