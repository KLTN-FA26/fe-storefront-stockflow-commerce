import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { ApiError } from "@/lib/api/error";
import { QUERY_TIMES } from "@/lib/api/query-client";
import { ORDERS_QUERY_ROOT } from "@/lib/api/query-keys";

import {
  getMyInstallmentTransfer,
  getMyOrderInstallments,
  listMyInstallments,
  type MyInstallmentsParams,
} from "./api";

/**
 * Under the orders root: whatever refreshes the customer's orders (a cancellation, a notification
 * that money arrived) refreshes what the orders owe too.
 */
export const installmentKeys = {
  all: [...ORDERS_QUERY_ROOT, "installments"] as const,
  ofOrder: (orderId: string) => [...installmentKeys.all, "order", orderId] as const,
  transfer: (installmentId: string) => [...installmentKeys.all, "transfer", installmentId] as const,
  list: (params: MyInstallmentsParams) => [...installmentKeys.all, "list", params] as const,
};

/** The order has no signed contract yet, so no installments: not an error to the customer. */
export const INSTALLMENT_NOT_FOUND_CODE = "INSTALLMENT_NOT_FOUND";
/** Shop account not configured: asking again changes nothing until the shop sets it up. */
export const TRANSFER_UNAVAILABLE_CODE = "TRANSFER_INSTRUCTIONS_UNAVAILABLE";
/** Paid or cancelled meanwhile: there is nothing to transfer any more. */
export const INSTALLMENT_NOT_PAYABLE_CODE = "INSTALLMENT_NOT_PAYABLE";

export const isNoInstallments = (error: unknown) =>
  error instanceof ApiError && error.code === INSTALLMENT_NOT_FOUND_CODE;

/** A 4xx, a missing account or a contract bug will not change by asking again. */
const retryUnlessSettled = (failureCount: number, error: unknown) =>
  !(
    error instanceof ApiError &&
    (error.isClientError || error.code === TRANSFER_UNAVAILABLE_CODE)
  ) &&
  !(error instanceof z.ZodError) &&
  failureCount < 2;

export function useMyOrderInstallments(orderId: string, enabled = true) {
  return useQuery({
    queryKey: installmentKeys.ofOrder(orderId),
    queryFn: ({ signal }) => getMyOrderInstallments(orderId, signal),
    enabled,
    retry: retryUnlessSettled,
    ...QUERY_TIMES.list,
  });
}

export function useMyInstallmentTransfer(installmentId: string, enabled = true) {
  return useQuery({
    queryKey: installmentKeys.transfer(installmentId),
    queryFn: ({ signal }) => getMyInstallmentTransfer(installmentId, signal),
    enabled,
    retry: retryUnlessSettled,
    ...QUERY_TIMES.list,
  });
}

export function useMyInstallments(params: MyInstallmentsParams, enabled = true) {
  return useQuery({
    queryKey: installmentKeys.list(params),
    queryFn: ({ signal }) => listMyInstallments(params, signal),
    enabled,
    retry: retryUnlessSettled,
    placeholderData: (previous) => previous,
    ...QUERY_TIMES.list,
  });
}
