import { z } from "zod";

// ── GET /orders/payment-terms — what the signed-in customer may be sold on, and the credit they have
// left (BE CreditPosition). Jackson drops null fields (NON_NULL), so every optional field is nullish.
// SFCREDIT (lead, 21/10): the customer sees their own credit position, so it is parsed and shown. ──

const coreFields = {
  // Strings, not an enum: a term newer than this FE is dropped by resolvePaymentTerms, not a parse failure.
  allowedTerms: z.array(z.string()),
  defaultTerm: z.string().nullish(),
  // DEPOSIT only: the share of the total the customer's terms ask up front.
  depositPercent: z.number().gt(0).lt(100).nullish(),
  // DEPOSIT only: how the balance after the deposit is paid. Strings, not an enum: a policy newer
  // than this FE is dropped by the checkout, not a parse failure. Empty when deposits are not allowed.
  depositBalancePolicy: z.string().nullish(),
  allowedBalancePolicies: z.array(z.string()).nullish(),
};

// Credit orders: the limit, what is owed on credit orders not yet paid in full (it counts delivered
// orders that are still unpaid, too), the days to pay after delivery. Absent for a customer without credit.
const creditFields = {
  creditLimit: z.number().nonnegative().nullish(),
  creditTermDays: z.number().int().nonnegative().nullish(),
  exposure: z.number().nullish(),
  // Limit minus exposure (may be negative when over the limit); absent without credit.
  availableCredit: z.number().nullish(),
  currency: z.string().nullish(),
  // An overdue receivable: new credit orders wait for the credit approver.
  hasOverdue: z.boolean().nullish(),
  // What is still unpaid on the overdue receivables (0 when none) and the earliest of their due dates (ISO date).
  overdueAmount: z.number().nonnegative().nullish(),
  oldestOverdueDueDate: z.string().nullish(),
};

export const paymentTermsDtoSchema = z.object({
  ...coreFields,
  ...creditFields,
  // Set by parsePaymentTerms when the credit fields could not be read (see there); never sent by the BE.
  creditUnreadable: z.boolean().optional(),
});

export type PaymentTermsDto = z.infer<typeof paymentTermsDtoSchema>;

/**
 * The terms and the credit position are parsed apart: a credit field the BE sends in a shape this FE
 * does not expect must not take the payment-term selection down with it, which the checkout needs.
 * The terms are strict; the credit fields are all-or-nothing, and on a failure `creditUnreadable`
 * tells the screens to show no credit figures rather than wrong ones.
 */
export function parsePaymentTerms(data: unknown): PaymentTermsDto {
  const core = z.object(coreFields).parse(data);
  const credit = z.object(creditFields).safeParse(data);
  return credit.success ? { ...core, ...credit.data } : { ...core, creditUnreadable: true };
}
