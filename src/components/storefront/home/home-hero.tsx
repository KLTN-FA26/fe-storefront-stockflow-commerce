import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Gift, Palette, type LucideIcon } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

const heroFocus =
  "focus-visible:ring-ink-inverse focus-visible:ring-offset-brand focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";
const heroCta =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--r-md)] px-5 text-sm font-semibold transition-colors";

type SideBanner = {
  href: string;
  title: string;
  desc: string;
  cta: string;
  icon: LucideIcon;
  tone: "accent" | "surface";
};

const sideBanners: SideBanner[] = [
  {
    href: STORE_ROUTES.design.list,
    title: "Tự thiết kế sản phẩm",
    desc: "Tải logo, căn vùng in và kiểm tra preflight trước khi đặt.",
    cta: "Thiết kế ngay",
    icon: Palette,
    tone: "accent",
  },
  {
    href: STORE_ROUTES.catalog.list,
    title: "Quà doanh nghiệp",
    desc: "In logo số lượng lớn cho sự kiện, hội nghị, đồng phục team.",
    cta: "Xem quà tặng",
    icon: Gift,
    tone: "surface",
  },
];

export function HomeHero() {
  return (
    <section aria-labelledby="home-hero-title" className="grid gap-3 sm:gap-4 lg:grid-cols-3">
      <div className="bg-brand text-ink-inverse relative overflow-hidden rounded-[var(--r-xl)] p-5 sm:p-8 lg:col-span-2 lg:p-10">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div className="max-w-xl space-y-3 sm:space-y-4">
            <p className="text-ink-inverse/70 text-xs font-semibold tracking-wider uppercase">
              StockFlow Storefront
            </p>
            <h1
              id="home-hero-title"
              className="font-display text-2xl leading-tight font-bold tracking-tight sm:text-4xl"
            >
              Mua sắm, tùy biến thiết kế và theo dõi đơn in ấn trong một trải nghiệm TMĐT.
            </h1>
            <p className="text-ink-inverse/80 text-sm sm:text-base">
              Catalog, editor thiết kế, giỏ hàng và thanh toán — tối ưu cho khách mua lẻ và doanh
              nghiệp.
            </p>
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:gap-3 sm:pt-2">
              <Link
                href={STORE_ROUTES.catalog.list}
                className={cn(
                  heroCta,
                  heroFocus,
                  "bg-bg-surface text-ink-primary hover:bg-bg-muted",
                )}
              >
                Khám phá sản phẩm
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href={STORE_ROUTES.design.list}
                className={cn(
                  heroCta,
                  heroFocus,
                  "border-ink-inverse/30 hover:bg-ink-inverse/10 border",
                )}
              >
                Mở thiết kế của tôi
              </Link>
            </div>
          </div>
          <div className="bg-bg-surface text-ink-primary hidden w-56 rounded-[var(--r-lg)] p-3 md:block lg:w-60">
            <div className="bg-bg-subtle relative aspect-square overflow-hidden rounded-[var(--r-md)]">
              <Image src="/logo.png" alt="" fill sizes="240px" className="object-contain p-6" />
            </div>
            <p className="text-accent mt-3 text-xs font-semibold">Đang bán chạy</p>
            <p className="font-display text-sm font-bold">Áo thun cotton premium</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-1">
        {sideBanners.map(({ href, title, desc, cta, icon: Icon, tone }) => (
          <Link
            key={title}
            href={href}
            className={cn(
              "group focus-visible:ring-accent flex items-center justify-between gap-4 rounded-[var(--r-xl)] border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:p-6",
              tone === "accent"
                ? "bg-accent/10 border-accent/20 hover:border-accent/50"
                : "bg-bg-surface border-border-default hover:border-border-strong",
            )}
          >
            <div className="min-w-0 space-y-1">
              <h2 className="font-display text-ink-primary text-base font-bold sm:text-xl">
                {title}
              </h2>
              <p className="text-ink-secondary text-xs sm:text-sm">{desc}</p>
              <span className="text-accent inline-flex items-center gap-1 pt-1 text-xs font-semibold group-hover:underline sm:text-sm">
                {cta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </div>
            <span className="bg-bg-surface text-accent hidden size-14 shrink-0 items-center justify-center rounded-[var(--r-lg)] shadow-[var(--sh-sm)] sm:flex">
              <Icon className="size-7" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
