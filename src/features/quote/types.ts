import type { z } from "zod";

import type {
  quoteAcceptanceInputSchema,
  quoteChangeRequestInputSchema,
  quoteDtoSchema,
  quoteFeeDtoSchema,
  quoteLineDtoSchema,
  quoteRowDtoSchema,
  quoteStatusSchema,
  quoteTierDtoSchema,
  quoteTotalsDtoSchema,
  quoteTransitionDtoSchema,
} from "./schemas";

export type QuoteStatus = z.infer<typeof quoteStatusSchema>;
export type QuoteTier = z.infer<typeof quoteTierDtoSchema>;
export type QuoteLine = z.infer<typeof quoteLineDtoSchema>;
export type QuoteFee = z.infer<typeof quoteFeeDtoSchema>;
export type QuoteTotals = z.infer<typeof quoteTotalsDtoSchema>;
export type QuoteTransition = z.infer<typeof quoteTransitionDtoSchema>;
/** One quote in full (BE QuoteResponse). */
export type Quote = z.infer<typeof quoteDtoSchema>;
/** One row of the quote list (BE QuoteRowResponse). */
export type QuoteRow = z.infer<typeof quoteRowDtoSchema>;
export type QuoteAcceptanceInput = z.input<typeof quoteAcceptanceInputSchema>;
export type QuoteChangeRequestInput = z.input<typeof quoteChangeRequestInputSchema>;

/** The status filter of the list: one status, or every one. */
export type QuoteStatusFilter = Exclude<QuoteStatus, "DRAFT" | "UNKNOWN">;

export interface MyQuotesParams {
  /** 1-based, as the URL has it. */
  page: number;
  size: number;
  status?: QuoteStatusFilter | null;
}

/** One page of quotes on the FE side: `page` is 1-based, the rest is the BE PageResponse. */
export interface QuotePage {
  items: QuoteRow[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
