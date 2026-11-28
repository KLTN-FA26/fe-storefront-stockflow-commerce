import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import {
  contractDocumentDtoSchema,
  contractDtoSchema,
  deliveryScheduleDtoSchema,
  type Contract,
  type ContractDocument,
  type DeliverySchedule,
} from "./contract-schemas";

// BE CustomerSalesContractController: /api/v1/orders/me/{orderId}/contract (sales-orders:READ, OWN).

const base = (orderId: string) => `/orders/me/${encodeURIComponent(orderId)}/contract`;

/** 404 SALES_CONTRACT_NOT_FOUND: no contract sent yet (a draft is Sales' work, 14 §4.3 step 13). */
export const CONTRACT_NOT_FOUND_CODE = "SALES_CONTRACT_NOT_FOUND";

/**
 * Nothing to read: no contract sent (SALES_CONTRACT_NOT_FOUND), or a 404 NOT_FOUND for the order
 * itself — which the order page already answers on its own, so the card just stays out.
 */
export const isNoContract = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 404 &&
  (error.code === CONTRACT_NOT_FOUND_CODE || error.code === "NOT_FOUND");

/**
 * GET /orders/me/{orderId}/contract — the order's contract once Sales sent it; null while there is
 * none to read (404), so the order page simply leaves the card out.
 */
export async function getMyOrderContract(
  orderId: string,
  signal?: AbortSignal,
): Promise<Contract | null> {
  try {
    const { data } = await api.get<unknown>(base(orderId), signal ? { signal } : {});
    return contractDtoSchema.parse(data);
  } catch (error) {
    if (isNoContract(error)) return null;
    throw error;
  }
}

/**
 * GET /orders/me/{orderId}/contract/document — a short-lived link: the signed file, else as sent.
 * `copy: "sent"` asks for the PDF as sent even once the contract is signed.
 */
export async function getMyOrderContractDocument(
  orderId: string,
  copy?: "sent",
): Promise<ContractDocument> {
  const { data } = await api.get<unknown>(
    `${base(orderId)}/document`,
    copy ? { params: { copy } } : {},
  );
  return contractDocumentDtoSchema.parse(data);
}

/**
 * GET /orders/me/{orderId}/delivery-batches (BE DeliveryBatchController#mySchedule, sales-orders:READ,
 * OWN) — the order's delivery schedule in force: for each batch the window the contract names and the
 * one in force, with its moves (17 §5.2, BR-28).
 */
export async function getMyDeliverySchedule(
  orderId: string,
  signal?: AbortSignal,
): Promise<DeliverySchedule> {
  const { data } = await api.get<unknown>(
    `/orders/me/${encodeURIComponent(orderId)}/delivery-batches`,
    signal ? { signal } : {},
  );
  return deliveryScheduleDtoSchema.parse(data);
}
