import { Badge } from "@/components/ui/badge";

interface PriceDisplayProps {
  price: number;
  compareAtPrice?: number | undefined;
  currency?: string | undefined;
  size?: "sm" | "md" | "lg";
}

const sizeClass = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
} as const;

export function PriceDisplay({ price, compareAtPrice, currency = "VND", size = "md" }: PriceDisplayProps) {
  const formatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency });
  const discount = compareAtPrice && compareAtPrice > price ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`font-display font-bold tabular-nums text-ink-primary ${sizeClass[size]}`}>
        {formatter.format(price)}
      </span>
      {compareAtPrice && compareAtPrice > price && (
        <>
          <span className="text-sm text-ink-tertiary line-through tabular-nums">{formatter.format(compareAtPrice)}</span>
          <Badge variant="secondary" className="rounded-full text-danger">-{discount}%</Badge>
        </>
      )}
    </div>
  );
}
