import { RETURN_WINDOW_DAYS, returnWindowEnd } from "@/lib/domain/return-window";

import { canOpenReturn } from "./selectors";

/**
 * Chỉ cho BE cũ không gửi `lines[].returnableQuantity` của lần giao: trạng thái đơn mà BE vẫn nhận
 * yêu cầu trả hàng của một lần giao đã đến, kể cả khi các lần giao sau còn đang chuẩn bị / đang giao
 * (BE `ReturnRequest.requireReturnable`, WF-05 TH-1 — Luật Thương mại Điều 313: mỗi lần giao xử lý
 * riêng). Khi BE gửi số trả được, số đó quyết định — FE không giữ bản sao luật của BE (SF-05).
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

/**
 * Một dòng đơn trong một lần giao (BE `CustomerOrderShipmentLine`): `returnableQuantity` là số tối
 * đa một yêu cầu mở bây giờ cho lần giao này được trả — 0 là không trả thêm được (chưa giao, quá
 * hạn, đã có yêu cầu mở, đã trả hết, hay lần giao đã được hoàn tiền — WF-05 Q-15).
 */
export interface ReturnShipmentLine {
  orderLineId: string;
  quantity: number;
  returnableQuantity: number;
}

/** Một lần giao của đơn như trang khách đọc (BE `CustomerOrderShipment`). */
export interface ReturnShipmentSource {
  shipmentId?: string | null | undefined;
  shipmentCode?: string | null | undefined;
  status: string;
  outcomeAt?: string | null | undefined;
  lines?: readonly ReturnShipmentLine[] | null | undefined;
}

/** Một lần giao đã đến, và khách còn mở được yêu cầu trả hàng cho nó không. */
export interface ReturnableShipment {
  /** Null: lần giao BE dựng từ mốc của đơn (đơn giao một lần, không ghi lần giao) — không cần gửi id. */
  shipmentId: string | null;
  shipmentCode: string | null;
  /** Ngày giao (BE `outcomeAt`); null khi BE không gửi. */
  deliveredAt: string | null;
  /**
   * Hạn đổi / trả tính tại FE (thời hạn hợp đồng, mặc định 7 ngày) — chỉ để viết ngày hạn cho
   * khách, không quyết định gì: BE có thể tính khác (hợp đồng chưa đọc được, Sales nhận khiếu nại
   * muộn). Null khi không biết ngày giao.
   */
  windowEnd: Date | null;
  windowOpen: boolean;
  /**
   * Khách mở được yêu cầu cho lần giao này bây giờ: có dòng nào BE cho `returnableQuantity` > 0. BE
   * cũ không gửi số đó: theo hạn tại FE và trạng thái đơn.
   */
  returnable: boolean;
  /** Hàng của lần giao theo dòng đơn; null khi BE không gửi (BE cũ) — tối đa tính theo cả đơn. */
  lines: readonly ReturnShipmentLine[] | null;
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
 * Khách tự mở yêu cầu trả hàng được không, và với lần giao nào (BE `ReturnRequest.claimable`,
 * BR-RMA-001, WF-05 TH-1, Q-15). Một lần giao đã đến trả được khi BE cho một dòng của nó
 * `returnableQuantity` > 0 — số BE tính bằng đúng luật nó dùng để nhận yêu cầu, xét theo từng lần
 * giao chứ không theo trạng thái đơn, nên một đơn đã hoàn tiền một lần giao vẫn trả được lần giao
 * khác còn hạn. Hạn tại FE (`windowDays`, thời hạn hợp đồng, không có thì 7 ngày) chỉ dùng để viết
 * ngày hạn và chọn lời giải thích. BE cũ không gửi số đó: theo hạn tại FE như trước. BE vẫn kiểm lại.
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
  const legacyStatusOk = RETURNABLE_WITH_DELIVERED_SHIPMENT.has(order.status);
  const delivered: ReturnableShipment[] = [];
  for (const shipment of shipments) {
    if (shipment.status !== "DELIVERED") continue;
    const lines = shipment.lines ?? null;
    const deliveredAt = shipment.outcomeAt ?? null;
    // An older BE without the lines and without the day: nothing to go on, as before.
    if (!lines && !deliveredAt) continue;
    const windowEnd = deliveredAt ? returnWindowEnd(deliveredAt, windowDays) : null;
    const windowOpen = windowEnd !== null && windowEnd.getTime() > now.getTime();
    delivered.push({
      shipmentId: shipment.shipmentId ?? null,
      shipmentCode: shipment.shipmentCode ?? null,
      deliveredAt,
      windowEnd,
      windowOpen,
      returnable: lines
        ? lines.some((line) => line.returnableQuantity > 0)
        : windowOpen && legacyStatusOk,
      lines,
    });
  }
  if (delivered.length === 0) return { kind: "closed", reason: "NOT_DELIVERED" };
  if (!delivered.some((shipment) => shipment.returnable)) {
    return { kind: "closed", reason: closedReason(order.status, delivered, legacyStatusOk) };
  }
  const needsChoice = delivered.length > 1;
  if (needsChoice && delivered.some((s) => s.returnable && !s.shipmentId)) {
    return { kind: "contactSales" };
  }
  return { kind: "open", shipments: delivered, needsChoice };
}

/**
 * Why nothing delivered can be returned, for the text only: every window past by the FE's count
 * reads "quá hạn"; otherwise the goods are claimed, settled or the order is closed. An older BE's
 * status rule keeps its own reading (COMPLETED: past its window).
 */
function closedReason(
  status: string,
  delivered: readonly ReturnableShipment[],
  legacyStatusOk: boolean,
): ReturnClosedReason {
  const fromBe = delivered.some((shipment) => shipment.lines !== null);
  if (!fromBe && !legacyStatusOk)
    return status === "COMPLETED" ? "WINDOW_CLOSED" : "NOT_RETURNABLE";
  return delivered.every((shipment) => !shipment.windowOpen) ? "WINDOW_CLOSED" : "NOT_RETURNABLE";
}
