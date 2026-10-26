import { describe, expect, it } from "vitest";

import { createMockAddressBook, seedMockAddresses, type MockAddress } from "./customer-addresses";

const CUSTOMER = "CUS-TEST";
const [shipDefault, shipOther, billDefault] = seedMockAddresses(CUSTOMER) as [
  MockAddress,
  MockAddress,
  MockAddress,
];

const newBody = (overrides: Record<string, unknown> = {}) => ({
  type: "SHIPPING",
  recipientName: "Lê Văn C",
  phone: "0901234567",
  line1: "1 Lê Duẩn",
  wardCode: "26734",
  wardName: "Phường Sài Gòn",
  provinceCode: "79",
  provinceName: "Thành phố Hồ Chí Minh",
  countryCode: "VN",
  defaultAddress: false,
  ...overrides,
});

function listOf(book: ReturnType<typeof createMockAddressBook>) {
  return (book.list().data as { data: MockAddress[] }).data;
}
const defaults = (book: ReturnType<typeof createMockAddressBook>) =>
  listOf(book)
    .filter((a) => a.defaultAddress)
    .map((a) => [a.type, a.addressId]);

describe("mock address book mirrors BE Customer rules", () => {
  it("makes the first address of a type its default", () => {
    const book = createMockAddressBook(CUSTOMER, []);
    const created = book.add(newBody());
    expect(created.status).toBe(201);
    expect((created.data as { data: MockAddress }).data.defaultAddress).toBe(true);
  });

  it("keeps one default per type: a new default shipping leaves billing alone", () => {
    const book = createMockAddressBook(CUSTOMER, seedMockAddresses(CUSTOMER));
    const created = (book.add(newBody({ defaultAddress: true })).data as { data: MockAddress })
      .data;
    expect(defaults(book)).toEqual(
      [
        ["BILLING", billDefault.addressId],
        ["SHIPPING", created.addressId],
      ].sort(),
    );
  });

  it("keeps the only default when the customer unticks it (mustRemainDefault)", () => {
    const book = createMockAddressBook(CUSTOMER, seedMockAddresses(CUSTOMER));
    const res = book.update(shipDefault.addressId, {
      ...newBody(),
      defaultAddress: false,
      version: 0,
    });
    expect((res.data as { data: MockAddress }).data.defaultAddress).toBe(true);
  });

  it("promotes another address of the same type when the default is deleted", () => {
    const book = createMockAddressBook(CUSTOMER, seedMockAddresses(CUSTOMER));
    expect(book.remove(shipDefault.addressId).status).toBe(204);
    expect(listOf(book).find((a) => a.addressId === shipOther.addressId)?.defaultAddress).toBe(
      true,
    );
    expect(listOf(book).find((a) => a.addressId === billDefault.addressId)?.defaultAddress).toBe(
      true,
    );
  });

  it("answers 409 OPTIMISTIC_LOCK for a stale version", () => {
    const book = createMockAddressBook(CUSTOMER, seedMockAddresses(CUSTOMER));
    const res = book.update(shipOther.addressId, { ...newBody(), version: 7 });
    expect(res).toMatchObject({
      status: 409,
      data: { success: false, errorCode: "OPTIMISTIC_LOCK" },
    });
  });

  it("answers 400 VALIDATION_FAILED with per-field errors like SaveAddressRequest", () => {
    const book = createMockAddressBook(CUSTOMER, []);
    const res = book.add(newBody({ wardCode: "", phone: "0123456789" }));
    expect(res).toMatchObject({ status: 400, data: { errorCode: "VALIDATION_FAILED" } });
    const fields = (res.data as { fieldErrors: { field: string }[] }).fieldErrors.map(
      (e) => e.field,
    );
    expect(fields).toEqual(expect.arrayContaining(["wardCode", "phone"]));
  });

  it("answers 404 ADDRESS_NOT_FOUND for an unknown address", () => {
    const book = createMockAddressBook(CUSTOMER, []);
    expect(book.makeDefault("missing")).toMatchObject({
      status: 404,
      data: { errorCode: "ADDRESS_NOT_FOUND" },
    });
  });
});
