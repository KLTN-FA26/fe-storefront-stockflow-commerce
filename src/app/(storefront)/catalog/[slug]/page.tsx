"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, RotateCcw, Ruler, ShieldCheck, Truck } from "lucide-react";

import { STORE_ROUTES } from "@/constants";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvailabilityBadge } from "@/components/storefront/availability-badge";
import { ImageGallery } from "@/components/storefront/image-gallery";
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

const detailCards = [
  { icon: Truck, title: "Giao dự kiến", desc: "2–4 ngày cho sản phẩm tiêu chuẩn." },
  { icon: ShieldCheck, title: "Preflight QC", desc: "Thiết kế custom được kiểm tra trước checkout." },
  { icon: RotateCcw, title: "Đổi trả rõ ràng", desc: "Hỗ trợ nếu lỗi sản xuất hoặc sai mẫu duyệt." },
] as const;

export default function ProductDetailPage() {
  const [color, setColor] = useState("ink");
  const [size, setSize] = useState("m");
  const [qty, setQty] = useState(1);
  const customProduct = true;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
      <nav className="text-sm text-ink-secondary">
        <Link href={STORE_ROUTES.catalog.list} className="hover:text-accent">Catalog</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-primary">Áo thun cotton premium</span>
      </nav>

      <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <ImageGallery images={[{ src: "/logo.png", alt: "Áo thun cotton premium" }, { src: "/logo.png", alt: "Preview in logo" }, { src: "/logo.png", alt: "Chi tiết chất liệu" }]} />

        <div className="space-y-6 rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md">
          <div className="flex flex-wrap items-center gap-2">
            <AvailabilityBadge status="in-stock" quantity={24} />
            <Badge className="rounded-full bg-accent/10 text-accent hover:bg-accent/10">Custom design</Badge>
          </div>

          <div className="space-y-3">
            <h1 className="font-display text-4xl font-bold tracking-tight">Áo thun cotton premium</h1>
            <RatingStars rating={4.8} count={124} />
            <p className="text-ink-secondary">Áo cotton form unisex, phù hợp in logo đội nhóm, sự kiện hoặc merchandise thương hiệu.</p>
          </div>

          <PriceDisplay price={249000} compareAtPrice={319000} size="lg" />

          <div className="space-y-5">
            <VariantSelector label="Màu" type="color" value={color} onChange={setColor} options={colorOptions} />
            <VariantSelector label="Size" value={size} onChange={setSize} options={[{ id: "s", label: "S" }, { id: "m", label: "M" }, { id: "l", label: "L" }, { id: "xl", label: "XL", disabled: true }]} />
            <QuantityStepper value={qty} onChange={setQty} max={24} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button className="h-11 rounded-full" disabled={customProduct}>Thêm vào giỏ</Button>
            <Button asChild variant="secondary" className="h-11 rounded-full">
              <Link href={STORE_ROUTES.design.new}>Bắt đầu thiết kế</Link>
            </Button>
          </div>
          {customProduct && <p className="rounded-[var(--r-lg)] bg-bg-subtle p-3 text-sm text-ink-secondary">Sản phẩm tùy chỉnh cần xác nhận thiết kế trước khi thêm vào giỏ.</p>}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {detailCards.map(({ icon: Icon, title, desc }) => (
          <article key={title} className="rounded-[var(--r-lg)] bg-bg-surface p-[var(--card-pad)] shadow-md">
            <Icon className="h-5 w-5 text-accent" />
            <h2 className="mt-4 font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-ink-secondary">{desc}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md">
          <Ruler className="h-6 w-6 text-accent" />
          <h2 className="mt-4 font-display text-2xl font-bold">Thông số sản phẩm</h2>
          <dl className="mt-5 grid gap-3 text-sm">
            {[["Chất liệu", "Cotton compact 220gsm"], ["Kỹ thuật", "In chuyển nhiệt / DTF"], ["Form", "Unisex regular fit"], ["Bảo quản", "Giặt mặt trái, không sấy nhiệt cao"]].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-border-default pb-3 last:border-0">
                <dt className="text-ink-secondary">{label}</dt>
                <dd className="font-medium text-ink-primary">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md">
          <CheckCircle2 className="h-6 w-6 text-positive" />
          <h2 className="mt-4 font-display text-2xl font-bold">Cam kết trước sản xuất</h2>
          <p className="mt-3 text-ink-secondary">Mỗi thiết kế được kiểm tra vùng in, cảnh báo ảnh mờ và yêu cầu xác nhận snapshot để hạn chế sai lệch khi sản xuất.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["Print area", "Safe area", "Preview 2D"].map((item) => <Badge key={item} variant="secondary" className="justify-center rounded-full py-2">{item}</Badge>)}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-accent">Có thể bạn cũng thích</p>
          <h2 className="font-display text-3xl font-bold">Sản phẩm liên quan</h2>
        </div>
        <ProductGrid products={relatedProducts} />
      </section>
    </div>
  );
}
