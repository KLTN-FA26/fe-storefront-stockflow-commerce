import { z } from "zod";

import { currencySchema, isoDate } from "@/lib/validation/primitives";
import { tolerantEnum } from "@/lib/validation/tolerant-enum";

/** BE `RefundStanding.Status` — tính ra, không lưu (kltn-docs 15 §5.3). */
export const REFUND_STATUSES = ["NONE", "PENDING", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

/** Một lần đã hoàn (BE `RefundRecordResponse`; khách chỉ thấy bản còn hiệu lực). */
export const refundRecordDtoSchema = z.object({
  refundRecordId: z.string(),
  amount: z.number(),
  currency: currencySchema,
  refundedOn: isoDate,
  reference: z.string(),
});

/**
 * Một lần tất toán của đơn (BE `OrderRefundResponse.Settlement`), chỉ phần khách cần đọc: phí vận
 * chuyển được miễn khi hàng bị đơn vị vận chuyển hoàn về (WF-05 Q-19) — theo tỉ lệ giá trị hàng của
 * chuyến đó, hoặc toàn bộ khi đơn không giao được gì. BE tính, FE chỉ cộng lại để hiện.
 */
export const refundSettlementDtoSchema = z.object({
  kind: z.string().nullish(),
  shippingFeeWaived: z.number().nullish(),
});

/** BE `OrderRefundResponse` cho khách: số phải hoàn, đã hoàn, còn lại, các lần hoàn. */
export const orderRefundDtoSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string().nullish(),
  currency: currencySchema,
  refundStatus: tolerantEnum(REFUND_STATUSES),
  refundable: z.number(),
  refunded: z.number(),
  remaining: z.number(),
  records: z.array(refundRecordDtoSchema).nullish(),
  settlements: z.array(refundSettlementDtoSchema).nullish(),
  /** WF-05 BE-51: phí của đơn còn phải trả (phí huỷ phần còn lại); không trừ vào `remaining`. */
  feeOwed: z.number().nullish(),
});

/** Tổng phí vận chuyển được miễn qua các lần tất toán (Q-19); 0 khi không có. */
export const shippingFeeWaivedOf = (refund: Pick<OrderRefund, "settlements">): number =>
  (refund.settlements ?? []).reduce(
    (sum, settlement) => sum + Math.max(settlement.shippingFeeWaived ?? 0, 0),
    0,
  );

export type OrderRefund = z.infer<typeof orderRefundDtoSchema>;
