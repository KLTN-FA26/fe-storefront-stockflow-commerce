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
});

export type OrderRefund = z.infer<typeof orderRefundDtoSchema>;
