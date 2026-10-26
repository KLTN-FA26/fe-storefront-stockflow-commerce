"use client";

import Image from "next/image";

import { useCatalogGallery } from "@/features/catalog/queries";
import { isRemoteImage } from "@/lib/remote-image";

/**
 * The product's catalogue photo beside the studio's flat preview: the photo of the design's SKU,
 * else the primary one. Nothing while the gallery loads or when it has no photo.
 */
export function ProductPhoto({ slug, sku }: { slug: string; sku: string | null | undefined }) {
  const gallery = useCatalogGallery(slug);
  const images = gallery.data?.images ?? [];
  const photo =
    images.find((image) => sku && image.sku === sku) ??
    images.find((image) => image.primary) ??
    images[0];
  if (!photo) return null;

  return (
    <figure className="bg-bg-subtle border-border-default relative aspect-square w-28 shrink-0 self-start overflow-hidden rounded-[var(--r-md)] border">
      <Image
        src={photo.url}
        alt={photo.altText ?? "Ảnh sản phẩm"}
        fill
        unoptimized={isRemoteImage(photo.url)}
        sizes="112px"
        className="object-cover"
      />
    </figure>
  );
}
