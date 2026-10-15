import { Separator } from "@/components/ui/separator";

import { SurfaceCard } from "@/components/storefront/layout";

interface OrderTotalsProps {
  subtotal: number;
  shipping: number;
  tax: number;
  discount?: number;
  currency?: string;
}

export function OrderTotals({
  subtotal,
  shipping,
  tax,
  discount = 0,
  currency = "VND",
}: OrderTotalsProps) {
  const formatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency });
  const total = subtotal + shipping + tax - discount;
  const rows = [
    ["Tạm tính", subtotal],
    ["Vận chuyển", shipping],
    ["Thuế", tax],
    ["Giảm giá", -discount],
  ] as const;

  return (
    <SurfaceCard as="section" className="space-y-3">
      <h2 className="font-display text-ink-primary text-base font-bold sm:text-lg">
        Tổng đơn hàng
      </h2>
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="text-ink-secondary flex items-center justify-between gap-3 text-sm"
        >
          <span>{label}</span>
          <span className="text-ink-primary font-medium tabular-nums">
            {formatter.format(value)}
          </span>
        </div>
      ))}
      <Separator />
      <div className="text-ink-primary flex items-baseline justify-between gap-3 font-bold">
        <span className="text-base">Thanh toán</span>
        <span className="text-xl tabular-nums">{formatter.format(total)}</span>
      </div>
    </SurfaceCard>
  );
}
