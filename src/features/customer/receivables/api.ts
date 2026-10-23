import { api } from "@/lib/api/client";

import { receivablePageDtoSchema, type ReceivablePage } from "./schemas";

/**
 * GET /receivables/me (BE ReceivableController.mine, payment-receivables:READ scope OWN): what the
 * signed-in customer owes, earliest due first. `page` is zero-based, as the BE sends it.
 */
export async function getMyReceivables(
  params: { page: number; size: number },
  signal?: AbortSignal,
): Promise<ReceivablePage> {
  const { data } = await api.get<unknown>("/receivables/me", {
    params,
    ...(signal ? { signal } : {}),
  });
  return receivablePageDtoSchema.parse(data);
}
