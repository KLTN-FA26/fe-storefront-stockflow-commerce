import { useMemo } from "react";

import { useAvailability, usePrices } from "@/lib/catalog/queries";
import { isForbiddenError } from "@/lib/api/describe-error";
import { useHydrated } from "@/hooks/use-hydrated";
import { useCartStore } from "@/lib/store/use-cart-store";

import { buildCartView } from "./selectors";

export type CartViewStatus = "loading" | "ready" | "restricted" | "error";

/**
 * The cart joined with the customer's live price list and stock. The cart itself is in the
 * browser, so nothing is shown before hydration; with no lines nothing is asked of the BE.
 */
export function useCartView(enabled: boolean) {
  const hydrated = useHydrated();
  const lines = useCartStore((state) => state.lines);
  const skus = useMemo(() => lines.map((line) => line.sku), [lines]);
  const active = enabled && hydrated && skus.length > 0;
  const stock = useAvailability(skus, active);
  const prices = usePrices(skus, active);

  const view = useMemo(
    () => buildCartView(hydrated ? lines : [], prices.data ?? [], stock.data ?? []),
    [hydrated, lines, prices.data, stock.data],
  );
  const error = stock.error ?? prices.error;
  const status: CartViewStatus =
    !hydrated || (active && (stock.isPending || prices.isPending))
      ? "loading"
      : isForbiddenError(error)
        ? "restricted"
        : error
          ? "error"
          : "ready";

  return {
    hydrated,
    view,
    status,
    error,
    isFetching: stock.isFetching || prices.isFetching,
    refetch: () => Promise.all([stock.refetch(), prices.refetch()]),
  };
}
