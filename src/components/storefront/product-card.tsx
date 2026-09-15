import Image from "next/image";
import Link from "next/link";

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

export function ProductCard({ href, name, imageSrc, price, compareAtPrice, badge, rating, reviewCount, availability = "in-stock" }: ProductCardProps) {
  return (
    <Link href={href} className="group block rounded-xl bg-bg-surface p-3 shadow-md transition duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-bg-subtle">
        <Image src={imageSrc} alt={name} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover transition duration-300 group-hover:scale-105" />
        {badge && <Badge className="absolute left-3 top-3 rounded-full">{badge}</Badge>}
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold text-ink-primary">{name}</h3>
          <AvailabilityBadge status={availability} />
        </div>
        {typeof rating === "number" && <RatingStars rating={rating} count={reviewCount} />}
        <PriceDisplay price={price} compareAtPrice={compareAtPrice} size="sm" />
      </div>
    </Link>
  );
}
