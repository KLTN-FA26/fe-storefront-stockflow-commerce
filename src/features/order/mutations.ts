import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/shared/Toast";
import type { ApiError } from "@/lib/api/error";
import { myPermissionKeys } from "@/lib/auth/my-permissions";

import { cancelMyOrder } from "./api";
import { orderKeys, type KnownCancellationRequest } from "./queries";
import type { CancelOrderInput, CancellationResult } from "./types";

/**
 * Cancelling re-reads the list and the order when it settles, success or not:
 * a 409 CONFLICT (status moved on) or 404 NOT_FOUND means the cached order is already stale.
 * A 403 means the permission list the screen relied on is out of date (BE: "refetch after a
 * 403"), so it is re-read too and the cancel button disappears.
 *
 * The BE answers a cancel with CANCELLED (done) or REQUESTED (202: Sales decide). A request is
 * remembered in the cache so the screen can show it as pending; so is the 409
 * ORDER_CANCELLATION_REQUEST_PENDING a repeat gets.
 * Errors are shown inline by the caller (describeError), so they are not toasted here.
 */
export function useCancelMyOrder() {
  const queryClient = useQueryClient();
  const remember = (orderId: string, request: KnownCancellationRequest) =>
    queryClient.setQueryData(orderKeys.cancellationRequest(orderId), request);

  return useMutation<CancellationResult, ApiError, CancelOrderInput>({
    mutationFn: cancelMyOrder,
    onSuccess: (outcome, { orderId }) => {
      if (outcome.result === "REQUESTED") {
        remember(orderId, { requestId: outcome.requestId ?? null });
        toast.success("Đã gửi yêu cầu huỷ", "Sales sẽ xem xét và liên hệ với bạn.");
      } else if (outcome.result === "CANCELLED") {
        toast.success("Đã huỷ đơn hàng");
      } else {
        toast.info("Đã ghi nhận yêu cầu huỷ");
      }
    },
    onError: (error, { orderId }) => {
      if (error.code === "ORDER_CANCELLATION_REQUEST_PENDING")
        remember(orderId, { requestId: null });
    },
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
