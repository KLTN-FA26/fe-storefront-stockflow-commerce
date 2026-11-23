import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";

import { getMyLegalProfile } from "./api";

export const legalProfileKeys = {
  mine: ["customer", "legal-profile"] as const,
};

export function useMyLegalProfile(enabled = true) {
  return useQuery({
    queryKey: legalProfileKeys.mine,
    queryFn: ({ signal }) => getMyLegalProfile(signal),
    enabled,
    retry: false,
    ...QUERY_TIMES.detail,
  });
}
