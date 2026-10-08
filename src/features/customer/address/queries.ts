import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";

import { getMyCustomerId, listAddresses } from "./api";

export const customerAddressKeys = {
  all: ["customer-addresses"] as const,
  customerId: () => [...customerAddressKeys.all, "customer-id"] as const,
  list: (customerId: string) => [...customerAddressKeys.all, "list", customerId] as const,
};

/**
 * Address book of the signed-in customer. The BE route needs the customer UUID, so it is
 * resolved once from GET /v1/customers/me and cached (it never changes for a session).
 */
export function useAddressBook() {
  const owner = useQuery({
    queryKey: customerAddressKeys.customerId(),
    queryFn: ({ signal }) => getMyCustomerId(signal),
    ...QUERY_TIMES.master,
  });
  const customerId = owner.data;

  const addresses = useQuery({
    queryKey: customerAddressKeys.list(customerId ?? ""),
    queryFn: ({ signal }) => listAddresses(customerId!, signal),
    enabled: !!customerId,
    ...QUERY_TIMES.list,
  });

  const error = owner.error ?? addresses.error;

  return {
    customerId,
    addresses: addresses.data,
    isLoading: owner.isLoading || addresses.isLoading,
    isFetching: owner.isFetching || addresses.isFetching,
    error,
    refetch: () => (owner.error ? owner.refetch() : addresses.refetch()),
  };
}
