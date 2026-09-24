import { createQueryKeys, createListQuery, createDetailQuery } from "@/lib/api/query-factory";
import { getMyOrders, getOrder, type ListMyOrdersParams } from "./api";
import type { Order } from "./types";

export const orderKeys = createQueryKeys<ListMyOrdersParams>("orders");

export const useMyOrders = createListQuery<Order, ListMyOrdersParams>(orderKeys, getMyOrders);

export const useOrder = createDetailQuery<Order>(orderKeys, getOrder);
