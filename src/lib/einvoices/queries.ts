import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { ORDERS_QUERY_ROOT } from "@/lib/api/query-keys";
import { retryTransient } from "@/lib/api/retry";

import { listMyEInvoices } from "./api";

/** Cỡ trang lớn nhất BE cho (`Pages` ≤ 200): đủ cho hoá đơn của một khách tới khi BE lọc theo đơn. */
export const MY_EINVOICES_SCAN_SIZE = 200;

export const einvoiceKeys = {
  all: [...ORDERS_QUERY_ROOT, "einvoices"] as const,
  ofOrder: (orderId: string) => [...einvoiceKeys.all, "order", orderId] as const,
};

/** Hoá đơn đã phát hành của một đơn của khách, cũ nhất trước (lần giao đầu trước). */
export function useMyOrderEInvoices(orderId: string, enabled = true) {
  return useQuery({
    queryKey: einvoiceKeys.ofOrder(orderId),
    queryFn: async ({ signal }) => {
      const page = await listMyEInvoices({ page: 0, size: MY_EINVOICES_SCAN_SIZE }, signal);
      return page.items
        .filter((invoice) => invoice.orderId === orderId)
        .sort((a, b) => a.issueDate.localeCompare(b.issueDate));
    },
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}
