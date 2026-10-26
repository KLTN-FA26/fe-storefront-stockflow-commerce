import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

import {
  createAddress,
  getMyCustomerId,
  deleteAddress,
  listAddresses,
  setDefaultAddress,
  updateAddress,
} from "./api";
import type { SaveAddressRequest } from "./types";

afterEach(() => vi.restoreAllMocks());

const customerId = "9d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f";
const addressId = "6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60";
const address = {
  addressId,
  customerId,
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
  version: 0,
};
const body: SaveAddressRequest = {
  type: "SHIPPING",
  recipientName: "Nguyễn Hoài Nam",
  phone: "+84908111222",
  line1: "12 Nguyễn Huệ",
  line2: null,
  wardCode: "26734",
  wardName: "Phường Sài Gòn",
  provinceCode: "79",
  provinceName: "Thành phố Hồ Chí Minh",
  countryCode: "VN",
  postalCode: null,
  defaultAddress: false,
  version: 0,
};
const base = `/customers/${customerId}/addresses`;

describe("customer address API (BE CustomerAddressController)", () => {
  it("reads customerId from a BE NON_NULL /me response (null phone/segmentId omitted)", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({
      data: {
        customerId,
        userId: "u-1",
        fullName: "Nguyễn Hoài Nam",
        email: "a@b.vn",
        status: "ACTIVE",
        version: 0,
        createdAt: "2026-10-01T00:00:00Z",
      },
    });

    await expect(getMyCustomerId()).resolves.toBe(customerId);
    expect(get).toHaveBeenCalledWith("/customers/me", {});
  });

  it("lists with exactly one request to /{customerId}/addresses and parses DTOs", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: [address] });

    await expect(listAddresses(customerId)).resolves.toEqual([address]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(base, {});
  });

  it("rejects a response that breaks the contract instead of passing it on", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: [{ ...address, version: "0" }] });
    await expect(listAddresses(customerId)).rejects.toThrow();
  });

  it("creates, updates, deletes and sets default on the BE paths", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: address });
    const put = vi.spyOn(api, "put").mockResolvedValueOnce({ data: { ...address, version: 1 } });
    const del = vi.spyOn(api, "delete").mockResolvedValueOnce({ data: null, status: 204 });

    await createAddress({ customerId, body });
    await updateAddress({ customerId, addressId, body: { ...body, version: 0 } });
    await deleteAddress({ customerId, addressId });
    await setDefaultAddress({ customerId, addressId });

    expect(post).toHaveBeenNthCalledWith(1, base, body);
    expect(put).toHaveBeenCalledWith(`${base}/${addressId}`, { ...body, version: 0 });
    expect(del).toHaveBeenCalledWith(`${base}/${addressId}`);
    expect(post).toHaveBeenNthCalledWith(2, `${base}/${addressId}/default`);
  });

  it("validates the payload before sending it", async () => {
    const post = vi.spyOn(api, "post");
    await expect(
      createAddress({ customerId, body: { ...body, phone: "0123456789" } }),
    ).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});
