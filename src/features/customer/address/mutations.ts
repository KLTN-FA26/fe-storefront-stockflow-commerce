import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/shared/Toast";
import type { ApiError } from "@/lib/api/error";

import { createAddress, deleteAddress, setDefaultAddress, updateAddress } from "./api";
import { describeError } from "./errors";
import { customerAddressKeys } from "./queries";

/**
 * Every address mutation re-reads the list when it settles, success or not:
 *  - success: one save can flip defaultAddress/version of other rows (BE Customer.clearDefault);
 *  - failure: 404 ADDRESS_NOT_FOUND / 409 OPTIMISTIC_LOCK mean the cached list is already stale.
 * Create/update leave error display to the form (field errors, conflict reload), so they do not toast.
 */
function useAddressMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  { successMessage, toastError }: { successMessage: string; toastError: boolean },
) {
  const queryClient = useQueryClient();
  return useMutation<TResult, ApiError, TInput>({
    mutationFn,
    onSuccess: () => toast.success(successMessage),
    onError: (error) => {
      if (toastError) toast.error(describeError(error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: customerAddressKeys.lists() }),
  });
}

export const useCreateAddress = () =>
  useAddressMutation(createAddress, { successMessage: "Đã thêm địa chỉ mới", toastError: false });

export const useUpdateAddress = () =>
  useAddressMutation(updateAddress, { successMessage: "Đã cập nhật địa chỉ", toastError: false });

export const useDeleteAddress = () =>
  useAddressMutation(deleteAddress, { successMessage: "Đã xoá địa chỉ", toastError: true });

export const useSetDefaultAddress = () =>
  useAddressMutation(setDefaultAddress, {
    successMessage: "Đã đặt làm mặc định",
    toastError: true,
  });
