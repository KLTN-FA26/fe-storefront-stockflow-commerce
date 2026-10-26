import { ADDRESS_TYPES } from "./schemas";
import type {
  AddressFormInput,
  AddressFormValues,
  AddressType,
  CustomerAddressDto,
  SaveAddressRequest,
} from "./types";

export const ADDRESS_TYPE_LABELS: Record<AddressType, string> = {
  SHIPPING: "Giao hàng",
  BILLING: "Thanh toán",
};

export const EMPTY_ADDRESS_FORM: AddressFormInput = {
  type: "SHIPPING",
  recipientName: "",
  phone: "",
  line1: "",
  line2: "",
  provinceCode: "",
  provinceName: "",
  wardCode: "",
  wardName: "",
  postalCode: "",
  defaultAddress: false,
};

export function toAddressFormInput(address: CustomerAddressDto): AddressFormInput {
  return {
    type: address.type,
    recipientName: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? "",
    provinceCode: address.provinceCode,
    provinceName: address.provinceName,
    wardCode: address.wardCode,
    wardName: address.wardName,
    postalCode: address.postalCode ?? "",
    defaultAddress: address.defaultAddress,
  };
}

export function toSaveAddressRequest(
  values: AddressFormValues,
  version: number | null,
): SaveAddressRequest {
  return {
    ...values,
    line2: values.line2 || null,
    postalCode: values.postalCode || null,
    countryCode: "VN",
    version,
  };
}

/** Single-line address in Vietnamese reading order: line1, line2, ward, province. */
export function formatAddressLine(address: CustomerAddressDto): string {
  return [address.line1, address.line2, address.wardName, address.provinceName]
    .filter(Boolean)
    .join(", ");
}

/** Group by type (shipping first), default address first inside each group. */
export function groupAddressesByType(
  addresses: readonly CustomerAddressDto[],
): Array<{ type: AddressType; items: CustomerAddressDto[] }> {
  return ADDRESS_TYPES.map((type) => ({
    type,
    items: addresses
      .filter((address) => address.type === type)
      .sort((a, b) => Number(b.defaultAddress) - Number(a.defaultAddress)),
  })).filter((group) => group.items.length > 0);
}
