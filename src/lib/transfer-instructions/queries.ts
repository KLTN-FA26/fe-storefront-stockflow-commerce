import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { ApiError } from "@/lib/api/error";
import { QUERY_TIMES } from "@/lib/api/query-client";
import { ORDERS_QUERY_ROOT } from "@/lib/api/query-keys";

import { getTransferInstructions } from "./api";

/** Under the orders root, so everything that refreshes orders (placing, cancelling) refreshes this too. */
export const transferInstructionsKeys = {
  detail: (orderId: string) => [...ORDERS_QUERY_ROOT, "transfer-instructions", orderId] as const,
};

/** Shop account not configured: asking again changes nothing until the shop sets it up. */
export const TRANSFER_UNAVAILABLE_CODE = "TRANSFER_INSTRUCTIONS_UNAVAILABLE";

const retryTransferInstructions = (failureCount: number, error: unknown) =>
  !(
    error instanceof ApiError &&
    (error.isClientError || error.code === TRANSFER_UNAVAILABLE_CODE)
  ) &&
  !(error instanceof z.ZodError) &&
  failureCount < 2;

export function useTransferInstructions(orderId: string, enabled = true) {
  return useQuery({
    queryKey: transferInstructionsKeys.detail(orderId),
    queryFn: ({ signal }) => getTransferInstructions(orderId, signal),
    enabled,
    retry: retryTransferInstructions,
    ...QUERY_TIMES.list,
  });
}
