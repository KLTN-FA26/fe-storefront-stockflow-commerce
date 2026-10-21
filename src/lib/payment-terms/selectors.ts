import type { Currency } from "@/lib/domain/types";

import type { PaymentTermsDto } from "./schemas";

/** The customer's own credit position, as the account page and the checkout show it. */
export interface CreditSummary {
  currency: Currency;
  limit: number;
  /** Owed on credit orders not yet paid in full, delivered ones included. */
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
 * The credit position, or undefined when there is nothing to tell the customer: the credit fields
 * could not be read, or credit is neither allowed nor given a limit. A customer who may order on
 * credit always gets one, even with a limit of zero: every credit order of theirs is held for
 * approval, and they should know before they find out from the order.
 */
export function creditSummary(dto: PaymentTermsDto): CreditSummary | undefined {
  if (dto.creditUnreadable) return undefined;
  const limit = dto.creditLimit ?? 0;
  if (limit <= 0 && !dto.allowedTerms.includes("CREDIT")) return undefined;
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
export type CreditOutlook = "WITHIN_LIMIT" | "OVER_LIMIT" | "OVERDUE" | "NO_LIMIT";

export function creditOutlook(credit: CreditSummary, total: number): CreditOutlook {
  if (credit.overdue) return "OVERDUE";
  if (credit.limit <= 0) return "NO_LIMIT";
  return total > credit.available ? "OVER_LIMIT" : "WITHIN_LIMIT";
}
