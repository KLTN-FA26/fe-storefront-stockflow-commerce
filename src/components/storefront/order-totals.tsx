import { Separator } from "@/components/ui/separator";

import { SurfaceCard } from "@/components/storefront/layout";

interface OrderTotalsProps {
  subtotal: number;
  currency?: string;
  /** Hint under the total, e.g. that the final price is confirmed at checkout. */
  note?: string;
}

/**
 * Subtotal and total. The BE order total is the sum of its lines (kltn-docs 14 BR-08 also names
 * delivery, tax and discount, but the BE has none of them yet), so only those two are shown.
 */
export function OrderTotals({ subtotal, currency = "VND", note }: OrderTotalsProps) {
  const formatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency });

  return (
    <SurfaceCard as="section" className="space-y-3">
      <h2 className="font-display text-ink-primary text-base font-bold sm:text-lg">
        Tổng đơn hàng
      </h2>
      <div className="text-ink-secondary flex items-center justify-between gap-3 text-sm">
        <span>Tạm tính</span>
        <span className="text-ink-primary font-medium tabular-nums">
          {formatter.format(subtotal)}
        </span>
      </div>
      <Separator />
      <div className="text-ink-primary flex items-baseline justify-between gap-3 font-bold">
        <span className="text-base">Tổng cộng</span>
        <span className="text-xl tabular-nums">{formatter.format(subtotal)}</span>
      </div>
      {note ? <p className="text-ink-tertiary text-xs">{note}</p> : null}
    </SurfaceCard>
  );
}
