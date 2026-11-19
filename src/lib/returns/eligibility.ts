import { RETURN_WINDOW_DAYS, returnWindowEnd } from "@/lib/domain/return-window";

import { canOpenReturn } from "./selectors";

/**
 * Trạng thái đơn mà BE vẫn nhận yêu cầu trả hàng của một lần giao đã đến, kể cả khi các lần giao
 * sau còn đang chuẩn bị / đang giao (BE `ReturnRequest.requireReturnable`, WF-05 TH-1 — Luật Thương
 * mại Điều 313: mỗi lần giao xử lý riêng). `COMPLETED` đã hết hạn; đơn đã tất toán / đóng thì nhờ Sales.
 */
const RETURNABLE_WITH_DELIVERED_SHIPMENT: ReadonlySet<string> = new Set([
  "DELIVERED",
  "RETURN_REQUESTED",
  "PICKING",
  "PARTIALLY_FULFILLED",
  "PACKED",
  "ON_HOLD",
  "SHIPPED",
  "DELIVERY_FAILED",
]);

/** Một lần giao của đơn như trang khách đọc (BE `CustomerOrderShipment`). */
export interface ReturnShipmentSource {
  shipmentId?: string | null | undefined;
  shipmentCode?: string | null | undefined;
  status: string;
  outcomeAt?: string | null | undefined;
}

/** Một lần giao đã đến: hàng của nó trả được tới `windowEnd` (hạn tính từ ngày giao của chính nó). */
export interface ReturnableShipment {
  /** Null: lần giao BE dựng từ mốc của đơn (đơn giao một lần, không ghi lần giao) — không cần gửi id. */
  shipmentId: string | null;
  shipmentCode: string | null;
  deliveredAt: string;
  windowEnd: Date;
  windowOpen: boolean;
}

export type ReturnClosedReason = "NOT_DELIVERED" | "WINDOW_CLOSED" | "NOT_RETURNABLE";

export type ReturnEligibility =
  /**
   * Mở được. `shipments` là các lần giao đã đến (rỗng: đơn không có lần giao nào, trả theo cả đơn);
   * `needsChoice`: đã đến từ hai lần trở lên, khách phải chọn lần giao (`RETURN_SHIPMENT_REQUIRED`).
   */
  | {
      kind: "open";
      shipments: ReturnableShipment[];
      needsChoice: boolean;
      deliveredAt?: string | undefined;
    }
  | { kind: "closed"; reason: ReturnClosedReason }
  /** Giao nhiều lần nhưng BE không gửi id lần giao (BE cũ): khách không chọn được — nhờ Sales. */
  | { kind: "contactSales" };

export interface ReturnEligibilityInput {
  status: string;
  shipments?: readonly ReturnShipmentSource[] | null | undefined;
  /** Ngày giao của cả đơn (timeline): dùng khi đơn chưa có lần giao nào được ghi. */
  deliveredAt?: string | undefined;
}

/**
 * Khách tự mở yêu cầu trả hàng được không, và với lần giao nào (BE `ReturnRequest.deliveredShipment`
 * + `requireReturnable`, BR-RMA-001, WF-05 TH-1). Hạn đổi / trả chạy từ ngày giao của từng lần giao
 * (Điều 318), dài `windowDays` — thời hạn hợp đồng ghi, không có thì 7 ngày. BE vẫn kiểm lại.
 */
export function returnEligibility(
  order: ReturnEligibilityInput,
  windowDays: number = RETURN_WINDOW_DAYS,
  now: Date = new Date(),
): ReturnEligibility {
  const shipments = order.shipments ?? [];
  if (shipments.length === 0) {
    return canOpenReturn(order.status, order.deliveredAt, now, windowDays)
      ? { kind: "open", shipments: [], needsChoice: false, deliveredAt: order.deliveredAt }
      : { kind: "closed", reason: order.deliveredAt ? "WINDOW_CLOSED" : "NOT_DELIVERED" };
  }
  const delivered: ReturnableShipment[] = [];
  for (const shipment of shipments) {
    if (shipment.status !== "DELIVERED" || !shipment.outcomeAt) continue;
    const windowEnd = returnWindowEnd(shipment.outcomeAt, windowDays);
    delivered.push({
      shipmentId: shipment.shipmentId ?? null,
      shipmentCode: shipment.shipmentCode ?? null,
      deliveredAt: shipment.outcomeAt,
      windowEnd,
      windowOpen: windowEnd.getTime() > now.getTime(),
    });
  }
  if (delivered.length === 0) return { kind: "closed", reason: "NOT_DELIVERED" };
  if (!RETURNABLE_WITH_DELIVERED_SHIPMENT.has(order.status)) {
    return {
      kind: "closed",
      reason: order.status === "COMPLETED" ? "WINDOW_CLOSED" : "NOT_RETURNABLE",
    };
  }
  if (!delivered.some((shipment) => shipment.windowOpen)) {
    return { kind: "closed", reason: "WINDOW_CLOSED" };
  }
  const needsChoice = delivered.length > 1;
  if (needsChoice && delivered.some((s) => s.windowOpen && !s.shipmentId)) {
    return { kind: "contactSales" };
  }
  return { kind: "open", shipments: delivered, needsChoice };
}
