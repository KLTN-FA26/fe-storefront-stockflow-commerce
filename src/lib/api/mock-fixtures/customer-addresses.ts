/**
 * In-memory address book that mirrors the BE contract, for USE_MOCK=true and tests.
 *
 * Shapes follow `CustomerAddressResponse` / `SaveAddressRequest`; rules follow
 * `customer.internal.domain.Customer` (develop):
 *  - default is tracked per type (SHIPPING / BILLING), at most one per type;
 *  - the first address of a type becomes its default;
 *  - updating the current default keeps it default unless another default of that type exists;
 *  - deleting a default promotes another address of the same type;
 *  - a stale `version` → 409 OPTIMISTIC_LOCK.
 * Intentionally independent from mock-data.ts (legacy, non-BE shapes).
 */

export type MockAddressType = "SHIPPING" | "BILLING";

export interface MockAddress {
  addressId: string;
  customerId: string;
  type: MockAddressType;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  wardCode: string;
  wardName: string;
  provinceCode: string;
  provinceName: string;
  countryCode: string;
  postalCode?: string;
  defaultAddress: boolean;
  version: number;
}

export interface MockResult {
  status: number;
  data: unknown;
}

interface FieldError {
  field: string;
  message: string;
  code: string;
}

const ok = (status: number, data: unknown): MockResult => ({
  status,
  data: { success: true, data, timestamp: new Date().toISOString() },
});

const fail = (
  status: number,
  errorCode: string,
  message: string,
  fieldErrors?: FieldError[],
): MockResult => ({
  status,
  data: {
    success: false,
    errorCode,
    message,
    ...(fieldErrors?.length ? { fieldErrors } : {}),
    correlationId: `mock-${Date.now()}`,
    timestamp: new Date().toISOString(),
  },
});

// Mirrors BE VietnamPhoneValidator (separators stripped, +84/84/0 prefix, mobile or landline).
const PHONE_RE = /^(?:\+?84|0)(?:[35789]\d{8}|2\d{9})$/;

function validate(body: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  const text = (field: string) => (typeof body[field] === "string" ? (body[field] as string) : "");
  const required = (field: string, max: number) => {
    const value = text(field);
    if (!value.trim()) errors.push({ field, message: "không được để trống", code: "NotBlank" });
    else if (value.length > max)
      errors.push({ field, message: `kích thước phải từ 0 đến ${max}`, code: "Size" });
  };
  const optional = (field: string, max: number) => {
    if (text(field).length > max)
      errors.push({ field, message: `kích thước phải từ 0 đến ${max}`, code: "Size" });
  };

  if (!/^(SHIPPING|BILLING)$/.test(text("type")))
    errors.push({ field: "type", message: "không hợp lệ", code: "Pattern" });
  required("recipientName", 200);
  if (!PHONE_RE.test(text("phone").replace(/[\s.\-()]/g, "")))
    errors.push({ field: "phone", message: "Số điện thoại không hợp lệ", code: "VietnamPhone" });
  required("line1", 255);
  optional("line2", 255);
  required("wardCode", 20);
  required("wardName", 120);
  required("provinceCode", 20);
  required("provinceName", 120);
  if (text("countryCode") !== "VN")
    errors.push({
      field: "countryCode",
      message: "only VN addresses are supported",
      code: "Pattern",
    });
  optional("postalCode", 20);
  const version = body.version;
  if (version != null && (typeof version !== "number" || version < 0))
    errors.push({ field: "version", message: "phải lớn hơn hoặc bằng 0", code: "PositiveOrZero" });
  return errors;
}

/** NON_NULL serialisation: blank optional fields are omitted, like the BE response. */
function fromBody(
  addressId: string,
  customerId: string,
  body: Record<string, unknown>,
  version: number,
): MockAddress {
  const str = (field: string) => String(body[field] ?? "").trim();
  const address: MockAddress = {
    addressId,
    customerId,
    type: str("type") as MockAddressType,
    recipientName: str("recipientName"),
    phone: str("phone"),
    line1: str("line1"),
    wardCode: str("wardCode"),
    wardName: str("wardName"),
    provinceCode: str("provinceCode"),
    provinceName: str("provinceName"),
    countryCode: str("countryCode"),
    defaultAddress: body.defaultAddress === true,
    version,
  };
  if (str("line2")) address.line2 = str("line2");
  if (str("postalCode")) address.postalCode = str("postalCode");
  return address;
}

export function createMockAddressBook(customerId: string, seed: readonly MockAddress[]) {
  let addresses: MockAddress[] = seed.map((address) => ({ ...address }));
  let sequence = 0;

  const setDefault = (address: MockAddress, value: boolean): MockAddress =>
    address.defaultAddress === value
      ? address
      : { ...address, defaultAddress: value, version: address.version + 1 };

  const clearDefault = (type: MockAddressType) => {
    addresses = addresses.map((a) => (a.type === type ? setDefault(a, false) : a));
  };

  const ensureDefault = (type: MockAddressType) => {
    if (addresses.some((a) => a.type === type && a.defaultAddress)) return;
    const chosen = addresses
      .filter((a) => a.type === type)
      .sort((a, b) => a.addressId.localeCompare(b.addressId))[0];
    if (chosen)
      addresses = addresses.map((a) =>
        a.addressId === chosen.addressId ? setDefault(a, true) : a,
      );
  };

  const find = (addressId: string) => addresses.find((a) => a.addressId === addressId);
  const notFound = () => fail(404, "ADDRESS_NOT_FOUND", "Address not found");
  const invalid = (body: Record<string, unknown>) => {
    const errors = validate(body);
    return errors.length ? fail(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ", errors) : null;
  };

  return {
    customerId,
    list: (): MockResult => ok(200, addresses),

    add(body: Record<string, unknown>): MockResult {
      const error = invalid(body);
      if (error) return error;
      sequence += 1;
      const id = `00000000-0000-4000-8000-${String(Date.now() + sequence)
        .slice(-12)
        .padStart(12, "0")}`;
      const draft = fromBody(id, customerId, body, 0);
      const firstOfType = !addresses.some((a) => a.type === draft.type);
      const added = { ...draft, defaultAddress: draft.defaultAddress || firstOfType };
      if (added.defaultAddress) clearDefault(added.type);
      addresses.push(added);
      return ok(201, added);
    },

    update(addressId: string, body: Record<string, unknown>): MockResult {
      const current = find(addressId);
      if (!current) return notFound();
      const error = invalid(body);
      if (error) return error;
      const expected = typeof body.version === "number" ? body.version : current.version;
      if (expected !== current.version)
        return fail(409, "OPTIMISTIC_LOCK", "Address changed meanwhile");
      const replacement = fromBody(addressId, customerId, body, current.version + 1);
      const mustRemainDefault =
        current.defaultAddress &&
        !addresses.some(
          (a) => a.addressId !== addressId && a.type === replacement.type && a.defaultAddress,
        );
      const updated = {
        ...replacement,
        defaultAddress: replacement.defaultAddress || mustRemainDefault,
      };
      if (updated.defaultAddress) clearDefault(updated.type);
      addresses = addresses.map((a) => (a.addressId === addressId ? updated : a));
      ensureDefault(current.type);
      ensureDefault(updated.type);
      return ok(200, find(addressId));
    },

    remove(addressId: string): MockResult {
      const removed = find(addressId);
      if (!removed) return notFound();
      addresses = addresses.filter((a) => a.addressId !== addressId);
      if (removed.defaultAddress) ensureDefault(removed.type);
      return { status: 204, data: null };
    },

    makeDefault(addressId: string): MockResult {
      const selected = find(addressId);
      if (!selected) return notFound();
      clearDefault(selected.type);
      addresses = addresses.map((a) => (a.addressId === addressId ? setDefault(a, true) : a));
      return ok(200, find(addressId));
    },
  };
}

export type MockAddressBook = ReturnType<typeof createMockAddressBook>;

/** Seed: one customer with two shipping addresses and one billing address. */
export function seedMockAddresses(customerId: string): MockAddress[] {
  const base = { customerId, countryCode: "VN", version: 0 };
  return [
    {
      ...base,
      addressId: "6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60",
      type: "SHIPPING",
      recipientName: "Nguyễn Hoài Nam",
      phone: "+84908111222",
      line1: "12 Nguyễn Huệ",
      line2: "Toà Saigon Centre, tầng 5",
      wardCode: "26734",
      wardName: "Phường Sài Gòn",
      provinceCode: "79",
      provinceName: "Thành phố Hồ Chí Minh",
      postalCode: "700000",
      defaultAddress: true,
    },
    {
      ...base,
      addressId: "7a2d3b4c-5e6f-4a70-9b82-1c3d4e5f6a71",
      type: "SHIPPING",
      recipientName: "Trần Thu Hà",
      phone: "0912345678",
      line1: "45 Tràng Tiền",
      wardCode: "00070",
      wardName: "Phường Hoàn Kiếm",
      provinceCode: "01",
      provinceName: "Thành phố Hà Nội",
      defaultAddress: false,
    },
    {
      ...base,
      addressId: "8b3e4c5d-6f7a-4b81-8c93-2d4e5f6a7b82",
      type: "BILLING",
      recipientName: "Nguyễn Hoài Nam",
      phone: "02838251234",
      line1: "99 Lê Lợi",
      wardCode: "26734",
      wardName: "Phường Sài Gòn",
      provinceCode: "79",
      provinceName: "Thành phố Hồ Chí Minh",
      defaultAddress: true,
    },
  ];
}
