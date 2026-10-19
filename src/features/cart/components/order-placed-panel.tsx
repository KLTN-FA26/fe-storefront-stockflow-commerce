import Link from "next/link";
import { CircleCheck } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/storefront/layout";
import { formatMoney } from "@/lib/format/money";

import { describePlacedStatus } from "../checkout-errors";
import type { PlacedOrder } from "../checkout-schemas";

/** Shown in place of the checkout once POST /orders succeeded (the cart is already empty). */
export function OrderPlacedPanel({ order }: { order: PlacedOrder }) {
  const { title, description } = describePlacedStatus(order.status);
  return (
    <SurfaceCard className="mx-auto max-w-xl space-y-4 text-center">
      <CircleCheck aria-hidden className="text-positive mx-auto size-10" />
      <div role="status" className="space-y-1">
        <h2 className="font-display text-ink-primary text-xl font-bold">{title}</h2>
        <p className="text-ink-secondary text-sm">{description}</p>
      </div>
      <dl className="border-border-default grid gap-2 border-y py-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-secondary">Mã đơn</dt>
          <dd className="text-ink-primary font-mono font-semibold tabular-nums">
            {order.orderNumber}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-secondary">Tổng cộng</dt>
          <dd className="text-ink-primary font-semibold tabular-nums">
            {formatMoney(order.totalAmount, order.currency)}
          </dd>
        </div>
      </dl>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={STORE_ROUTES.account.orders.detail(order.orderId)}>Xem đơn hàng</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={STORE_ROUTES.catalog.list}>Tiếp tục mua sắm</Link>
        </Button>
      </div>
    </SurfaceCard>
  );
}
