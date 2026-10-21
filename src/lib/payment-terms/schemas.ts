import { z } from "zod";

// ── GET /orders/payment-terms — what the signed-in customer may be sold on, and the credit they have
// left (BE CreditPosition). Jackson drops null fields (NON_NULL), so every optional field is nullish.
// SFCREDIT (lead, 21/10): the customer sees their own credit position, so it is parsed and shown. ──

export const paymentTermsDtoSchema = z.object({
  // Strings, not an enum: a term newer than this FE is dropped by resolvePaymentTerms, not a parse failure.
  allowedTerms: z.array(z.string()),
  defaultTerm: z.string().nullish(),
  // DEPOSIT only: the share of the total the customer's terms ask up front.
  depositPercent: z.number().gt(0).lt(100).nullish(),
  // Credit orders: the limit, what is owed on orders not yet delivered, the days to pay after delivery.
  // Absent for a customer without credit.
  creditLimit: z.number().nonnegative().nullish(),
  creditTermDays: z.number().int().nonnegative().nullish(),
  exposure: z.number().nullish(),
  // Limit minus exposure (may be negative when over the limit); absent without credit.
  availableCredit: z.number().nullish(),
  currency: z.string().nullish(),
  // An overdue receivable: new credit orders wait for the credit approver.
  hasOverdue: z.boolean().nullish(),
});

export type PaymentTermsDto = z.infer<typeof paymentTermsDtoSchema>;
