import { cn } from "@/lib/cn";
import type { PricingTier } from "@/lib/domain/quote-pricing";
import { formatMoney } from "@/lib/format/money";
import { formatNumber } from "@/lib/format/number";

/**
 * A quote line's price breaks (from N cartons, VND per piece), the one that applies marked. The lowest break is the
 * MOQ (14 BR-07). Shared by the quote page and the chat's acceptance dialog, so both show the same tiers (SF-UX-21).
 */
export function PriceTierList({
  tiers,
  applied,
}: {
  tiers: readonly PricingTier[];
  applied: PricingTier | null;
}) {
  if (tiers.length === 0) return <p className="text-ink-tertiary text-sm">Chưa có bậc giá</p>;
  const sorted = [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Bậc giá">
      {sorted.map((tier) => {
        const isApplied = applied?.minQuantity === tier.minQuantity;
        return (
          <li
            key={tier.minQuantity}
            aria-current={isApplied ? "true" : undefined}
            className={cn(
              "rounded-[var(--r-sm)] border px-2 py-1 text-xs tabular-nums",
              isApplied
                ? "border-accent bg-accent/10 text-ink-primary font-semibold"
                : "border-border-default text-ink-secondary",
            )}
          >
            Từ {formatNumber(tier.minQuantity)} thùng: {formatMoney(tier.unitPrice)}/cái
            {isApplied ? <span className="sr-only"> (đang áp dụng)</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
