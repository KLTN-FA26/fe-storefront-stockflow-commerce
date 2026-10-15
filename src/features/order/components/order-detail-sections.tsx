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
        {formatMoney(order.totalAmount, order.currency)}
      </span>
    </div>
  );
}

const addressLine = (address: OrderAddress) =>
  [address.line1, address.line2, address.wardName, address.provinceName].filter(Boolean).join(", ");

const sameAddress = (a: OrderAddress, b: OrderAddress) =>
  a.recipientName === b.recipientName && a.phone === b.phone && addressLine(a) === addressLine(b);

// The profile and the address book may store one number as "+84 908…" and "0908…".
const phoneKey = (phone: string) => phone.replace(/\D/g, "").replace(/^84/, "0");
const nameKey = (name: string) => name.trim().toLocaleLowerCase("vi");

/**
 * BE OrderServiceImpl.placeOrder takes the contact from the customer profile and the recipient
 * from the chosen address-book entry, so an order sent to someone else carries two people.
 */
function contactDiffersFromRecipient(order: Order, ship: OrderAddress): boolean {
  const { contactName, contactPhone } = order;
  return (
    (!!contactName && nameKey(contactName) !== nameKey(ship.recipientName)) ||
    (!!contactPhone && phoneKey(contactPhone) !== phoneKey(ship.phone))
  );
}

/**
 * Where the order goes. Shown only for what the BE returned (NON_NULL omits missing fields); the
 * contact and the billing address appear only when they differ from the recipient / shipping.
 */
export function OrderDeliveryCard({ order }: { order: Order }) {
  const { shippingAddress: ship, billingAddress: bill } = order;
  const email = order.contactEmail;
  const contact = [order.contactName, order.contactPhone].filter(Boolean).join(" · ");
  if (!ship && !bill && !contact && !email) return null;
  const showContact = !!contact && (!ship || contactDiffersFromRecipient(order, ship));

  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="order-delivery-heading">
      <h2
        id="order-delivery-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Giao đến
      </h2>
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
      {(showContact || email) && (
        <div className={ship ? "border-border-default border-t pt-4 text-sm" : "text-sm"}>
          {showContact && (
            <>
              <h3 className="text-ink-secondary font-semibold">Người đặt hàng</h3>
              <p className="text-ink-primary mt-1 tabular-nums">{contact}</p>
            </>
          )}
          {email && (
            <p className="text-ink-secondary mt-1 break-words">Email nhận thông báo: {email}</p>
          )}
        </div>
      )}
      {bill && (!ship || !sameAddress(ship, bill)) && (
        <div className="border-border-default border-t pt-4 text-sm">
          <h3 className="text-ink-secondary font-semibold">Địa chỉ thanh toán</h3>
          <p className="text-ink-primary mt-1">
            {bill.recipientName} · <span className="tabular-nums">{bill.phone}</span>
          </p>
          <p className="text-ink-secondary">{addressLine(bill)}</p>
        </div>
      )}
    </section>
  );
}
