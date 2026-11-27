import { cn } from "@/lib/cn";
import type { ProductShape } from "@/lib/product-image";

const BODY = "fill-bg-surface stroke-border-strong";
const BAND = "fill-accent/15 stroke-accent";
const MARK = "fill-accent";

/** One drawing per kind, on a 120 × 120 grid, in the theme's tokens (light and dark alike). */
const SHAPES: Record<ProductShape, React.ReactNode> = {
  cup: (
    <>
      <path d="M34 30h52l-7 66a6 6 0 0 1-6 5H47a6 6 0 0 1-6-5Z" className={BODY} />
      <rect x="30" y="22" width="60" height="9" rx="4" className={BODY} />
      <path d="M37.5 50h45l-2.6 28h-39.8Z" className={BAND} />
      <circle cx="60" cy="64" r="7" className={MARK} />
    </>
  ),
  bowl: (
    <>
      <path d="M22 48h76c0 24-16 40-38 40S22 72 22 48Z" className={BODY} />
      <ellipse cx="60" cy="48" rx="38" ry="7" className={BODY} />
      <path d="M27 60h66c-3 9-8 15-14 19H41c-6-4-11-10-14-19Z" className={BAND} />
      <circle cx="60" cy="68" r="6" className={MARK} />
    </>
  ),
  box: (
    <>
      <path d="M60 24 96 40v42L60 98 24 82V40Z" className={BODY} />
      <path d="M24 40 60 56l36-16M60 56v42" className="stroke-border-strong fill-none" />
      <path d="M24 40 60 56 60 98 24 82Z" className={BAND} />
      <path d="M42 30 78 46" className="stroke-accent fill-none" strokeWidth={4} />
      <circle cx="42" cy="70" r="6" className={MARK} />
    </>
  ),
  bag: (
    <>
      <path d="M46 38c0-10 6-16 14-16s14 6 14 16" className="stroke-border-strong fill-none" />
      <path d="M30 36h60l4 62H26Z" className={BODY} />
      <path d="M29 56h62l1.6 24H27.4Z" className={BAND} />
      <circle cx="60" cy="68" r="7" className={MARK} />
    </>
  ),
  generic: (
    <>
      <rect x="28" y="30" width="64" height="62" rx="8" className={BODY} />
      <path d="M28 50h64" className="stroke-border-strong fill-none" />
      <rect x="40" y="62" width="40" height="16" rx="4" className={BAND} />
      <circle cx="60" cy="40" r="5" className={MARK} />
    </>
  ),
};

/**
 * What a product card or gallery shows when the product has no real image (UI/UX 27/11, sf-01): a
 * plain drawing of its kind — cup, bowl, box, bag, or a neutral package — with the brand's blue
 * band where the print goes. Never the SKU on a grey box.
 */
export function ProductIllustration({
  shape,
  className,
}: {
  shape: ProductShape;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center justify-center", className)}>
      <svg
        viewBox="0 0 120 120"
        aria-hidden="true"
        focusable="false"
        className="h-3/5 w-3/5"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {SHAPES[shape]}
      </svg>
      <span className="sr-only">Chưa có ảnh sản phẩm</span>
    </span>
  );
}
