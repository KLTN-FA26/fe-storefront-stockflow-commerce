import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ORDERS_QUERY_ROOT } from "@/lib/api/query-keys";
import type { ApiError } from "@/lib/api/error";
import { catalogReadKeys } from "@/lib/catalog/queries";

import { placeOrder } from "./checkout-api";
import { checkoutKeys } from "./checkout-queries";
import { isStaleCartError } from "./checkout-errors";
import type { PlaceOrderInput, PlacedOrder } from "./checkout-schemas";

/**
 * Placing an order re-reads what it changed: the order list, and stock. It does not empty the
 * cart: the screen does that in the same step in which it shows the order, because emptying it
 * here, a render earlier, would flash "Giỏ hàng trống" between the two. A failure that means the cart's prices or stock are out of date
 * re-reads those too, so the cart shows which line to fix. Errors are shown inline by the screen.
 */
export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation<PlacedOrder, ApiError, PlaceOrderInput>({
    mutationFn: placeOrder,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_ROOT }),
        queryClient.invalidateQueries({ queryKey: catalogReadKeys.availabilities() }),
      ]),
    onError: (error) => {
      // Sales changed the customer's terms since the checkout read them: read them again.
      if (error.code === "PAYMENT_TERM_NOT_ALLOWED") {
        return queryClient.invalidateQueries({ queryKey: checkoutKeys.paymentTerms() });
      }
      if (!isStaleCartError(error)) return;
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: catalogReadKeys.availabilities() }),
        queryClient.invalidateQueries({ queryKey: catalogReadKeys.prices() }),
      ]);
    },
  });
}
