import { api } from "@/lib/api/client";

import { creditPositionDtoSchema, type CreditPosition } from "./schemas";

/** GET /orders/credit-position/me (sales-orders:READ scope OWN): the signed-in customer's credit. */
export async function getMyCreditPosition(signal?: AbortSignal): Promise<CreditPosition> {
  const { data } = await api.get<unknown>("/orders/credit-position/me", signal ? { signal } : {});
  return creditPositionDtoSchema.parse(data);
}
