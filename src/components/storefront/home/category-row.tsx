import Link from "next/link";
import { BadgeCheck, ChevronRight, PackageCheck, Palette, Sparkles } from "lucide-react";

import { STORE_ROUTES } from "@/constants";

import { Section } from "@/components/storefront/layout";

const categories = [
  {
    title: "Áo & hoodie",
    desc: "Cotton, teamwear, áo sự kiện",
    icon: PackageCheck,
    href: STORE_ROUTES.catalog.list,
  },
  {
    title: "Quà tặng in ấn",
    desc: "Cốc, bình, túi canvas",
    icon: Sparkles,
    href: STORE_ROUTES.catalog.list,
  },
  {
    title: "Ấn phẩm doanh nghiệp",
    desc: "Name card, poster, sticker",
    icon: BadgeCheck,
    href: STORE_ROUTES.catalog.list,
  },
  {
    title: "Thiết kế riêng",
    desc: "Editor 2D + preflight",
    icon: Palette,
    href: STORE_ROUTES.design.list,
  },
] as const;

export function CategoryRow() {
  return (
    <Section title="Mua theo danh mục">
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
        {categories.map(({ title, desc, icon: Icon, href }) => (
          <li key={title} className="w-60 shrink-0 snap-start lg:w-auto">
            <Link
              href={href}
              className="group bg-bg-surface border-border-default hover:border-border-strong focus-visible:ring-accent flex h-full min-h-11 items-center gap-3 rounded-[var(--r-lg)] border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
            >
              <span className="bg-accent/10 text-accent flex size-12 shrink-0 items-center justify-center rounded-[var(--r-md)]">
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink-primary group-hover:text-accent block text-sm font-semibold transition-colors">
                  {title}
                </span>
                <span className="text-ink-secondary block truncate text-xs">{desc}</span>
              </span>
              <ChevronRight
                className="text-ink-tertiary size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
