import type { z } from "zod";

import type {
  cancelOrderInputSchema,
  orderAddressDtoSchema,
  orderDtoSchema,
  orderLineDtoSchema,
  orderStatusSchema,
} from "./schemas";

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderAddress = z.infer<typeof orderAddressDtoSchema>;
export type OrderLine = z.infer<typeof orderLineDtoSchema>;
export type Order = z.infer<typeof orderDtoSchema>;
export type CancelOrderInput = z.input<typeof cancelOrderInputSchema>;

/** One page of orders on the FE side: `page` is 1-based, the rest is the BE PageResponse. */
export interface OrderPage {
  items: Order[];
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
