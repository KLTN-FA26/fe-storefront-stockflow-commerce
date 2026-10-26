import { api } from "@/lib/api/client";

import {
  customerProfileSchema,
  customerProfileUpdateSchema,
  type CustomerProfileUpdate,
} from "./schemas";

import type { CustomerProfile } from "./types";

export async function getCustomerProfile(signal?: AbortSignal): Promise<CustomerProfile> {
  const { data } = await api.get<unknown>("/customers/me", signal ? { signal } : {});
  return customerProfileSchema.parse(data);
}

export async function updateCustomerProfile(
  input: CustomerProfileUpdate,
): Promise<CustomerProfile> {
  const body = customerProfileUpdateSchema.parse(input);
  const { data } = await api.put<unknown>("/customers/me", body);
  return customerProfileSchema.parse(data);
}
