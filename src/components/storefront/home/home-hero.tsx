import Link from "next/link";
import { Check } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

import { HeroShowcase } from "./hero-showcase";

const focusRing =
  "focus-visible:ring-accent focus-visible:ring-offset-bg-subtle focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";
const cta =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--r-md)] px-6 text-[0.9375rem] font-semibold transition-colors";

/** What a shop gets, in the order it meets them: design it, get a quote, pay by contract. */
const promises = [
  "Tự đặt logo, xem trước 2D và 3D",
  "Báo giá theo số thùng",
  "Thanh toán chuyển khoản theo đợt",
] as const;

/**
 * The home page's opening band, edge to edge (not a card in the page column): what the shop sells and the two ways in,
 * next to the packaging it prints. The page composes it above the page shell so the band can span the screen.
 */
export function HomeHero() {
  return (
    <section
      aria-labelledby="home-hero-title"
      className="bg-bg-subtle border-border-default border-b"
    >
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 md:grid-cols-2 lg:gap-16 lg:px-8 lg:py-16">
        <div className="max-w-xl space-y-6">
          <div className="space-y-4">
            <h1
              id="home-hero-title"
              className="font-display text-ink-primary text-3xl leading-[1.1] font-bold tracking-tight text-balance sm:text-5xl"
            >
              Bao bì in logo cho quán của bạn
            </h1>
            <p className="text-ink-secondary max-w-[56ch] text-base sm:text-lg">
              Ly giấy, tô và túi giấy in theo thiết kế của bạn. Đặt logo trên mẫu, gửi duyệt, rồi
              nhận báo giá từ Sale.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={STORE_ROUTES.design.list}
              className={cn(cta, focusRing, "bg-brand text-ink-inverse hover:bg-brand-hover")}
            >
              Bắt đầu thiết kế
            </Link>
            <Link
              href={STORE_ROUTES.catalog.list}
              className={cn(
                cta,
                focusRing,
                "border-border-strong text-ink-primary hover:bg-bg-subtle border bg-transparent",
              )}
            >
              Xem sản phẩm
            </Link>
          </div>
          <ul className="text-ink-secondary flex flex-col gap-2 text-sm">
            {promises.map((promise) => (
              <li key={promise} className="flex items-center gap-2">
                <Check className="text-accent size-4 shrink-0" aria-hidden="true" />
                {promise}
              </li>
            ))}
          </ul>
        </div>
        <HeroShowcase />
      </div>
    </section>
  );
}
