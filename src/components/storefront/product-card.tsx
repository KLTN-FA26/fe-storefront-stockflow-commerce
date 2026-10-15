import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/cn";

import { Badge } from "@/components/ui/badge";

import { AvailabilityBadge } from "./availability-badge";
import { PriceDisplay } from "./price-display";
import { RatingStars } from "./rating-stars";

interface ProductCardProps {
  href: string;
  name: string;
  imageSrc: string;
  price: number;
  compareAtPrice?: number;
  badge?: string;
  rating?: number;
  reviewCount?: number;
  availability?: "in-stock" | "low-stock" | "out-of-stock";
}

export function ProductCard({
  href,
  name,
  imageSrc,
  price,
  compareAtPrice,
  badge,
  rating,
  reviewCount,
  availability = "in-stock",
}: ProductCardProps) {
  return (
    <Link
      href={href}
      className="group bg-bg-surface border-border-default hover:border-border-strong focus-visible:ring-accent flex h-full flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--sh-sm)] transition-[border-color,box-shadow] duration-200 hover:shadow-[var(--sh-md)] focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="bg-bg-subtle relative aspect-square overflow-hidden">
        <Image
          src={imageSrc}
          alt={name}
          fill
          sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw"
          className={cn(
            "object-contain p-6 transition-transform duration-300 group-hover:scale-105 sm:p-8",
            availability === "out-of-stock" && "opacity-60",
          )}
        />
        {badge ? <Badge className="absolute top-2 left-2 rounded-full">{badge}</Badge> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="text-ink-primary group-hover:text-accent line-clamp-2 text-sm font-medium transition-colors">
          {name}
        </h3>
        <AvailabilityBadge status={availability} />
        {typeof rating === "number" ? <RatingStars rating={rating} count={reviewCount} /> : null}
        <div className="mt-auto pt-1">
          <PriceDisplay price={price} compareAtPrice={compareAtPrice} size="sm" />
        </div>
      </div>
    </Link>
  );
}
