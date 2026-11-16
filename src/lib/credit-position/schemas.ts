import { z } from "zod";

import { beId, currencySchema, isoDate } from "@/lib/validation/primitives";

/**
 * GET /orders/credit-position/me (BE CreditHoldController.myCredit, CreditPositionResponse; kltn-docs
 * 15 §4.3, BR-10; 18 §2 "vị thế tín dụng"). Replaces GET /orders/payment-terms since the BE moved
 * payment to the contract's installments (4B-10). Jackson drops null fields (NON_NULL).
 */
export const creditPositionDtoSchema = z.object({
  customerId: beId(),
  // Absent without credit.
  creditLimit: z.number().nonnegative().nullish(),
  // Days to pay after delivery; absent without credit.
  creditTermDays: z.number().int().nonnegative().nullish(),
  // What the AFTER_DELIVERY installments of signed contracts still owe (not yet due included) and the
  // cancellation fees not paid (15 BR-10).
  exposure: z.number().nonnegative(),
  // Limit minus exposure, never below zero; absent without credit.
  availableCredit: z.number().nonnegative().nullish(),
  currency: currencySchema,
  // An installment past its due date: a contract signed now is held for accounting.
  hasOverdue: z.boolean(),
  overdueAmount: z.number().nonnegative(),
  oldestOverdueDueDate: isoDate.nullish(),
});

export type CreditPosition = z.infer<typeof creditPositionDtoSchema>;
