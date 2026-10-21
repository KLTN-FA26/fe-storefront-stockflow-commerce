import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { retryTransient } from "@/lib/api/retry";

import { getPaymentTerms } from "./checkout-api";

export const checkoutKeys = {
  all: ["checkout"] as const,
  paymentTerms: () => [...checkoutKeys.all, "payment-terms"] as const,
};

/** The payment terms the signed-in customer may order on; Sales can change them at any time, so short-lived. */
export function useCheckoutPaymentTerms(enabled = true) {
  return useQuery({
    queryKey: checkoutKeys.paymentTerms(),
    queryFn: ({ signal }) => getPaymentTerms(signal),
    enabled,
    retry: retryTransient,
    ...QUERY_TIMES.list,
  });
}
