import { describe, expect, it } from "vitest";

import { addressFormSchema, customerAddressDtoSchema, saveAddressRequestSchema } from "./schemas";
import {
  EMPTY_ADDRESS_FORM,
  formatAddressLine,
  groupAddressesByType,
  toSaveAddressRequest,
} from "./selectors";
import type { CustomerAddressDto } from "./types";

const dto: CustomerAddressDto = {
  addressId: "6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60",
  customerId: "9d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f",
  type: "SHIPPING",
  recipientName: "Nguyễn Hoài Nam",
  phone: "+84908111222",
  line1: "12 Nguyễn Huệ",
  wardCode: "26734",
  wardName: "Phường Sài Gòn",
  provinceCode: "79",
  provinceName: "Thành phố Hồ Chí Minh",
  countryCode: "VN",
  defaultAddress: true,
  version: 2,
};

const validForm = {
  ...EMPTY_ADDRESS_FORM,
  recipientName: "Nguyễn Hoài Nam",
  phone: "0901234567",
  line1: "12 Nguyễn Huệ",
  provinceCode: "79",
  provinceName: "Thành phố Hồ Chí Minh",
  wardCode: "26734",
  wardName: "Phường Sài Gòn",
};

describe("customerAddressDtoSchema (BE CustomerAddressResponse)", () => {
  it("parses a response where NON_NULL dropped line2/postalCode", () => {
    expect(customerAddressDtoSchema.parse(dto)).toEqual(dto);
  });

  it("rejects unknown address types and non-UUID address ids", () => {
    expect(() => customerAddressDtoSchema.parse({ ...dto, type: "HOME" })).toThrow();
    expect(() => customerAddressDtoSchema.parse({ ...dto, addressId: "ADDR-1" })).toThrow();
  });
});

// The 11 numbers the reviewer checked against BE VietnamPhoneValidator.
describe("address phone matches BE VietnamPhoneValidator", () => {
  it.each([
    "0901234567",
    "+84901234567",
    "84901234567",
    "090 123 4567",
    "090.123.4567",
    "02438251234",
  ])("accepts %s", (phone) =>
    expect(addressFormSchema.safeParse({ ...validForm, phone }).success).toBe(true),
  );

  it.each(["0123456789", "0901234", "0901234567890", "0|00000000", "+84 (0) 901234567"])(
    "rejects %s",
    (phone) => expect(addressFormSchema.safeParse({ ...validForm, phone }).success).toBe(false),
  );
});

describe("address form → SaveAddressRequest", () => {
  it("requires ward and province picks with Vietnamese messages", () => {
    const result = addressFormSchema.safeParse({ ...validForm, wardCode: "", wardName: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("Vui lòng chọn phường/xã");
  });

  it("enforces BE size limits", () => {
    expect(
      addressFormSchema.safeParse({ ...validForm, recipientName: "a".repeat(201) }).success,
    ).toBe(false);
    expect(addressFormSchema.safeParse({ ...validForm, postalCode: "1".repeat(21) }).success).toBe(
      false,
    );
  });

  it("sends blank optional fields as null, VN country and the snapshot version", () => {
    const body = toSaveAddressRequest(addressFormSchema.parse({ ...validForm, line2: "  " }), 3);
    expect(body).toMatchObject({ line2: null, postalCode: null, countryCode: "VN", version: 3 });
    expect(saveAddressRequestSchema.parse(body)).toEqual(body);
  });
});

describe("address selectors", () => {
  it("formats line1, line2, ward, province in reading order", () => {
    expect(formatAddressLine({ ...dto, line2: "Tầng 5" })).toBe(
      "12 Nguyễn Huệ, Tầng 5, Phường Sài Gòn, Thành phố Hồ Chí Minh",
    );
  });

  it("groups shipping before billing with the default first", () => {
    const groups = groupAddressesByType([
      { ...dto, addressId: "a", type: "BILLING" },
      { ...dto, addressId: "b", defaultAddress: false },
      { ...dto, addressId: "c" },
    ]);
    expect(groups.map((g) => [g.type, g.items.map((i) => i.addressId)])).toEqual([
      ["SHIPPING", ["c", "b"]],
      ["BILLING", ["a"]],
    ]);
  });
});
