import { api } from "@/lib/api/client";

import {
  customerEInvoicePageDtoSchema,
  fileLinkDtoSchema,
  type CustomerEInvoicePage,
  type EInvoiceFileKind,
  type FileLink,
} from "./schemas";

const BASE = "/einvoices/me";

/**
 * GET /einvoices/me (einvoices:READ scope OWN): hoá đơn đã phát hành của khách, ngày lập mới nhất
 * trước. BE chưa lọc theo đơn (task BE-01) — trang đơn đọc một trang lớn rồi lọc theo `orderId`.
 */
export async function listMyEInvoices(
  params: { page?: number; size?: number } = {},
  signal?: AbortSignal,
): Promise<CustomerEInvoicePage> {
  const { data } = await api.get<unknown>(BASE, { params, ...(signal ? { signal } : {}) });
  return customerEInvoicePageDtoSchema.parse(data);
}

/** Link tải XML / PDF có hạn ngắn (docs 21 §4.3 bước 9). */
export async function getMyEInvoiceFile(id: string, kind: EInvoiceFileKind): Promise<FileLink> {
  const { data } = await api.get<unknown>(`${BASE}/${encodeURIComponent(id)}/files/${kind}`);
  return fileLinkDtoSchema.parse(data);
}
