import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { retryTransient } from "@/lib/api/retry";

import { getPaymentTerms } from "./api";

export const paymentTermsKeys = {
  all: ["payment-terms"] as const,
};

/**
 * The payment terms and credit position of the signed-in customer. Sales can change them at any
 * time and every order moves the balance, so short-lived; placing an order invalidates it.
 */
export function usePaymentTerms(enabled = true) {
  return useQuery({
    queryKey: paymentTermsKeys.all,
    queryFn: ({ signal }) => getPaymentTerms(signal),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}
