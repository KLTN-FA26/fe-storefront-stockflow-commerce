import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/cn";
import { isRemoteImage } from "@/lib/remote-image";

import { AvailabilityBadge } from "./availability-badge";
import { PriceDisplay } from "./price-display";

export interface ProductCardProps {
  href: string;
  name: string;
  imageSrc?: string | undefined;
  imageAlt?: string | undefined;
  /** The customer's unit price; absent while loading or when the product has no price for them. */
  price?: number | undefined;
  priceLabel?: string | undefined;
  availability?: "in-stock" | "low-stock" | "out-of-stock" | undefined;
}

export function ProductCard({
  href,
  name,
  imageSrc,
  imageAlt,
  price,
  priceLabel,
  availability,
}: ProductCardProps) {
  return (
    <Link
      href={href}
      className="group bg-bg-surface border-border-default hover:border-border-strong focus-visible:ring-accent flex h-full flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--sh-sm)] transition-[border-color,box-shadow] duration-200 hover:shadow-[var(--sh-md)] focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="bg-bg-subtle relative aspect-square overflow-hidden">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={imageAlt ?? name}
            fill
            unoptimized={isRemoteImage(imageSrc)}
            sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw"
            className={cn(
              "object-contain p-6 transition-transform duration-300 group-hover:scale-105 sm:p-8",
              availability === "out-of-stock" && "opacity-60",
            )}
          />
        ) : (
          <span className="text-ink-tertiary absolute inset-0 flex items-center justify-center">
            <ImageOff className="size-8" aria-hidden="true" />
            <span className="sr-only">Chưa có hình ảnh</span>
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="text-ink-primary group-hover:text-accent line-clamp-2 text-sm font-medium transition-colors">
          {name}
        </h3>
        {availability ? <AvailabilityBadge status={availability} /> : null}
        <div className="mt-auto pt-1">
          {typeof price === "number" ? (
            <>
              {priceLabel ? <span className="text-ink-tertiary text-xs">{priceLabel} </span> : null}
              <PriceDisplay price={price} size="sm" />
            </>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
