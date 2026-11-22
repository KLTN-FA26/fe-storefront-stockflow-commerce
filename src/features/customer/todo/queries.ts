import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { ORDERS_QUERY_ROOT } from "@/lib/api/query-keys";
import { isDueNow, useMyInstallments, type Installment } from "@/lib/installments";

import { countContractsToSign, countQuotesToAnswer } from "./api";

/**
 * Under the roots the quote and order features invalidate (`["quotes", "list"]`, `["orders"]`):
 * answering a quote or a contract that moves refreshes the strip too.
 */
export const todoKeys = {
  quotes: ["quotes", "list", "todo"] as const,
  contracts: [...ORDERS_QUERY_ROOT, "list", "todo"] as const,
};

export function useQuotesToAnswer(enabled: boolean) {
  return useQuery({
    queryKey: todoKeys.quotes,
    queryFn: ({ signal }) => countQuotesToAnswer(signal),
    enabled,
    ...QUERY_TIMES.list,
  });
}

export function useContractsToSign(enabled: boolean) {
  return useQuery({
    queryKey: todoKeys.contracts,
    queryFn: ({ signal }) => countContractsToSign(signal),
    enabled,
    ...QUERY_TIMES.list,
  });
}

/** Enough rows for one customer's open installments of one status. */
const INSTALLMENT_ROWS = 50;

export type InstallmentsToPay = { due: number; overdue: number };

/**
 * The installments to pay now, by the same rule as the payments page it links to (`isDueNow`).
 * Overdue is the BE's flag (WF-05 fix plan §8).
 */
export function installmentsToPay(rows: readonly Installment[]): InstallmentsToPay {
  const now = rows.filter(isDueNow);
  return { due: now.length, overdue: now.filter((row) => row.overdue).length };
}

export function useInstallmentsToPay(enabled: boolean) {
  const due = useMyInstallments({ status: "DUE", page: 0, size: INSTALLMENT_ROWS }, enabled);
  const partial = useMyInstallments(
    { status: "PARTIALLY_PAID", page: 0, size: INSTALLMENT_ROWS },
    enabled,
  );
  const data =
    due.data && partial.data
      ? installmentsToPay([...due.data.items, ...partial.data.items])
      : undefined;
  return {
    data,
    isPending: due.isPending || partial.isPending,
    isError: due.isError || partial.isError,
    isFetching: due.isFetching || partial.isFetching,
    refetch: () => Promise.all([due.refetch(), partial.refetch()]),
  };
}
