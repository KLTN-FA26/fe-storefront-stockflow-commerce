import { z } from "zod";
import { api } from "@/lib/api/client";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { customerAddressDtoSchema, customerMeDtoSchema, type SaveAddressInput } from "./schemas";
import type { CustomerAddressDto } from "./types";

// ── Me-addresses là đích cuối (BE sẽ bổ sung /v1/customers/me/addresses).
// ── Hiện BE chỉ có /v1/customers/{customerId}/addresses nên giữ fallback kèm
//    getMyCustomerId() để việc test với BE hiện tại không gãy. Khi BE lên
//    endpoint /me/addresses thì nhánh try đầu sẽ thành công, nhánh catch không
//    bao giờ chạy — không cần sửa FE nữa.
const ME_BASE = "/v1/customers/me/addresses";

function isNotFound(err: unknown): boolean {
  const s =
    (err as { status?: number })?.status ??
    (err as { response?: { status?: number } })?.response?.status;
  return s === 404;
}

async function getMyCustomerId(): Promise<string> {
  const { data: raw } = await api.get("/v1/customers/me");
  const me = unwrapEnvelope(raw, customerMeDtoSchema);
  return me.customerId;
}

export async function getAddresses(signal?: AbortSignal): Promise<CustomerAddressDto[]> {
  const config = signal ? { signal } : {};
  try {
    const { data: raw } = await api.get(ME_BASE, config);
    return unwrapEnvelope(raw, z.array(customerAddressDtoSchema));
  } catch (e) {
    if (!isNotFound(e)) throw e;
    // Fallback tạm: BE chưa có /me/addresses → dùng /{customerId}/addresses để test
    const customerId = await getMyCustomerId();
    const { data: raw } = await api.get(`/v1/customers/${customerId}/addresses`, config);
    return unwrapEnvelope(raw, z.array(customerAddressDtoSchema));
  }
}

export async function createAddress(input: SaveAddressInput): Promise<CustomerAddressDto> {
  try {
    const { data: raw } = await api.post(ME_BASE, input);
    return unwrapEnvelope(raw, customerAddressDtoSchema);
  } catch (e) {
    if (!isNotFound(e)) throw e;
    const customerId = await getMyCustomerId();
    const { data: raw } = await api.post(`/v1/customers/${customerId}/addresses`, input);
    return unwrapEnvelope(raw, customerAddressDtoSchema);
  }
}

export async function updateAddress(input: {
  addressId: string;
  data: SaveAddressInput;
}): Promise<CustomerAddressDto> {
  try {
    const { data: raw } = await api.put(`${ME_BASE}/${input.addressId}`, input.data);
    return unwrapEnvelope(raw, customerAddressDtoSchema);
  } catch (e) {
    if (!isNotFound(e)) throw e;
    const customerId = await getMyCustomerId();
    const { data: raw } = await api.put(
      `/v1/customers/${customerId}/addresses/${input.addressId}`,
      input.data,
    );
    return unwrapEnvelope(raw, customerAddressDtoSchema);
  }
}

export async function deleteAddress(addressId: string): Promise<void> {
  try {
    await api.delete(`${ME_BASE}/${addressId}`);
  } catch (e) {
    if (!isNotFound(e)) throw e;
    const customerId = await getMyCustomerId();
    await api.delete(`/v1/customers/${customerId}/addresses/${addressId}`);
  }
}

export async function setAddressDefault(addressId: string): Promise<CustomerAddressDto> {
  try {
    const { data: raw } = await api.post(`${ME_BASE}/${addressId}/default`);
    return unwrapEnvelope(raw, customerAddressDtoSchema);
  } catch (e) {
    if (!isNotFound(e)) throw e;
    const customerId = await getMyCustomerId();
    const { data: raw } = await api.post(
      `/v1/customers/${customerId}/addresses/${addressId}/default`,
    );
    return unwrapEnvelope(raw, customerAddressDtoSchema);
  }
}
