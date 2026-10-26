import { api } from "@/lib/api/client";

import { parsePaymentTerms, type PaymentTermsDto } from "./schemas";

/**
 * GET /orders/payment-terms (BE CreditHoldController.myTerms, sales-orders:CREATE scope OWN): the
 * payment terms the signed-in customer may use, their default, the deposit share and the customer's
 * own credit position. Own customer only, taken from the token; a sign-in without a customer
 * profile is 404 CUSTOMER_NOT_FOUND.
 */
export async function getPaymentTerms(signal?: AbortSignal): Promise<PaymentTermsDto> {
  const { data } = await api.get<unknown>("/orders/payment-terms", signal ? { signal } : {});
  return parsePaymentTerms(data);
}
