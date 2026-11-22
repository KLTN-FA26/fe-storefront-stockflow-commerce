import { parseAsInteger, parseAsStringLiteral } from "nuqs";

import { isPayable, type Installment, type InstallmentStatus } from "@/lib/installments";

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

// ── The "Thanh toán" page (SF-UX-39): every installment, what is overdue and due first. ──

/**
 * Its filter (`loc` in the URL). The BE takes one status and no "overdue", so the page reads the
 * customer's installments once and filters them here: "Quá hạn" is the most urgent and has its own.
 */
export const PAYMENT_FILTERS = ["can-tra", "qua-han", "chua-den-han", "da-tra", "tat-ca"] as const;
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];

export const PAYMENT_FILTER_LABEL: Record<PaymentFilter, string> = {
  "can-tra": "Cần thanh toán",
  "qua-han": "Quá hạn",
  "chua-den-han": "Chưa đến hạn",
  "da-tra": "Đã thanh toán",
  "tat-ca": "Tất cả",
};

export const paymentFilterParser = parseAsStringLiteral(PAYMENT_FILTERS)
  .withDefault("can-tra")
  .withOptions({ history: "push", scroll: false });

type Row = Pick<Installment, "status" | "overdue" | "outstanding" | "dueDate" | "seq">;

/** Owing now: due, partly paid or overdue, with money still to pay. */
const dueNow = (row: Row) =>
  isPayable(row) && (row.overdue || row.status === "DUE" || row.status === "PARTIALLY_PAID");

const MATCHES: Record<PaymentFilter, (row: Row) => boolean> = {
  "can-tra": dueNow,
  "qua-han": (row) => row.overdue && isPayable(row),
  "chua-den-han": (row) => row.status === "NOT_DUE" && !row.overdue,
  "da-tra": (row) => row.status === "PAID",
  "tat-ca": () => true,
};

/** Overdue first, then due now, then not due, then paid, then cancelled. */
function urgency(row: Row): number {
  if (row.overdue && isPayable(row)) return 0;
  if (dueNow(row)) return 1;
  if (row.status === "NOT_DUE") return 2;
  if (row.status === "PAID") return 3;
  return 4;
}

/** The rows a filter shows, most urgent first, then by due day (none last) and number. */
export function paymentRows<T extends Row>(rows: readonly T[], filter: PaymentFilter): T[] {
  return rows
    .filter(MATCHES[filter])
    .sort(
      (a, b) =>
        urgency(a) - urgency(b) ||
        (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
        a.seq - b.seq,
    );
}
