import { api } from "@/lib/api/client";

import {
  customerEInvoiceDtoSchema,
  customerEInvoiceErrorNoticesDtoSchema,
  customerEInvoicePageDtoSchema,
  fileLinkDtoSchema,
  type CustomerEInvoice,
  type CustomerEInvoiceErrorNotice,
  type CustomerEInvoicePage,
  type EInvoiceFileKind,
  type FileLink,
} from "./schemas";

const BASE = "/einvoices/me";

/**
 * GET /einvoices/me (einvoices:READ scope OWN): hoá đơn đã phát hành của khách, ngày lập mới nhất
 * trước. `orderId` thu về một đơn của khách (BE `CustomerEInvoiceController.list`); đơn của khách
 * khác hay đơn không có thì BE trả trang rỗng.
 */
export async function listMyEInvoices(
  params: { page?: number; size?: number; orderId?: string } = {},
  signal?: AbortSignal,
): Promise<CustomerEInvoicePage> {
  const { data } = await api.get<unknown>(BASE, { params, ...(signal ? { signal } : {}) });
  return customerEInvoicePageDtoSchema.parse(data);
}

/**
 * GET /einvoices/me/{id} (WF-05 F-19): một hoá đơn đã phát hành của khách. Của khách khác, bản nháp
 * hay không có đều 404 `EINVOICE_NOT_FOUND`.
 */
export async function getMyEInvoice(id: string, signal?: AbortSignal): Promise<CustomerEInvoice> {
  const { data } = await api.get<unknown>(
    `${BASE}/${encodeURIComponent(id)}`,
    signal ? { signal } : {},
  );
  return customerEInvoiceDtoSchema.parse(data);
}

/**
 * GET /einvoices/me/{id}/error-notices: các thông báo hoá đơn ghi sai tên / địa chỉ của khách
 * (04/SS-HĐĐT), cũ nhất trước; rỗng khi không có.
 */
export async function listMyEInvoiceErrorNotices(
  id: string,
  signal?: AbortSignal,
): Promise<CustomerEInvoiceErrorNotice[]> {
  const { data } = await api.get<unknown>(
    `${BASE}/${encodeURIComponent(id)}/error-notices`,
    signal ? { signal } : {},
  );
  return customerEInvoiceErrorNoticesDtoSchema.parse(data);
}

/** Link tải XML / PDF có hạn ngắn (docs 21 §4.3 bước 9). */
export async function getMyEInvoiceFile(id: string, kind: EInvoiceFileKind): Promise<FileLink> {
  const { data } = await api.get<unknown>(`${BASE}/${encodeURIComponent(id)}/files/${kind}`);
  return fileLinkDtoSchema.parse(data);
}
