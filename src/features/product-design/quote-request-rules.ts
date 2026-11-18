import { isReturned } from "./lifecycle";
import type { Design } from "./types";

// The rules of a customer's quote request on a design or a project (docs 12 §4.8, §4.11; BE
// `QuoteRequestRules`, `DesignProjectController.ProjectQuoteRequest`). Client-side only: the BE
// checks every one of them again.

/** The most cartons one request asks (BE `QuoteRequestRules.MAX_CARTONS`); a suggestion only (14 BR-22). */
export const MAX_QUOTE_CARTONS = 1_000_000;

/** A project request names 1 to 20 approved designs (BE `@Size(min = 1, max = 20)`, docs 12 §4.11.34). */
export const MAX_PROJECT_QUOTE_LINES = 20;

const VN_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day of `at` in Vietnam, `YYYY-MM-DD` (the BE's `BusinessCalendar.date`). */
export function vnDateOf(at: Date): string {
  const parts = VN_DAY.formatToParts(at);
  const part = (type: "year" | "month" | "day") => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Today in Vietnam: the earliest desired delivery date a request may name (today itself allowed). */
export const vnToday = () => vnDateOf(new Date());

/**
 * Whether a design can carry a quote request worth reading: an approved one (asked from its card),
 * one waiting for review (asked with its submission) and a returned draft (its request follows it,
 * B40). Any other draft has never been asked about, so its card reads nothing.
 */
export const mayHaveQuoteRequest = (design: Pick<Design, "status" | "lastReturn">): boolean =>
  design.status === "APPROVED" || design.status === "PENDING_REVIEW" || isReturned(design);
