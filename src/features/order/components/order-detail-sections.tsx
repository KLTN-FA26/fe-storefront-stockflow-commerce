import { MapPin } from "lucide-react";

import { formatMoney } from "@/lib/format/money";

import type { Order, OrderAddress } from "../types";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";

/**
 * BE order lines carry SKU, quantity and prices only — no product name or image yet — so the SKU
 * is the line title until the BE exposes product details.
 */
export function OrderLinesCard({ order }: { order: Order }) {
  const money = (amount: number) => formatMoney(amount, order.currency);
  const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <section className={CARD} aria-labelledby="order-lines-heading">
      <h2
        id="order-lines-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Sản phẩm{" "}
        <span className="text-ink-secondary text-sm font-normal tabular-nums">
          ({order.lines.length} mặt hàng · {units} sản phẩm)
        </span>
      </h2>
      <ul className="divide-border-default mt-1 divide-y">
        {order.lines.map((line) => (
          <li key={line.lineId} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-ink-primary font-mono text-sm font-semibold break-all">
                {line.sku}
              </p>
              <p className="text-ink-secondary mt-1 text-sm tabular-nums">
                {money(line.unitPrice)} × {line.quantity}
              </p>
              {line.designSnapshotId && (
                <p className="text-accent mt-1 text-xs font-medium">Có thiết kế riêng</p>
              )}
            </div>
            <p className="text-ink-primary shrink-0 font-semibold tabular-nums">
              {money(line.lineTotal)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The order total, shown as the payment summary at the top of the detail aside. */
export function OrderTotalCard({ order }: { order: Order }) {
  return (
    <div className={`${CARD} flex items-baseline justify-between gap-3`}>
      <span className="text-ink-secondary">Tổng cộng</span>
      <span className="font-display text-ink-primary text-xl font-bold tabular-nums">
        {formatMoney(order.total, order.currency)}
      </span>
    </div>
  );
}

const addressLine = (address: OrderAddress) =>
  [address.line1, address.line2, address.wardName, address.provinceName].filter(Boolean).join(", ");

/**
 * Where the order goes. The customer view carries the shipping address only (no contact or
 * billing block), and NON_NULL omits it when the BE has none.
 */
export function OrderDeliveryCard({ order }: { order: Order }) {
  const ship = order.shippingAddress;
  if (!ship) return null;

  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="order-delivery-heading">
      <h2
        id="order-delivery-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Giao đến
      </h2>
      <div className="flex gap-3">
        <MapPin aria-hidden className="text-ink-tertiary mt-0.5 size-5 shrink-0" />
        <address className="text-sm not-italic">
          <span className="text-ink-primary font-semibold">{ship.recipientName}</span>
          <span className="text-ink-secondary tabular-nums"> · {ship.phone}</span>
          <span className="text-ink-secondary block">{addressLine(ship)}</span>
        </address>
      </div>
    </section>
  );
}
