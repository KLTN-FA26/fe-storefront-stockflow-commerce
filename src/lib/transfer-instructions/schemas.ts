import { z } from "zod";

import { currencySchema } from "@/lib/catalog/schemas";
import { beId } from "@/lib/validation/primitives";
import { tolerantEnum } from "@/lib/validation/tolerant-enum";

/** BE TransferInstructions.DueBy: when the amount is wanted. NONE means there is nothing to transfer now. */
export const TRANSFER_DUE_BY = ["TO_CONFIRM", "BEFORE_DELIVERY", "NONE"] as const;

/**
 * GET /orders/me/{orderId}/transfer-instructions (BE TransferInstructionsResponse): the shop's bank
 * account, the transfer content (the order number) and what is still due now. A `dueBy` newer than
 * this FE reads as UNKNOWN and is shown like a due amount without a deadline.
 */
export const transferInstructionsDtoSchema = z.object({
  orderId: beId(),
  orderNumber: z.string().min(1),
  bankName: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
  // What to write as the transfer content; the BE sets it to the order number.
  transferReference: z.string(),
  amountDue: z.number().nonnegative(),
  currency: currencySchema,
  dueBy: tolerantEnum(TRANSFER_DUE_BY),
  // dueBy in words, in the caller's language; may be absent (NON_NULL).
  dueByNote: z.string().nullish(),
});

export type TransferInstructions = z.infer<typeof transferInstructionsDtoSchema>;
