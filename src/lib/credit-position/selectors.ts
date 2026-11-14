import type { CreditPosition } from "./schemas";

/** What the account page shows of the customer's credit. */
export interface CreditSummary {
  currency: CreditPosition["currency"];
  /** The customer was given credit (a limit, even of zero); without it only what is owed is shown. */
  hasCredit: boolean;
  /** The credit limit; 0 for a customer given credit with no room yet. */
  limit: number;
  /** What the installments paid after delivery and the unpaid cancellation fees still owe. */
  exposure: number;
  /** What a new contract paying after delivery may still use; never below zero. */
  available: number;
  /** Days to pay after delivery; undefined when the BE sends none. */
  termDays: number | undefined;
  overdue: boolean;
  overdueAmount: number;
  /** ISO date of the earliest overdue due date; undefined when nothing is overdue. */
  oldestOverdueDueDate: string | undefined;
}

/**
 * The credit position to show, or undefined when there is nothing to tell: no credit limit at all and
 * nothing owed. A customer who owes something (a cancellation fee, an overdue installment) sees it
 * even without credit, so an overdue warning is never hidden.
 */
export function creditSummary(position: CreditPosition): CreditSummary | undefined {
  const hasCredit = position.creditLimit != null;
  if (!hasCredit && position.exposure <= 0 && !position.hasOverdue) return undefined;
  const limit = position.creditLimit ?? 0;
  return {
    currency: position.currency,
    hasCredit,
    limit,
    exposure: position.exposure,
    available: position.availableCredit ?? Math.max(0, limit - position.exposure),
    termDays: position.creditTermDays ?? undefined,
    overdue: position.hasOverdue,
    overdueAmount: position.overdueAmount,
    oldestOverdueDueDate: position.oldestOverdueDueDate ?? undefined,
  };
}
