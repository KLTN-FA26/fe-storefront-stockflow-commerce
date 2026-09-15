import { Separator } from "@/components/ui/separator";

interface OrderTotalsProps {
  subtotal: number;
  shipping: number;
  tax: number;
  discount?: number;
  currency?: string;
}

export function OrderTotals({ subtotal, shipping, tax, discount = 0, currency = "VND" }: OrderTotalsProps) {
  const formatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency });
  const total = subtotal + shipping + tax - discount;
  const rows = [
    ["Tạm tính", subtotal],
    ["Vận chuyển", shipping],
    ["Thuế", tax],
    ["Giảm giá", -discount],
  ] as const;

  return (
    <section className="space-y-3 rounded-xl bg-bg-surface p-[var(--card-pad)] shadow-md">
      <h2 className="font-display text-lg font-semibold">Tổng đơn hàng</h2>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between text-sm text-ink-secondary">
          <span>{label}</span>
          <span className="font-medium tabular-nums text-ink-primary">{formatter.format(value)}</span>
        </div>
      ))}
      <Separator />
      <div className="flex items-center justify-between text-base font-bold">
        <span>Thanh toán</span>
        <span className="tabular-nums">{formatter.format(total)}</span>
      </div>
    </section>
  );
}
