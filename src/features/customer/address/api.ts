import { z } from "zod";

import { api } from "@/lib/api/client";

import { customerAddressDtoSchema, saveAddressRequestSchema } from "./schemas";
import type { CustomerAddressDto, SaveAddressRequest } from "./types";

// BE CustomerAddressController: /api/v1/customers/{customerId}/addresses (customerId is a UUID;
// there is no /me/addresses yet). customerId comes from the cached /v1/customers/me profile.
const addressesPath = (customerId: string) =>
  `/v1/customers/${encodeURIComponent(customerId)}/addresses`;
const addressPath = (customerId: string, addressId: string) =>
  `${addressesPath(customerId)}/${encodeURIComponent(addressId)}`;

const addressListSchema = z.array(customerAddressDtoSchema);

// Only the id is needed here. Other /me fields may be omitted by BE NON_NULL, so this schema
// deliberately ignores them instead of depending on the profile feature's strict schema.
const customerIdentitySchema = z.object({ customerId: z.string().min(1) });

/** GET /v1/customers/me → customerId of the signed-in customer (UUID on the BE). */
export async function getMyCustomerId(signal?: AbortSignal): Promise<string> {
  const { data } = await api.get<unknown>("/v1/customers/me", signal ? { signal } : {});
  return customerIdentitySchema.parse(data).customerId;
}

export async function listAddresses(
  customerId: string,
  signal?: AbortSignal,
): Promise<CustomerAddressDto[]> {
  const { data } = await api.get<unknown>(addressesPath(customerId), signal ? { signal } : {});
  return addressListSchema.parse(data);
}

export async function createAddress(input: {
  customerId: string;
  body: SaveAddressRequest;
}): Promise<CustomerAddressDto> {
  const { data } = await api.post<unknown>(
    addressesPath(input.customerId),
    saveAddressRequestSchema.parse(input.body),
  );
  return customerAddressDtoSchema.parse(data);
}

export async function updateAddress(input: {
  customerId: string;
  addressId: string;
  body: SaveAddressRequest;
}): Promise<CustomerAddressDto> {
  const { data } = await api.put<unknown>(
    addressPath(input.customerId, input.addressId),
    saveAddressRequestSchema.parse(input.body),
  );
  return customerAddressDtoSchema.parse(data);
}

/** BE answers 204; when the deleted address was default, BE promotes another of the same type. */
export async function deleteAddress(input: {
  customerId: string;
  addressId: string;
}): Promise<void> {
  await api.delete(addressPath(input.customerId, input.addressId));
}

export async function setDefaultAddress(input: {
  customerId: string;
  addressId: string;
}): Promise<CustomerAddressDto> {
  const { data } = await api.post<unknown>(
    `${addressPath(input.customerId, input.addressId)}/default`,
  );
  return customerAddressDtoSchema.parse(data);
}
