import Image from "next/image";
import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format/number";
import { isRemoteImage } from "@/lib/remote-image";

interface LineGoodsProps {
  sku: string;
  /** The design printed on the goods (BE R5-3 `designName`); absent on an older BE. */
  designName?: string | null | undefined;
  /** A short-lived signed URL of the design's preview image; absent or null when there is none. */
  previewUrl?: string | null | undefined;
  /** Pieces in one carton of this SKU. */
  unitsPerCarton?: number | null | undefined;
  /** "Dòng 2 · " and the like, before the name. */
  prefix?: string | undefined;
  className?: string | undefined;
}

/**
 * What a quote, contract or order line is, in the customer's terms (SF-UX-16): the design's
 * thumbnail and name when the BE sends them, the SKU, and "500 cái/thùng". The studio is desktop
 * only, so the thumbnail opens the preview image itself — readable on a phone — not the studio.
 */
export function LineGoods({
  sku,
  designName,
  previewUrl,
  unitsPerCarton,
  prefix,
  className,
}: LineGoodsProps) {
  const name = designName?.trim();
  return (
    <div className={cn("flex min-w-0 items-start gap-3", className)}>
      {previewUrl ? (
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Xem ảnh thiết kế ${name ?? sku} (mở tab mới)`}
          className="border-border-default bg-bg-subtle focus-visible:ring-accent relative block size-12 shrink-0 overflow-hidden rounded-[var(--r-md)] border focus-visible:ring-2 focus-visible:outline-none"
        >
          <Image
            src={previewUrl}
            alt=""
            fill
            sizes="48px"
            className="object-cover"
            unoptimized={isRemoteImage(previewUrl)}
          />
        </a>
      ) : name ? (
        <span
          aria-hidden
          className="border-border-default bg-bg-subtle text-ink-tertiary flex size-12 shrink-0 items-center justify-center rounded-[var(--r-md)] border"
        >
          <ImageIcon className="size-5" />
        </span>
      ) : null}
      <div className="min-w-0 text-sm">
        <p className="text-ink-primary">
          {prefix ? <span className="text-ink-tertiary">{prefix}</span> : null}
          {name ? (
            <span className="font-semibold break-words">{name}</span>
          ) : (
            <span className="font-mono font-semibold break-all">{sku}</span>
          )}
        </p>
        {name || unitsPerCarton ? (
          <p className="text-ink-secondary text-xs tabular-nums">
            {name ? <span className="font-mono break-all">{sku}</span> : null}
            {name && unitsPerCarton ? " · " : null}
            {unitsPerCarton ? `${formatNumber(unitsPerCarton)} cái/thùng` : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
