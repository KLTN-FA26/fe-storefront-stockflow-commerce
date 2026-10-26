import { api } from "@/lib/api/client";

import { transferInstructionsDtoSchema, type TransferInstructions } from "./schemas";

/**
 * GET /orders/me/{orderId}/transfer-instructions (BE OrderController, sales-orders:READ scope OWN).
 * Another customer's order answers 404; a shop that has not set its bank account answers 503
 * TRANSFER_INSTRUCTIONS_UNAVAILABLE.
 */
export async function getTransferInstructions(
  orderId: string,
  signal?: AbortSignal,
): Promise<TransferInstructions> {
  const { data } = await api.get<unknown>(
    `/orders/me/${encodeURIComponent(orderId)}/transfer-instructions`,
    signal ? { signal } : {},
  );
  return transferInstructionsDtoSchema.parse(data);
}
