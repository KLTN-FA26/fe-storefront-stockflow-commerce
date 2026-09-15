import Link from "next/link";
import { ArrowRight, BadgeCheck, Headphones, PackageCheck, Palette, ShieldCheck, Sparkles, Truck } from "lucide-react";

import { STORE_ROUTES } from "@/constants";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductGrid } from "@/components/storefront/product-grid";
import { featuredProducts } from "@/components/storefront/demo-commerce-data";

const categories = [
  { title: "Áo & hoodie", desc: "Cotton, teamwear, áo sự kiện", icon: PackageCheck },
  { title: "Quà tặng in ấn", desc: "Cốc, bình, túi canvas", icon: Sparkles },
  { title: "Ấn phẩm doanh nghiệp", desc: "Name card, poster, sticker", icon: BadgeCheck },
  { title: "Thiết kế riêng", desc: "Editor 2D + preflight", icon: Palette },
] as const;

const promises = [
  { icon: ShieldCheck, title: "Thanh toán an toàn", desc: "Không lưu dữ liệu thẻ, chỉ giữ last4 khi cần hiển thị." },
  { icon: Truck, title: "Theo dõi giao hàng", desc: "Timeline đơn hàng và trạng thái vận chuyển rõ ràng." },
  { icon: Headphones, title: "Sales chat", desc: "Trao đổi thiết kế, báo giá và preview ngay trong storefront." },
] as const;

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <section className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <Badge className="rounded-full bg-accent/10 text-accent hover:bg-accent/10">StockFlow Storefront</Badge>
          <div className="space-y-4">
            <h1 className="max-w-3xl font-display text-4xl font-bold tracking-tight text-ink-primary sm:text-5xl lg:text-6xl">
              Mua sắm, tùy biến thiết kế và theo dõi đơn in ấn trong một trải nghiệm TMĐT.
            </h1>
            <p className="max-w-2xl text-lg text-ink-secondary">
              Catalog sản phẩm, editor thiết kế, giỏ hàng, checkout, thanh toán và chăm sóc khách hàng được tối ưu mobile-first cho khách mua lẻ và doanh nghiệp.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full">
              <Link href={STORE_ROUTES.catalog.list}>Khám phá sản phẩm <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="rounded-full">
              <Link href={STORE_ROUTES.design.list}>Mở thiết kế của tôi</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-[var(--r-xl)] bg-bg-surface p-4 shadow-lg">
          <div className="rounded-[var(--r-lg)] bg-bg-subtle p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-accent">Đang bán chạy</p>
                <h2 className="mt-2 font-display text-3xl font-bold">Áo thun cotton premium</h2>
                <p className="mt-2 text-sm text-ink-secondary">Custom logo, kiểm tra preflight trước khi thêm vào giỏ.</p>
              </div>
              <Badge className="rounded-full">Custom</Badge>
            </div>
            <div className="mt-8 grid aspect-[4/3] place-items-center rounded-[var(--r-xl)] bg-bg-surface shadow-md">
              <div className="grid h-40 w-40 place-items-center rounded-full bg-accent/10 text-accent">
                <Palette className="h-16 w-16" />
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {promises.map(({ icon: Icon, title }) => (
                <div key={title} className="rounded-[var(--r-lg)] bg-bg-surface p-3 text-sm shadow-sm">
                  <Icon className="mb-2 h-4 w-4 text-accent" />
                  <p className="font-semibold">{title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map(({ title, desc, icon: Icon }) => (
          <Link key={title} href={STORE_ROUTES.catalog.list} className="rounded-[var(--r-lg)] bg-bg-surface p-[var(--card-pad)] shadow-md transition duration-300 hover:-translate-y-1 hover:shadow-lg">
            <Icon className="h-6 w-6 text-accent" />
            <h2 className="mt-4 font-display text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-ink-secondary">{desc}</p>
          </Link>
        ))}
      </section>

      <section className="space-y-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-accent">Sản phẩm nổi bật</p>
            <h2 className="font-display text-3xl font-bold">Gợi ý cho đơn hàng tiếp theo</h2>
          </div>
          <Button asChild variant="secondary" className="rounded-full">
            <Link href={STORE_ROUTES.catalog.list}>Xem tất cả</Link>
          </Button>
        </div>
        <ProductGrid products={featuredProducts} />
      </section>

      <section className="grid gap-6 rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-semibold text-accent">Custom design flow</p>
          <h2 className="mt-2 font-display text-3xl font-bold">Từ ý tưởng đến checkout trong 3 bước.</h2>
          <p className="mt-3 text-ink-secondary">Chọn sản phẩm, tinh chỉnh thiết kế 2D, kiểm tra preflight rồi xác nhận để chuyển sang giỏ hàng.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {["Chọn sản phẩm", "Thiết kế & preflight", "Xác nhận & checkout"].map((step, index) => (
            <div key={step} className="rounded-[var(--r-lg)] border border-border-default bg-bg-subtle p-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-ink-inverse">{index + 1}</span>
              <p className="mt-4 font-semibold">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {promises.map(({ icon: Icon, title, desc }) => (
          <article key={title} className="rounded-[var(--r-lg)] bg-bg-surface p-[var(--card-pad)] shadow-md">
            <Icon className="h-6 w-6 text-accent" />
            <h2 className="mt-4 font-display text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-ink-secondary">{desc}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
