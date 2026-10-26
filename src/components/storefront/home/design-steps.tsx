import Link from "next/link";
import { ArrowRight, PackageCheck, Palette, ShoppingBag } from "lucide-react";

import { STORE_ROUTES } from "@/constants";

import { SurfaceCard } from "@/components/storefront/layout";

const steps = [
  { title: "Chọn sản phẩm", icon: PackageCheck },
  { title: "Thiết kế & preflight", icon: Palette },
  { title: "Xác nhận & checkout", icon: ShoppingBag },
] as const;

export function DesignSteps() {
  return (
    <SurfaceCard
      as="section"
      className="grid gap-5 lg:grid-cols-[2fr_3fr] lg:items-center lg:gap-8"
    >
      <div className="space-y-2">
        <p className="text-ink-tertiary text-xs font-semibold tracking-wider uppercase">
          Custom design flow
        </p>
        <h2 className="font-display text-ink-primary text-xl font-bold sm:text-2xl">
          Từ ý tưởng đến checkout trong 3 bước.
        </h2>
        <p className="text-ink-secondary text-sm">
          Chọn sản phẩm, tinh chỉnh thiết kế 2D, kiểm tra preflight rồi xác nhận để chuyển sang giỏ
          hàng.
        </p>
        <Link
          href={STORE_ROUTES.design.list}
          className="bg-brand text-ink-inverse hover:bg-brand-hover focus-visible:ring-accent focus-visible:ring-offset-bg-surface mt-2 inline-flex min-h-11 items-center gap-2 rounded-[var(--r-md)] px-5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Bắt đầu thiết kế
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map(({ title, icon: Icon }, index) => (
          <li
            key={title}
            className="bg-bg-subtle border-border-default flex items-center gap-3 rounded-[var(--r-md)] border p-3 sm:flex-col sm:items-start"
          >
            <span className="bg-accent text-ink-inverse flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums">
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:w-full">
              <span className="text-ink-primary text-sm font-semibold">{title}</span>
              <Icon className="text-ink-tertiary size-5 shrink-0" aria-hidden="true" />
            </span>
          </li>
        ))}
      </ol>
    </SurfaceCard>
  );
}
