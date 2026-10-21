import type { Currency } from "@/lib/domain/types";

import type { PaymentTermsDto } from "./schemas";

/** The customer's own credit position, as the account page and the checkout show it. */
export interface CreditSummary {
  currency: Currency;
  limit: number;
  /** What is owed on credit orders not yet delivered. */
  exposure: number;
  /** What can still be ordered on credit; never below zero. */
  available: number;
  /** Days to pay after delivery; undefined when the BE sends none. */
  termDays: number | undefined;
  /** An overdue receivable: new credit orders wait for approval whatever the limit says. */
  overdue: boolean;
}

const isCurrency = (value: string | null | undefined): value is Currency =>
  value === "VND" || value === "USD" || value === "CNY";

/**
 * The credit position, or undefined for a customer without credit (no limit, or a limit of zero):
 * there is nothing to show them.
 */
export function creditSummary(dto: PaymentTermsDto): CreditSummary | undefined {
  const limit = dto.creditLimit ?? 0;
  if (limit <= 0) return undefined;
  const exposure = dto.exposure ?? 0;
  return {
    currency: isCurrency(dto.currency) ? dto.currency : "VND",
    limit,
    exposure,
    available: Math.max(0, dto.availableCredit ?? limit - exposure),
    termDays: dto.creditTermDays ?? undefined,
    overdue: dto.hasOverdue === true,
  };
}

/**
 * What a credit order of `total` will meet: placed within the limit, held for approval because it is
 * above what is left, or held because a receivable is overdue. The BE decides (ON_HOLD); this only
 * tells the customer beforehand, it never blocks the order.
 */
export type CreditOutlook = "WITHIN_LIMIT" | "OVER_LIMIT" | "OVERDUE";

export function creditOutlook(credit: CreditSummary, total: number): CreditOutlook {
  if (credit.overdue) return "OVERDUE";
  return total > credit.available ? "OVER_LIMIT" : "WITHIN_LIMIT";
}
