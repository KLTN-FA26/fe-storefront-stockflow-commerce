"use client";

import { Truck } from "lucide-react";

import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format/date";

import { describeError } from "../errors";
import { VEHICLE_MILESTONE_LABEL, VEHICLE_SHIPMENT_STATUS_LABEL } from "../labels";
import { useOrderVehicles } from "../queries";
import type { OrderVehicle } from "../types";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-wrap gap-x-2 text-sm">
      <dt className="text-ink-secondary">{label}:</dt>
      <dd className="text-ink-primary font-medium tabular-nums">{value || "Đang cập nhật"}</dd>
    </div>
  );
}

/** One vehicle: carrier, waybill, plate, then its journey and the shipments on it (kltn-docs 17 §5.2, BR-27). */
export function VehicleItem({ vehicle, index }: { vehicle: OrderVehicle; index: number }) {
  const milestones = vehicle.milestones ?? [];
  const shipments = vehicle.shipments ?? [];
  return (
    <li className="border-border-default space-y-3 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <Truck aria-hidden className="text-ink-tertiary size-5 shrink-0" />
        <p className="text-ink-primary text-sm font-semibold">Xe {index + 1}</p>
        {vehicle.handedOverAt ? (
          <time className="text-ink-tertiary ml-auto text-xs" dateTime={vehicle.handedOverAt}>
            Bàn giao {formatDateTime(vehicle.handedOverAt)}
          </time>
        ) : null}
      </div>
      <dl className="space-y-1">
        <Field label="Hãng vận chuyển" value={vehicle.carrierName} />
        <Field label="Mã vận đơn" value={vehicle.waybillNo} />
        <Field label="Biển số xe" value={vehicle.vehiclePlate} />
      </dl>
      {milestones.length > 0 ? (
        <ol aria-label="Hành trình" className="space-y-1">
          {milestones.map((m, i) => (
            <li key={`${m.milestone}-${m.at}-${i}`} className="flex flex-wrap gap-x-2 text-sm">
              <span className="text-ink-primary font-medium">
                {VEHICLE_MILESTONE_LABEL[m.milestone]}
              </span>
              <time className="text-ink-tertiary text-xs" dateTime={m.at}>
                {formatDateTime(m.at)}
              </time>
            </li>
          ))}
        </ol>
      ) : null}
      {shipments.length > 0 ? (
        <ul aria-label="Các lô hàng trên xe" className="space-y-1">
          {shipments.map((s) => (
            <li key={s.shipmentCode} className="flex flex-wrap gap-x-2 text-sm">
              <span className="text-ink-secondary font-mono">{s.shipmentCode}</span>
              <span className="text-ink-primary">{VEHICLE_SHIPMENT_STATUS_LABEL[s.status]}</span>
              {s.outcomeAt ? (
                <time className="text-ink-tertiary text-xs" dateTime={s.outcomeAt}>
                  {formatDateTime(s.outcomeAt)}
                </time>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Delivery tracking, vehicle by vehicle. Loads on its own so a failure here never hides the order:
 * while loading a skeleton, on error a retryable notice, and with no vehicle yet (nothing handed
 * over) the card is not shown at all.
 */
export function OrderVehiclesCard({ orderId }: { orderId: string }) {
  const { data, isPending, error, refetch, isFetching } = useOrderVehicles(orderId);

  if (isPending && !error) {
    return (
      <div role="status" aria-label="Đang tải thông tin vận chuyển" className={CARD}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-16 w-full" />
      </div>
    );
  }
  if (!data) {
    return (
      <section className={`${CARD} space-y-3`} aria-labelledby="order-vehicles-heading">
        <h2
          id="order-vehicles-heading"
          className="font-display text-ink-primary text-base font-semibold"
        >
          Vận chuyển
        </h2>
        <Alert tone="warning" title="Chưa tải được thông tin vận chuyển">
          {describeError(error)}
        </Alert>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? "Đang thử lại..." : "Thử lại"}
        </Button>
      </section>
    );
  }
  if (data.length === 0) return null;

  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="order-vehicles-heading">
      <h2
        id="order-vehicles-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Vận chuyển
      </h2>
      <ul className="space-y-3">
        {data.map((vehicle, index) => (
          <VehicleItem key={vehicle.loadCode} vehicle={vehicle} index={index} />
        ))}
      </ul>
    </section>
  );
}
