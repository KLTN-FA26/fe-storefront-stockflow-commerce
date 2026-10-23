import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { currencySchema } from "@/lib/catalog/schemas";
import { beId } from "@/lib/validation/primitives";
import { tolerantEnum } from "@/lib/validation/tolerant-enum";

/** BE payment.domain.ReceivableStatus (kltn-docs 15 §5.3). */
export const RECEIVABLE_STATUSES = ["OPEN", "PARTIALLY_PAID", "OVERDUE", "PAID"] as const;
export const receivableStatusSchema = tolerantEnum(RECEIVABLE_STATUSES);

/** BE ReceivableKind: what the debt is for. */
export const RECEIVABLE_KINDS = ["CREDIT_ORDER", "CANCELLATION_FEE", "DEPOSIT_BALANCE"] as const;
export const receivableKindSchema = tolerantEnum(RECEIVABLE_KINDS);

/**
 * One row of GET /receivables/me (BE ReceivableResponse). Jackson drops null fields, so the
 * optional ones are nullish; `allocations` is only on the staff detail and not read. The customer's
 * own list never holds the carrier-collected ones (BE filters collector=CUSTOMER).
 */
export const receivableDtoSchema = z.object({
  receivableId: beId(),
  orderId: beId(),
  // BE SCRUM-193; absent on an older BE or a row older than the column.
  orderNumber: z.string().min(1).nullish(),
  kind: receivableKindSchema.nullish(),
  amount: z.number().nonnegative(),
  paidAmount: z.number().nonnegative(),
  outstanding: z.number().nonnegative(),
  currency: currencySchema,
  // LocalDate, "YYYY-MM-DD".
  dueDate: z.string().nullish(),
  status: receivableStatusSchema,
});

export const receivablePageDtoSchema = pageResponseSchema(receivableDtoSchema);

export type Receivable = z.infer<typeof receivableDtoSchema>;
export type ReceivableStatus = z.infer<typeof receivableStatusSchema>;
export type ReceivablePage = z.infer<typeof receivablePageDtoSchema>;
