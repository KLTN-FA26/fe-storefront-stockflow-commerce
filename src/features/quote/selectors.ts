import { tierFor } from "@/lib/domain/quote-pricing";

import type { Quote, QuoteLine, QuoteTransition } from "./types";

// The preview math lives in `lib/domain/quote-pricing` (shared with the chat QUOTE card's acceptance
// dialog); the quote screens keep importing it from here.
export {
  cartonsBySku,
  feeTotals,
  moqOf,
  previewAcceptance,
  tierFor,
  unitsOf,
  vatOf,
  type LinePreview,
  type QuotePreview,
} from "@/lib/domain/quote-pricing";

/** What a line shows read only: the accepted figures once accepted, the proposed ones before. */
export function shownLine(line: QuoteLine) {
  const accepted = line.acceptedCartons != null;
  const cartons = accepted ? line.acceptedCartons : line.cartons;
  return {
    cartons: cartons ?? null,
    units: accepted ? (line.acceptedUnits ?? line.units) : line.units,
    unitPrice: accepted ? line.acceptedUnitPrice : line.proposedUnitPrice,
    lineTotal: accepted ? line.acceptedLineTotal : line.proposedLineTotal,
    tax: accepted ? line.acceptedTax : line.proposedTax,
    tier: cartons == null ? null : tierFor(line.tiers, cartons),
  };
}

/** The totals the BE answered: the accepted ones once accepted, the proposed ones before. */
export const shownTotals = (quote: Pick<Quote, "accepted" | "proposed">) =>
  quote.accepted ?? quote.proposed ?? null;

/** One history row as the customer reads it; `revision` is null when the revision was never theirs. */
export type CustomerHistoryEntry = Omit<QuoteTransition, "revision"> & { revision: number | null };

/**
 * The history a customer reads. The BE now filters the rows that enter DRAFT itself (BE-9), so the
 * DRAFT filter here is defensive and harmless. The revision-null branch is still needed: a CANCELLED
 * row out of DRAFT past the revision the customer was shown (a draft Sale dropped) must not read
 * "bản sửa 2" next to "Bản sửa Số 1".
 */
export function customerHistory(
  history: readonly QuoteTransition[],
  revision: number,
): CustomerHistoryEntry[] {
  return history
    .filter((entry) => entry.toStatus !== "DRAFT")
    .map((entry) =>
      entry.fromStatus === "DRAFT" && entry.revision > revision
        ? { ...entry, revision: null }
        : entry,
    );
}
