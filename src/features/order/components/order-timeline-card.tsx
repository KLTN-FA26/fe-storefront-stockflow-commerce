import { OrderTimeline } from "@/components/storefront/order-timeline";
import { formatDateTime } from "@/lib/format/date";

import { ORDER_STATUS_GROUP_META } from "../lifecycle";
import { CANCELLATION_REASON_LABEL } from "../labels";
import { customerTimeline } from "../selectors";
import type { Order } from "../types";

/** The order's history, oldest first, in the customer's wording (one step per status group). */
export function OrderTimelineCard({ order }: { order: Order }) {
  const steps = customerTimeline(order.timeline);
  if (steps.length === 0) return null;
  return (
    <section aria-labelledby="order-timeline-heading" className="space-y-3">
      <h2
        id="order-timeline-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Lịch sử đơn hàng
      </h2>
      <OrderTimeline
        items={steps.map((step, index) => ({
          id: `${step.statusGroup}-${step.occurredAt}-${index}`,
          label: ORDER_STATUS_GROUP_META[step.statusGroup].label,
          time: formatDateTime(step.occurredAt),
          completed: true,
          ...(step.reasonCode
            ? { description: `Lý do: ${CANCELLATION_REASON_LABEL[step.reasonCode]}` }
            : {}),
        }))}
      />
    </section>
  );
}
