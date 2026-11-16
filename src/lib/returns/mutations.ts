import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/shared/Toast";
import type { ApiError } from "@/lib/api/error";
import { ORDERS_QUERY_ROOT } from "@/lib/api/query-keys";

import { addMyReturnPhoto, cancelMyReturn, openMyReturn } from "./api";
import { returnKeys } from "./queries";
import type { CustomerReturn, OpenReturnInput } from "./schemas";

/**
 * Mở / rút yêu cầu đổi trạng thái đơn (DELIVERED ↔ RETURN_REQUESTED): làm mới mọi thứ dưới gốc
 * `orders` — đơn, danh sách đơn, trả hàng của đơn.
 */
function useRefreshOrders() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_ROOT });
}

export function useOpenMyReturn() {
  const refresh = useRefreshOrders();
  const queryClient = useQueryClient();
  return useMutation<CustomerReturn, ApiError, OpenReturnInput>({
    mutationFn: openMyReturn,
    onSuccess: (opened) => {
      queryClient.setQueryData(returnKeys.detail(opened.id), opened);
    },
    onSettled: refresh,
  });
}

/** Ảnh tải lần lượt: lỗi của một ảnh không chặn các ảnh khác; người gọi hiện lỗi từng ảnh. */
export function useAddMyReturnPhoto() {
  const queryClient = useQueryClient();
  return useMutation<CustomerReturn, ApiError, { returnId: string; file: File }>({
    mutationFn: ({ returnId, file }) => addMyReturnPhoto(returnId, file),
    onSuccess: (updated) => {
      queryClient.setQueryData(returnKeys.detail(updated.id), updated);
    },
    onSettled: (_data, _error, { returnId }) =>
      queryClient.invalidateQueries({ queryKey: returnKeys.detail(returnId) }),
  });
}

export function useCancelMyReturn() {
  const refresh = useRefreshOrders();
  return useMutation<CustomerReturn, ApiError, { returnId: string; reason?: string }>({
    mutationFn: ({ returnId, reason }) => cancelMyReturn(returnId, reason),
    onSuccess: () => toast.success("Đã rút yêu cầu trả hàng"),
    onSettled: refresh,
  });
}
