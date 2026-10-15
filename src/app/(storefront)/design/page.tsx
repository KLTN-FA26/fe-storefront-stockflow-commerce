import Link from "next/link";
import { ArrowRight, FileCheck2, Palette, ShieldCheck } from "lucide-react";

import { STORE_ROUTES } from "@/constants";

import { PageShell, SurfaceCard } from "@/components/storefront/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listDesigns } from "@/features/product-design";

const guideCards = [
  { icon: Palette, title: "Editor 2D", desc: "Tinh chỉnh logo, text và bố cục theo vùng in." },
  {
    icon: ShieldCheck,
    title: "Preflight",
    desc: "Cảnh báo ảnh mờ, tràn print area và vấn đề sản xuất.",
  },
  {
    icon: FileCheck2,
    title: "Snapshot",
    desc: "Xác nhận bản thiết kế trước khi chuyển sang giỏ hàng.",
  },
] as const;

export default async function DesignListPage() {
  const designs = await listDesigns();

  return (
    <PageShell
      title="Thiết kế của tôi"
      subtitle="Quản lý bản nháp, kiểm tra preflight và xác nhận snapshot trước khi thêm sản phẩm tùy chỉnh vào giỏ."
      actions={
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-4">
          <Link href={STORE_ROUTES.design.new}>
            Tạo thiết kế mới <ArrowRight className="size-4" />
          </Link>
        </Button>
      }
    >
      <section className="grid gap-3 md:grid-cols-3">
        {guideCards.map(({ icon: Icon, title, desc }) => (
          <SurfaceCard key={title} as="article" className="flex items-start gap-3">
            <span
              aria-hidden
              className="bg-accent/10 text-accent flex size-10 shrink-0 items-center justify-center rounded-[var(--r-md)]"
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-ink-primary text-base font-semibold">{title}</h2>
              <p className="text-ink-secondary mt-0.5 text-sm">{desc}</p>
            </div>
          </SurfaceCard>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {designs.map((design) => (
          <SurfaceCard
            key={design.id}
            as="article"
            padded={false}
            className="hover:border-border-strong flex flex-col overflow-hidden transition-colors"
          >
            <div className="bg-bg-subtle grid aspect-[4/3] place-items-center">
              <div className="bg-accent/10 text-accent grid size-16 place-items-center rounded-full">
                <Palette className="size-7" />
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-[var(--card-pad)]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full">
                  {design.status}
                </Badge>
                <Badge className="bg-accent/10 text-accent hover:bg-accent/10 rounded-full">
                  Preflight {design.preflightResult}
                </Badge>
              </div>
              <div className="min-w-0">
                <p className="text-ink-tertiary font-mono text-xs font-semibold tabular-nums">
                  {design.id}
                </p>
                <h2 className="font-display text-ink-primary mt-1 line-clamp-2 text-lg font-bold">
                  {design.name}
                </h2>
                <p className="text-ink-secondary mt-1 text-sm">
                  {design.productName} · {design.variantName} · v{design.version}
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                className="mt-auto min-h-11 w-full rounded-[var(--r-md)]"
              >
                <Link href={STORE_ROUTES.design.detail(design.id)}>Mở editor</Link>
              </Button>
            </div>
          </SurfaceCard>
        ))}
      </section>
    </PageShell>
  );
}
