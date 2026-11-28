import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import {
  ownerChangeRequestListSchema,
  salesOptionsSchema,
  salesOwnerSchema,
  type OwnerChangeRequest,
  type OwnerChangeRequestBody,
  type SalesOption,
  type SalesOwner,
} from "./schemas";

/**
 * Before the BE has an endpoint, "me" falls through to a staff route (400), a missing permission is 403 and an
 * unknown path 404: all three mean "not available yet", and the account page leaves the feature out.
 */
const notAvailable = (error: unknown) =>
  error instanceof ApiError && [400, 403, 404].includes(error.status);

async function readOrNull<T>(
  path: string,
  parse: (data: unknown) => T,
  signal?: AbortSignal,
): Promise<T | null> {
  try {
    const { data } = await api.get<unknown>(path, signal ? { signal } : {});
    return data == null ? null : parse(data);
  } catch (error) {
    if (notAvailable(error)) return null;
    throw error;
  }
}

/** The customer's Sales; null when there is none or the endpoint is not there. */
export function getMySalesOwner(signal?: AbortSignal): Promise<SalesOwner | null> {
  return readOrNull("/customers/me/sales-owner", (data) => salesOwnerSchema.parse(data), signal);
}

export function getMySalesOptions(signal?: AbortSignal): Promise<SalesOption[] | null> {
  return readOrNull(
    "/customers/me/sales-options",
    (data) => salesOptionsSchema.parse(data),
    signal,
  );
}

/** The customer's change requests, latest first; null when the feature is not there. */
export function listMyOwnerChangeRequests(
  signal?: AbortSignal,
): Promise<OwnerChangeRequest[] | null> {
  return readOrNull(
    "/customers/me/sales-owner-change-requests",
    (data) => ownerChangeRequestListSchema.parse(data),
    signal,
  );
}

export async function submitOwnerChangeRequest(body: OwnerChangeRequestBody): Promise<void> {
  await api.post<unknown>("/customers/me/sales-owner-change-requests", body);
}
