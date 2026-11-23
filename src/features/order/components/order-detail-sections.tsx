import { MapPin } from "lucide-react";

import { LineGoods } from "@/components/storefront/line-goods";
import { formatMoney } from "@/lib/format/money";
import { formatNumber } from "@/lib/format/number";

import { DELIVERY_STATE_LABEL } from "../labels";
import type { Order, OrderAddress, OrderLine } from "../types";
import { LineProduction } from "./line-production";
import { OrderDeliveryFailures } from "./order-delivery-failures";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";

/** "40 thùng (20.000 cái)", the contract's wording; a line without cartons counts pieces. */
export function lineQuantityText(line: Pick<OrderLine, "cartons" | "quantity">): string {
  if (line.cartons == null) return `${formatNumber(line.quantity)} cái`;
  return `${formatNumber(line.cartons)} thùng (${formatNumber(line.quantity)} cái)`;
}

/** "1 mặt hàng · 40 thùng", or pieces when a line has no cartons (an order before 4B-2). */
function linesSummary(lines: readonly OrderLine[]): string {
  const cartons = lines.every((line) => line.cartons != null)
    ? `${formatNumber(lines.reduce((sum, line) => sum + (line.cartons ?? 0), 0))} thùng`
    : `${formatNumber(lines.reduce((sum, line) => sum + line.quantity, 0))} cái`;
  return `${formatNumber(lines.length)} mặt hàng · ${cartons}`;
}

/**
 * The order's lines: the design's thumbnail and name when the BE sends them (R5-3), the SKU, cartons
 * and pieces formatted as the quote and contract say them (SF-UX-31), the price per piece.
 */
export function OrderLinesCard({ order }: { order: Order }) {
  const money = (amount: number) => formatMoney(amount, order.currency);
  return (
    <section className={CARD} aria-labelledby="order-lines-heading">
      <h2
        id="order-lines-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Sản phẩm{" "}
        <span className="text-ink-secondary text-sm font-normal tabular-nums">
          ({linesSummary(order.lines)})
        </span>
      </h2>
      <ul className="divide-border-default mt-1 divide-y">
        {order.lines.map((line) => (
          <li key={line.lineId} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0 space-y-1">
              <LineGoods
                sku={line.sku}
                designName={line.designName}
                previewUrl={line.previewUrl}
                unitsPerCarton={line.unitsPerCarton}
              />
              <p className="text-ink-secondary text-sm tabular-nums">
                {lineQuantityText(line)} × {money(line.unitPrice)}/cái
              </p>
              {line.designSnapshotId && !line.designName ? (
                <p className="text-ink-secondary text-xs font-medium">Có thiết kế riêng</p>
              ) : null}
              <LineProduction line={line} />
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

/**
 * The order total, at the top of the detail aside: "Tổng có VAT", the one name the contract and the
 * payment card use too, with its VAT split shown here once (SF-UX-32).
 */
export function OrderTotalCard({ order }: { order: Order }) {
  const money = (amount: number) => formatMoney(amount, order.currency);
  return (
    <div className={`${CARD} space-y-1`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-secondary">Tổng có VAT</span>
        <span className="font-display text-ink-primary text-xl font-bold tabular-nums">
          {money(order.total)}
        </span>
      </div>
      {order.netAmount != null && order.taxAmount != null ? (
        <p className="text-ink-secondary text-right text-xs tabular-nums">
          Chưa VAT {money(order.netAmount)} · VAT {money(order.taxAmount)}
        </p>
      ) : null}
    </div>
  );
}

const addressLine = (address: OrderAddress) =>
  [address.line1, address.line2, address.wardName, address.provinceName].filter(Boolean).join(", ");

/**
 * Where the order goes and where delivery stands. The customer view carries the shipping address
 * only (no contact or billing block), and NON_NULL omits it when the BE has none. The delivery
 * state is only what staff recorded: nothing is tracked after handover to the carrier. Every order
 * ships as a full truckload, so there is no delivery method to show (SF-UX-33).
 */
export function OrderDeliveryCard({ order }: { order: Order }) {
  const ship = order.shippingAddress;
  if (!ship && !order.deliveryState) return null;

  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="order-delivery-heading">
      <h2
        id="order-delivery-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Giao hàng
      </h2>
      {order.deliveryState ? (
        <p className="text-ink-primary text-sm font-medium">
          {DELIVERY_STATE_LABEL[order.deliveryState]}
        </p>
      ) : null}
      <OrderDeliveryFailures shipments={order.shipments ?? []} />
      {ship ? (
        <div className="flex gap-3">
          <MapPin aria-hidden className="text-ink-tertiary mt-0.5 size-5 shrink-0" />
          <address className="text-sm not-italic">
            <span className="text-ink-primary font-semibold">{ship.recipientName}</span>
            <span className="text-ink-secondary tabular-nums"> · {ship.phone}</span>
            <span className="text-ink-secondary block">{addressLine(ship)}</span>
          </address>
        </div>
      ) : null}
    </section>
  );
}
