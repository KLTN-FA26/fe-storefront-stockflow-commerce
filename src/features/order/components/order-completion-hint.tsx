"use client";

import { CalendarCheck2 } from "lucide-react";

import { Alert } from "@/components/shared";
import { returnWindowEnd, lastReturnDay } from "@/lib/domain/return-window";
import { formatDate } from "@/lib/format/date";
import { isNoInstallments, useMyOrderInstallments } from "@/lib/installments";

import type { Order } from "../types";

/** Thời điểm đơn chuyển `Delivered` theo timeline (BE không gửi `deliveredAt` cho khách). */
export function deliveredAtOf(order: Pick<Order, "timeline">): string | undefined {
  return [...(order.timeline ?? [])].reverse().find((entry) => entry.status === "DELIVERED")
    ?.occurredAt;
}

/**
 * Vì sao đơn đã giao chưa "Hoàn tất" (kltn-docs 17 §4.6 bước 21): hạn đổi / trả 7 ngày và các đợt
 * thanh toán còn nợ. Chỉ với đơn đang `DELIVERED`; đơn hoàn tất / đóng không cần giải thích.
 */
export function OrderCompletionHint({ order, now = new Date() }: { order: Order; now?: Date }) {
  const deliveredAt = order.status === "DELIVERED" ? deliveredAtOf(order) : undefined;
  const plan = useMyOrderInstallments(order.orderId, !!deliveredAt);
  if (!deliveredAt) return null;

  const windowOpen = returnWindowEnd(deliveredAt).getTime() > now.getTime();
  const owing = plan.data?.installments.filter(
    (installment) => installment.outstanding > 0 && installment.status !== "CANCELLED",
  );
  const lines = [
    windowOpen
      ? `Bạn có thể yêu cầu đổi / trả hàng đến hết ngày ${formatDate(lastReturnDay(deliveredAt).toISOString())}.`
      : "Đã hết thời hạn đổi / trả hàng.",
    owing && owing.length > 0
      ? `Còn ${owing.length} đợt thanh toán chưa trả đủ — xem mục Thanh toán.`
      : null,
  ].filter((line): line is string => line !== null);
  const waiting =
    windowOpen || (owing?.length ?? 0) > 0 || (plan.isError && !isNoInstallments(plan.error));

  return (
    <div role="status">
      <Alert
        tone="info"
        title={
          waiting
            ? "Đơn sẽ hoàn tất khi hết hạn đổi / trả và các đợt đã thanh toán đủ"
            : "Đơn sắp được hoàn tất"
        }
      >
        <CalendarCheck2 aria-hidden className="mr-1 inline size-3.5" />
        {lines.join(" ")}
      </Alert>
    </div>
  );
}
