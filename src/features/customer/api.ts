import { api } from "@/lib/api/client";
import type { Address } from "./types";
import type { AddressFormValues } from "./schemas";

export async function getAddresses(signal?: AbortSignal): Promise<Address[]> {
  const config = signal ? { signal } : {};
  const { data } = await api.get<Address[]>("/customers/me/addresses", config);
  return data;
}

export async function createAddress(input: AddressFormValues): Promise<Address> {
  const { data } = await api.post<Address>("/customers/me/addresses", input);
  return data;
}

export async function updateAddress(input: { id: string; data: AddressFormValues }): Promise<Address> {
  const { data } = await api.put<Address>(`/customers/me/addresses/${input.id}`, input.data);
  return data;
}

export async function deleteAddress(id: string): Promise<void> {
  await api.delete(`/customers/me/addresses/${id}`);
}

export async function setAddressDefault(id: string): Promise<void> {
  await api.patch(`/customers/me/addresses/${id}/default`);
}
