"use client";

import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { deliveryFailureLabel } from "@/lib/domain/delivery-labels";
import { formatDateTime } from "@/lib/format/date";
import { formatNumber } from "@/lib/format/number";

import type { OrderStatusCardPayload } from "../../card-payloads";
import { closedCardMeta, shipmentStatusMeta } from "../../labels";
import type { ChatCard } from "../../types";
import { CARD_LINK, CardFrame, Fact, Facts } from "./card-frame";

/** ORDER_STATUS card (plan B.7.7): a shipment's hand-over, delivery or failure; no action. */
export function OrderStatusCard({
  card,
  payload,
}: {
  card: ChatCard;
  payload: OrderStatusCardPayload;
}) {
  return (
    <CardFrame
      eyebrow="Giao hàng"
      title={payload.orderNumber ?? "Đơn hàng"}
      status={closedCardMeta(card.state) ?? shipmentStatusMeta(payload.status)}
      footer={
        <Link href={STORE_ROUTES.account.orders.detail(payload.orderId)} className={CARD_LINK}>
          Xem đơn hàng
        </Link>
      }
    >
      <Facts>
        {payload.shipmentCode ? (
          <Fact label="Mã kiện">
            <span className="font-mono">{payload.shipmentCode}</span>
          </Fact>
        ) : null}
        {payload.carrierName ? <Fact label="Đơn vị vận chuyển">{payload.carrierName}</Fact> : null}
        {payload.packageCount ? (
          <Fact label="Số kiện" numeric>
            {formatNumber(payload.packageCount)}
          </Fact>
        ) : null}
        {payload.occurredAt ? (
          <Fact label="Thời điểm" numeric>
            {formatDateTime(payload.occurredAt)}
          </Fact>
        ) : null}
        {payload.status === "DELIVERY_FAILED" ? (
          <Fact label="Lý do">{deliveryFailureLabel(payload.failureReasonCode)}</Fact>
        ) : null}
      </Facts>
    </CardFrame>
  );
}
