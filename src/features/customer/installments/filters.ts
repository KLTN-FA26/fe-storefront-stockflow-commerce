import { parseAsInteger, parseAsStringLiteral } from "nuqs";

import type { InstallmentStatus } from "@/lib/installments";

export const MY_INSTALLMENTS_PAGE_SIZE = 10;

/**
 * The status filter of the customer's installments (kltn-docs 15 §5.1). "ALL" sends no status; the
 * BE takes a single status, so "to pay" offers the two that still owe money as separate choices.
 */
export const INSTALLMENT_FILTERS = ["ALL", "DUE", "PARTIALLY_PAID", "NOT_DUE", "PAID"] as const;
export type InstallmentFilter = (typeof INSTALLMENT_FILTERS)[number];

export const INSTALLMENT_FILTER_LABEL: Record<InstallmentFilter, string> = {
  ALL: "Tất cả",
  DUE: "Đến hạn",
  PARTIALLY_PAID: "Trả một phần",
  NOT_DUE: "Chưa đến hạn",
  PAID: "Đã thanh toán",
};

export const filterToStatus = (filter: InstallmentFilter): InstallmentStatus | undefined =>
  filter === "ALL" ? undefined : filter;

/** URL state (nuqs): `dotTT` is the filter, `dotTrang` the 1-based page. */
export const installmentFilterParser = parseAsStringLiteral(INSTALLMENT_FILTERS)
  .withDefault("ALL")
  .withOptions({ history: "push", scroll: false });
export const installmentPageParser = parseAsInteger
  .withDefault(1)
  .withOptions({ history: "push", scroll: false });
