import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/shared/Toast";
import type { ApiError } from "@/lib/api/error";
import { myPermissionKeys } from "@/lib/auth/my-permissions";

import { cancelMyOrder } from "./api";
import { orderKeys } from "./queries";
import type { CancelOrderInput } from "./types";

/**
 * Cancelling re-reads the list and the order when it settles, success or not:
 * a 409 CONFLICT (status moved on) or 404 NOT_FOUND means the cached order is already stale.
 * A 403 means the permission list the screen relied on is out of date (BE: "refetch after a
 * 403"), so it is re-read too and the cancel button disappears.
 * Errors are shown inline by the caller (describeError), so they are not toasted here.
 */
export function useCancelMyOrder() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, CancelOrderInput>({
    mutationFn: cancelMyOrder,
    onSuccess: () => toast.success("Đã huỷ đơn hàng"),
    onSettled: (_data, error, { orderId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) }),
        error?.status === 403
          ? queryClient.invalidateQueries({ queryKey: myPermissionKeys.all })
          : undefined,
      ]),
  });
}
