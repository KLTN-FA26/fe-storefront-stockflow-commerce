"use client";

import { Truck } from "lucide-react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatDate } from "@/lib/format/date";
import type { ReturnableShipment } from "@/lib/returns";

const lastDay = (shipment: ReturnableShipment) =>
  formatDate(new Date(shipment.windowEnd.getTime() - 1).toISOString());

/**
 * Chọn lần giao có hàng muốn trả (WF-05 TH-1): đơn giao làm nhiều lần thì mỗi yêu cầu trả hàng gắn
 * với một lần giao đã đến, và hạn đổi / trả tính từ ngày giao của lần đó. Lần đã quá hạn hiện để
 * khách hiểu, nhưng không chọn được.
 */
export function ReturnShipmentPicker({
  shipments,
  value,
  onChange,
  error,
  disabled,
}: {
  shipments: readonly ReturnableShipment[];
  value: string | undefined;
  onChange: (shipmentId: string) => void;
  error: string | undefined;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <RadioGroup
        value={value ?? ""}
        onValueChange={onChange}
        aria-label="Lần giao có hàng muốn trả"
        className="gap-2"
        disabled={disabled}
      >
        {shipments.map((shipment, index) => {
          const id = shipment.shipmentId ?? "";
          const htmlId = `return-shipment-${index}`;
          return (
            <Label
              key={id || index}
              htmlFor={htmlId}
              className="border-border-default has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-bg-muted flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--r-md)] border p-3 text-sm font-normal has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
            >
              <RadioGroupItem
                id={htmlId}
                value={id}
                disabled={!shipment.windowOpen}
                className="mt-0.5"
              />
              <span className="min-w-0 space-y-0.5">
                <span className="text-ink-primary flex items-center gap-1.5 font-medium">
                  <Truck aria-hidden className="text-ink-tertiary size-4" />
                  Lần giao {index + 1}
                  {shipment.shipmentCode ? (
                    <span className="text-ink-secondary font-mono text-xs">
                      {shipment.shipmentCode}
                    </span>
                  ) : null}
                </span>
                <span className="text-ink-secondary block tabular-nums">
                  Đã giao ngày {formatDate(shipment.deliveredAt)}
                </span>
                <span className="text-ink-tertiary block text-xs">
                  {shipment.windowOpen
                    ? `Đổi / trả đến hết ngày ${lastDay(shipment)}`
                    : "Đã quá hạn đổi / trả"}
                </span>
              </span>
            </Label>
          );
        })}
      </RadioGroup>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
