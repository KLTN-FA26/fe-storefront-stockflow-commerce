import Link from "next/link";
import { ArrowRight, FileCheck2, Palette, ShieldCheck } from "lucide-react";

import { STORE_ROUTES } from "@/constants";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listDesigns } from "@/features/product-design";

const guideCards = [
  { icon: Palette, title: "Editor 2D", desc: "Tinh chỉnh logo, text và bố cục theo vùng in." },
  { icon: ShieldCheck, title: "Preflight", desc: "Cảnh báo ảnh mờ, tràn print area và vấn đề sản xuất." },
  { icon: FileCheck2, title: "Snapshot", desc: "Xác nhận bản thiết kế trước khi chuyển sang giỏ hàng." },
] as const;

export default async function DesignListPage() {
  const designs = await listDesigns();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <section className="grid gap-6 rounded-[var(--r-xl)] bg-bg-surface p-[var(--card-pad)] shadow-md lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <Badge className="rounded-full bg-accent/10 text-accent hover:bg-accent/10">Module 12 · Product Design</Badge>
          <h1 className="mt-4 font-display text-4xl font-bold">Thiết kế của tôi</h1>
          <p className="mt-3 max-w-2xl text-ink-secondary">Quản lý bản nháp, kiểm tra preflight và xác nhận snapshot trước khi thêm sản phẩm tùy chỉnh vào giỏ.</p>
        </div>
        <Button asChild size="lg" className="rounded-full">
          <Link href={STORE_ROUTES.design.new}>Tạo thiết kế mới <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {guideCards.map(({ icon: Icon, title, desc }) => (
          <article key={title} className="rounded-[var(--r-lg)] bg-bg-surface p-[var(--card-pad)] shadow-md">
            <Icon className="h-6 w-6 text-accent" />
            <h2 className="mt-4 font-display text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-ink-secondary">{desc}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {designs.map((design) => (
          <article key={design.id} className="overflow-hidden rounded-[var(--r-xl)] bg-bg-surface shadow-md transition duration-300 hover:-translate-y-1 hover:shadow-lg">
            <div className="grid aspect-[16/9] place-items-center bg-bg-subtle">
              <div className="grid h-24 w-24 place-items-center rounded-full bg-accent/10 text-accent">
                <Palette className="h-10 w-10" />
              </div>
            </div>
            <div className="space-y-4 p-[var(--card-pad)]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full">{design.status}</Badge>
                <Badge className="rounded-full bg-accent/10 text-accent hover:bg-accent/10">Preflight {design.preflightResult}</Badge>
              </div>
              <div>
                <p className="font-mono text-sm font-semibold text-accent">{design.id}</p>
                <h2 className="mt-2 font-display text-2xl font-bold">{design.name}</h2>
                <p className="mt-1 text-sm text-ink-secondary">{design.productName} · {design.variantName} · v{design.version}</p>
              </div>
              <Button asChild className="rounded-full">
                <Link href={STORE_ROUTES.design.detail(design.id)}>Mở editor</Link>
              </Button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
