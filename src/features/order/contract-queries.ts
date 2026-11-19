import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { RETURN_WINDOW_DAYS } from "@/lib/domain/return-window";

import { getMyOrderContract } from "./contract-api";
import { isApiError } from "./errors";
import { orderKeys } from "./queries";
import { isValidOrderId } from "./schemas";

const retryTransient = (failureCount: number, error: unknown) =>
  !(isApiError(error) && error.isClientError) && !(error instanceof z.ZodError) && failureCount < 2;

/** The order's contract once sent; `data` is null while it has none (the card is left out). */
export function useMyOrderContract(orderId: string) {
  return useQuery({
    queryKey: orderKeys.contract(orderId),
    queryFn: ({ signal }) => getMyOrderContract(orderId, signal),
    enabled: isValidOrderId(orderId),
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
}

/**
 * The order's return window in days from each delivery (Luật Thương mại Điều 318, WF-05 TH-1): the
 * complaint period its contract agreed, else the BE's configured default — what BE
 * `ReturnRequestService.policyOf` reads. `isPending` while the contract is still loading.
 */
export function useReturnWindowDays(orderId: string): { days: number; isPending: boolean } {
  const contract = useMyOrderContract(orderId);
  return {
    days: contract.data?.returnWindowDays ?? RETURN_WINDOW_DAYS,
    isPending: contract.isPending && contract.fetchStatus !== "idle",
  };
}
