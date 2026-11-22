import { TriangleAlert } from "lucide-react";

import { DELIVERY_FAILURE_REASON_LABEL } from "@/lib/domain/delivery-labels";
import { formatDateTime } from "@/lib/format/date";

import type { OrderShipment } from "../types";

/**
 * The deliveries that failed and why (BE CustomerOrderShipment.failureReason, kltn-docs 09 BR-05).
 * The reason stays on a shipment a retry then delivered, so that one says it arrived after all.
 * Never the note staff wrote: only the reason code reaches the customer.
 */
export function OrderDeliveryFailures({ shipments }: { shipments: readonly OrderShipment[] }) {
  const failed = shipments
    .map((shipment, index) => ({ shipment, index }))
    .filter(({ shipment }) => shipment.failureReason);
  if (failed.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Lần giao không thành công">
      {failed.map(({ shipment, index }) => {
        const reason = shipment.failureReason ?? "UNKNOWN";
        const redelivered = shipment.status === "DELIVERED";
        return (
          <li
            key={shipment.shipmentId ?? index}
            className="border-border-default bg-bg-subtle flex gap-2 rounded-[var(--r-md)] border p-3 text-sm"
          >
            <TriangleAlert aria-hidden className="text-warning mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-ink-primary font-medium">
                Lần giao {index + 1}
                {shipment.shipmentCode ? (
                  <span className="text-ink-secondary ml-1 font-mono text-xs">
                    {shipment.shipmentCode}
                  </span>
                ) : null}
                {redelivered ? " — đã giao lại thành công" : " — giao không thành công"}
              </p>
              <p className="text-ink-secondary">
                Lý do: {DELIVERY_FAILURE_REASON_LABEL[reason]}
                {!redelivered && shipment.outcomeAt
                  ? ` · ${formatDateTime(shipment.outcomeAt)}`
                  : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
