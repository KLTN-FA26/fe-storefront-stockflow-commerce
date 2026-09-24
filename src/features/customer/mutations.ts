import { createMutation } from "@/lib/api/query-factory";
import { createAddress, deleteAddress, setAddressDefault, updateAddress } from "./api";
import { customerAddressKeys } from "./queries";
import type { SaveAddressInput } from "./schemas";
import type { CustomerAddressDto } from "./types";

export const useCreateAddress = createMutation<SaveAddressInput, CustomerAddressDto>(
  createAddress,
  {
    invalidate: [customerAddressKeys.all],
    successMessage: "Đã thêm địa chỉ mới",
  },
);

export const useUpdateAddress = createMutation<
  { addressId: string; data: SaveAddressInput },
  CustomerAddressDto
>(updateAddress, {
  invalidate: [customerAddressKeys.all],
  successMessage: "Đã cập nhật địa chỉ",
});

export const useDeleteAddress = createMutation<string, void>(deleteAddress, {
  invalidate: [customerAddressKeys.all],
  successMessage: "Đã xoá địa chỉ",
});

export const useSetAddressDefault = createMutation<string, CustomerAddressDto>(setAddressDefault, {
  invalidate: [customerAddressKeys.all],
  successMessage: "Đã đặt làm mặc định",
});
