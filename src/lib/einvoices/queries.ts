import { useQuery } from "@tanstack/react-query";

import { hasErrorCode } from "@/lib/api/describe-error";
import { ApiError } from "@/lib/api/error";
import { QUERY_TIMES } from "@/lib/api/query-client";
import { ORDERS_QUERY_ROOT } from "@/lib/api/query-keys";
import { retryTransient } from "@/lib/api/retry";
import { beId } from "@/lib/validation/primitives";

import { getMyEInvoice, listMyEInvoiceErrorNotices, listMyEInvoices } from "./api";

/** Cỡ trang lớn nhất BE cho (`Pages` ≤ 200): đủ cho mọi hoá đơn của một đơn. */
export const MY_EINVOICES_SCAN_SIZE = 200;

export const einvoiceKeys = {
  all: [...ORDERS_QUERY_ROOT, "einvoices"] as const,
  ofOrder: (orderId: string) => [...einvoiceKeys.all, "order", orderId] as const,
  errorNotices: (invoiceId: string) => [...einvoiceKeys.all, "error-notices", invoiceId] as const,
};

/**
 * Hoá đơn đã phát hành của một đơn của khách — BE lọc theo `orderId` — cũ nhất trước (lần giao đầu
 * trước; BE trả mới nhất trước).
 */
export function useMyOrderEInvoices(orderId: string, enabled = true) {
  return useQuery({
    queryKey: einvoiceKeys.ofOrder(orderId),
    queryFn: async ({ signal }) => {
      const page = await listMyEInvoices(
        { page: 0, size: MY_EINVOICES_SCAN_SIZE, orderId },
        signal,
      );
      return [...page.items].sort((a, b) => a.issueDate.localeCompare(b.issueDate));
    },
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}

/**
 * An older BE has no `GET /einvoices/me/{id}`: Spring answers the unmapped path with the generic 404
 * `NOT_FOUND` (or 405), never `EINVOICE_NOT_FOUND`, which only the endpoint itself sends.
 */
const isMissingEndpoint = (error: unknown) =>
  error instanceof ApiError &&
  ((error.status === 404 && error.code === "NOT_FOUND") || error.status === 405);

/**
 * The order of one of the customer's invoices, or null when it is not theirs (notification links).
 * Read by id (BE-60, F-19), so an invoice older than the newest 200 is found too; an older BE
 * without that endpoint falls back to scanning the newest page. Not a UUID: not theirs, unasked.
 */
export async function myInvoiceOrderId(
  invoiceId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!beId().safeParse(invoiceId).success) return null;
  try {
    return (await getMyEInvoice(invoiceId, signal)).orderId;
  } catch (error) {
    if (hasErrorCode(error, "EINVOICE_NOT_FOUND")) return null;
    if (!isMissingEndpoint(error)) throw error;
    const page = await listMyEInvoices({ page: 0, size: MY_EINVOICES_SCAN_SIZE }, signal);
    return page.items.find((invoice) => invoice.id === invoiceId)?.orderId ?? null;
  }
}

export function useMyInvoiceOrder(invoiceId: string) {
  return useQuery({
    queryKey: [...einvoiceKeys.all, "invoice-order", invoiceId] as const,
    queryFn: ({ signal }) => myInvoiceOrderId(invoiceId, signal),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/**
 * The 04/SS notices of one of the customer's invoices (SF-03), oldest first. A 404 — the invoice is
 * no longer the customer's to see, or a BE without the endpoint — has none to show; any other
 * failure is the row's to report, never silently "no notice".
 */
export function useMyEInvoiceErrorNotices(invoiceId: string, enabled = true) {
  return useQuery({
    queryKey: einvoiceKeys.errorNotices(invoiceId),
    queryFn: async ({ signal }) => {
      try {
        return await listMyEInvoiceErrorNotices(invoiceId, signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return [];
        throw error;
      }
    },
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}
