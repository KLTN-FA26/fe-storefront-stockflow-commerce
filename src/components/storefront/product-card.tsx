import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { productShapeOf, realImage } from "@/lib/product-image";
import { isRemoteImage } from "@/lib/remote-image";

import { AvailabilityBadge } from "./availability-badge";
import { ProductIllustration } from "./product-illustration";

export interface ProductCardProps {
  href: string;
  name: string;
  imageSrc?: string | undefined;
  imageAlt?: string | undefined;
  availability?: "in-stock" | "low-stock" | "out-of-stock" | undefined;
}

export function ProductCard({ href, name, imageSrc, imageAlt, availability }: ProductCardProps) {
  // A placeholder service's grey box with the SKU on it counts as no image (sf-01).
  const src = realImage(imageSrc);
  return (
    <Link
      href={href}
      className="group bg-bg-surface border-border-default hover:border-border-strong focus-visible:ring-accent flex h-full flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--sh-sm)] transition-[border-color,box-shadow] duration-200 hover:shadow-[var(--sh-md)] focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="bg-bg-subtle relative aspect-square overflow-hidden">
        {src ? (
          <Image
            src={src}
            alt={imageAlt ?? name}
            fill
            unoptimized={isRemoteImage(src)}
            sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw"
            className={cn(
              "object-contain p-6 transition-transform duration-300 group-hover:scale-105 sm:p-8",
              availability === "out-of-stock" && "opacity-60",
            )}
          />
        ) : (
          <ProductIllustration
            shape={productShapeOf(name)}
            className={cn("absolute inset-0", availability === "out-of-stock" && "opacity-60")}
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="text-ink-primary group-hover:text-accent line-clamp-2 text-sm font-medium transition-colors">
          {name}
        </h3>
        {availability ? <AvailabilityBadge status={availability} /> : null}
      </div>
    </Link>
  );
}
