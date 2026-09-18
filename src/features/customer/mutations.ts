import { createMutation } from "@/lib/api/query-factory";
import { createAddress, updateAddress, deleteAddress, setAddressDefault } from "./api";
import { customerAddressKeys } from "./queries";
import type { AddressFormValues } from "./schemas";
import type { Address } from "./types";

export const useCreateAddress = createMutation<AddressFormValues, Address>(createAddress, {
  invalidate: [customerAddressKeys.all],
  successMessage: "Đã thêm địa chỉ mới",
});

export const useUpdateAddress = createMutation<{ id: string; data: AddressFormValues }, Address>(
  updateAddress,
  {
    invalidate: [customerAddressKeys.all],
    successMessage: "Đã cập nhật địa chỉ",
  }
);

export const useDeleteAddress = createMutation<string, void>(deleteAddress, {
  invalidate: [customerAddressKeys.all],
  successMessage: "Đã xoá địa chỉ",
});

export const useSetAddressDefault = createMutation<string, void>(setAddressDefault, {
  invalidate: [customerAddressKeys.all],
  successMessage: "Đã đặt làm mặc định",
});
