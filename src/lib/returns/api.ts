import { api } from "@/lib/api/client";
import { REPEATED_PARAMS } from "@/lib/api/repeated-params";

import {
  customerReturnDtoSchema,
  evidenceLinkDtoSchema,
  openReturnInputSchema,
  returnPageDtoSchema,
  type CustomerReturn,
  type OpenReturnInput,
  type ReturnPage,
  type ReturnStatus,
} from "./schemas";

const enc = encodeURIComponent;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});
/** Ảnh tới 15 MB: lâu hơn hạn 15 s mặc định của client. */
const UPLOAD_TIMEOUT_MS = 120_000;

export interface MyReturnsParams {
  /** 1-based như các trang FE khác; BE `PageResponse` 0-based. */
  page?: number;
  size?: number;
  orderId?: string;
  status?: readonly Exclude<ReturnStatus, "UNKNOWN">[];
}

/** GET /returns/me (sales-rmas:READ OWN): trả hàng của khách, mới nhất trước. */
export async function listMyReturns(
  params: MyReturnsParams = {},
  signal?: AbortSignal,
): Promise<ReturnPage> {
  const { data } = await api.get<unknown>("/returns/me", {
    params: {
      page: Math.max(params.page ?? 1, 1) - 1,
      size: params.size,
      orderId: params.orderId,
      status: params.status && params.status.length > 0 ? [...params.status] : undefined,
    },
    ...REPEATED_PARAMS,
    ...withSignal(signal),
  });
  const page = returnPageDtoSchema.parse(data);
  return { ...page, page: page.page + 1 };
}

/** GET /returns/me/{returnId}: của người khác hay không tồn tại đều 404. */
export async function getMyReturn(returnId: string, signal?: AbortSignal): Promise<CustomerReturn> {
  const { data } = await api.get<unknown>(`/returns/me/${enc(returnId)}`, withSignal(signal));
  return customerReturnDtoSchema.parse(data);
}

/**
 * POST /orders/{orderId}/returns (sales-rmas:CREATE OWN), kèm `shipmentId` của lần giao khi đơn giao
 * nhiều lần. `requestId` sinh một lần cho mỗi form:
 * gửi lại (mất mạng, bấm hai lần) nhận về đúng yêu cầu đã mở (BE idempotent theo `requestId`).
 */
export async function openMyReturn(input: OpenReturnInput): Promise<CustomerReturn> {
  const { orderId, requestId, reasonCode, description, lines, shipmentId } =
    openReturnInputSchema.parse(input);
  const { data } = await api.post<unknown>(`/orders/${enc(orderId)}/returns`, {
    requestId,
    reasonCode,
    description: description || undefined,
    requestedResolution: "REFUND",
    lines,
    // Đơn giao nhiều lần: BE cần biết hàng đến ở lần giao nào (WF-05 TH-1).
    shipmentId,
  });
  return customerReturnDtoSchema.parse(data);
}

/** POST /returns/{returnId}/evidence — multipart `file`, ảnh của vấn đề (CLAIM). */
export async function addMyReturnPhoto(returnId: string, file: File): Promise<CustomerReturn> {
  const body = new FormData();
  body.append("file", file, file.name);
  const { data } = await api.post<unknown>(`/returns/${enc(returnId)}/evidence`, body, {
    // Client mặc định JSON sẽ khiến axios serialise FormData thành JSON.
    headers: { "Content-Type": "multipart/form-data" },
    timeout: UPLOAD_TIMEOUT_MS,
  });
  return customerReturnDtoSchema.parse(data);
}

/** POST /returns/{returnId}/cancellation — rút yêu cầu khi hàng chưa về (REQUESTED, AWAITING_RETURN). */
export async function cancelMyReturn(returnId: string, reason?: string): Promise<CustomerReturn> {
  const trimmed = reason?.trim();
  const { data } = await api.post<unknown>(
    `/returns/${enc(returnId)}/cancellation`,
    trimmed ? { reason: trimmed } : undefined,
  );
  return customerReturnDtoSchema.parse(data);
}

/** GET /returns/{id}/evidence/{evidenceId}/download-url — link xem ảnh, hạn 5 phút, `no-store`. */
export async function getReturnPhotoLink(returnId: string, evidenceId: string): Promise<string> {
  const { data } = await api.get<unknown>(
    `/returns/${enc(returnId)}/evidence/${enc(evidenceId)}/download-url`,
  );
  return evidenceLinkDtoSchema.parse(data).url;
}
