import Link from "next/link";
import { RotateCcw } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";

import type { Order } from "../types";

/**
 * "Đặt lại" (kltn-docs 14 §4.1 step 6, WF-02 D4): the customer does not order on the portal, so
 * ordering again opens a conversation with Sales with this order as its context (BE chat C1); Sales
 * draw up a new quote at today's prices. No POST /orders/{id}/reorder — the BE dropped it.
 */
export function OrderReorder({ order }: { order: Pick<Order, "orderId" | "orderNumber"> }) {
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
