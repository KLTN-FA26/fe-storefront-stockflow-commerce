import Link from "next/link";
import { RotateCcw } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";

import { displayGroup, type OrderDisplayGroup } from "../lifecycle";
import type { Order } from "../types";

const GOODS_ARRIVED: ReadonlySet<OrderDisplayGroup> = new Set<OrderDisplayGroup>([
  "DELIVERED",
  "COMPLETED",
  "CLOSED",
  "PARTIALLY_RETURNED",
]);

/**
 * "Đặt lại" (kltn-docs 14 §4.1 step 6, WF-02 D4): the customer does not order on the portal, so
 * ordering again opens a conversation with Sales with this order as its context (BE chat C1); Sales
 * draw up a new quote at today's prices. No POST /orders/{id}/reorder — the BE dropped it. Offered
 * only once the goods arrived (SF-UX-35): before that it is noise beside the order's own next step.
 */
export function OrderReorder({
  order,
}: {
  order: Pick<Order, "orderId" | "orderNumber" | "status" | "statusGroup">;
}) {
  const group = displayGroup(order);
  // Goods reached the customer: delivered, completed, closed after completion, or partly kept.
  if (!GOODS_ARRIVED.has(group)) return null;
  return (
    <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
      <Link
        href={STORE_ROUTES.chat.about("ORDER", order.orderId)}
        aria-label={`Đặt lại đơn ${order.orderNumber}: chat với Sale để nhận báo giá mới`}
      >
        <RotateCcw aria-hidden className="mr-2 size-4" />
        Đặt lại
      </Link>
    </Button>
  );
}
