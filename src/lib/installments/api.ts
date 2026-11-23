import { api } from "@/lib/api/client";

import {
  installmentDtoSchema,
  installmentPageDtoSchema,
  installmentTransferDtoSchema,
  orderInstallmentsDtoSchema,
  type Installment,
  type InstallmentPage,
  type InstallmentTransfer,
  type OrderInstallments,
} from "./schemas";

const BASE = "/installments/me";
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

/**
 * GET /installments/me/orders/{orderId} (BE InstallmentController.myOrder, payment-installments:READ
 * scope OWN): the installments of one of the customer's orders and where they stand. An order with
 * no signed contract yet - or another customer's - answers 404 INSTALLMENT_NOT_FOUND.
 */
export async function getMyOrderInstallments(
  orderId: string,
  signal?: AbortSignal,
): Promise<OrderInstallments> {
  const { data } = await api.get<unknown>(
    `${BASE}/orders/${encodeURIComponent(orderId)}`,
    withSignal(signal),
  );
  return orderInstallmentsDtoSchema.parse(data);
}

/**
 * GET /installments/me/{installmentId} (BE InstallmentController.myOne): one of the customer's
 * installments with the receipts that paid it - the live ones only. Their `receiptId` names the
 * payment confirmation paper. Another customer's is 404 INSTALLMENT_NOT_FOUND.
 */
export async function getMyInstallment(
  installmentId: string,
  signal?: AbortSignal,
): Promise<Installment> {
  const { data } = await api.get<unknown>(
    `${BASE}/${encodeURIComponent(installmentId)}`,
    withSignal(signal),
  );
  return installmentDtoSchema.parse(data);
}

/**
 * GET /installments/me/{installmentId}/transfer-instructions (15 §4.2 step 5): the shop's account,
 * what is still owed and the transfer content. 409 INSTALLMENT_NOT_PAYABLE once it is paid or
 * cancelled; 503 TRANSFER_INSTRUCTIONS_UNAVAILABLE while the shop has no account set up.
 */
export async function getMyInstallmentTransfer(
  installmentId: string,
  signal?: AbortSignal,
): Promise<InstallmentTransfer> {
  const { data } = await api.get<unknown>(
    `${BASE}/${encodeURIComponent(installmentId)}/transfer-instructions`,
    withSignal(signal),
  );
  return installmentTransferDtoSchema.parse(data);
}

export interface MyInstallmentsParams {
  /** Zero-based, as the BE pages. */
  page?: number;
  size?: number;
  orderId?: string;
  status?: string;
}

/** GET /installments/me: every installment of the customer's signed contracts, earliest due first. */
export async function listMyInstallments(
  params: MyInstallmentsParams = {},
  signal?: AbortSignal,
): Promise<InstallmentPage> {
  const { data } = await api.get<unknown>(BASE, { params, ...withSignal(signal) });
  return installmentPageDtoSchema.parse(data);
}
