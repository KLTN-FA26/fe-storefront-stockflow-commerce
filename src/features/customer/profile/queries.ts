import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";

import { getCustomerProfile } from "./api";

export const customerProfileKeys = {
  all: ["customer"] as const,
  profile: () => [...customerProfileKeys.all, "profile"] as const,
};

export function useCustomerProfile() {
  return useQuery({
    queryKey: customerProfileKeys.profile(),
    queryFn: ({ signal }) => getCustomerProfile(signal),
    ...QUERY_TIMES.detail,
  });
}
