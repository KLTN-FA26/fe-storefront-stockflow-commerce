import type { z } from "zod";

import type {
  cancelOrderInputSchema,
  cancellationRequestDtoSchema,
  cancellationRequestStatusSchema,
  cancellationReasonCodeSchema,
  cancellationResultDtoSchema,
  deliveryStateSchema,
  holdReasonSchema,
  paymentStatusSchema,
  paymentTermSchema,
  productionStateSchema,
  orderAddressDtoSchema,
  orderCardDtoSchema,
  orderDtoSchema,
  orderLineDtoSchema,
  orderStatusGroupSchema,
  orderTimelineEntryDtoSchema,
  orderStatusSchema,
} from "./schemas";

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderStatusGroup = z.infer<typeof orderStatusGroupSchema>;
export type DeliveryState = z.infer<typeof deliveryStateSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type PaymentTerm = z.infer<typeof paymentTermSchema>;
export type ProductionState = z.infer<typeof productionStateSchema>;
export type HoldReason = z.infer<typeof holdReasonSchema>;
export type CancellationReasonCode = z.infer<typeof cancellationReasonCodeSchema>;
export type CancellationRequestStatus = z.infer<typeof cancellationRequestStatusSchema>;
export type CancellationRequest = z.infer<typeof cancellationRequestDtoSchema>;
export type OrderAddress = z.infer<typeof orderAddressDtoSchema>;
export type OrderLine = z.infer<typeof orderLineDtoSchema>;
/** One row of the order list (BE CustomerOrderCardResponse). */
export type OrderCard = z.infer<typeof orderCardDtoSchema>;
export type OrderTimelineEntry = z.infer<typeof orderTimelineEntryDtoSchema>;
/** One order in full (BE CustomerOrderDetailResponse). */
export type Order = z.infer<typeof orderDtoSchema>;
export type CancelOrderInput = z.input<typeof cancelOrderInputSchema>;
export type CancellationResult = z.infer<typeof cancellationResultDtoSchema>;

/** One page of orders on the FE side: `page` is 1-based, the rest is the BE PageResponse. */
export interface OrderPage {
  items: OrderCard[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface MyOrdersParams {
  /** 1-based page from the URL. */
  page: number;
  size: number;
}
