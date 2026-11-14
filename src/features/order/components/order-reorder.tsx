import Link from "next/link";
import { RotateCcw } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";

import type { Order } from "../types";

/**
 * "Đặt lại" (kltn-docs 13 §3 step 3, BR-08): the customer does not order on the portal, so ordering
 * again opens a conversation with Sales about this order; Sales draw up a new quote at today's
 * prices. Nothing is put in a basket — there is none.
 */
export function OrderReorder({ order }: { order: Pick<Order, "orderNumber"> }) {
  return (
    <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
      <Link
        href={STORE_ROUTES.chat.list}
        aria-label={`Đặt lại đơn ${order.orderNumber}: chat với Sale để nhận báo giá mới`}
      >
        <RotateCcw aria-hidden className="mr-2 size-4" />
        Đặt lại
      </Link>
    </Button>
  );
}
