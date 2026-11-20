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
 * The history a customer reads. The BE sends every row; two kinds were never the customer's to see:
 * a row that enters DRAFT (the quote being drawn up, or Sale reopening a sent quote to revise it,
 * PR #388) and the revision number of a draft Sale dropped (a CANCELLED row out of DRAFT past the
 * revision the customer was shown: it must not read "bản sửa 2" next to "Bản sửa Số 1").
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
