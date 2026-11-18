import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { QUERY_TIMES } from "@/lib/api/query-client";

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
