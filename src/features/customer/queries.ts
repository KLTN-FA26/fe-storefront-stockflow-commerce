import { useQuery } from "@tanstack/react-query";
import { createQueryKeys } from "@/lib/api/query-factory";
import { getAddresses } from "./api";

export const customerAddressKeys = createQueryKeys("customer-addresses");

export function useAddresses() {
  return useQuery({
    queryKey: customerAddressKeys.all,
    queryFn: ({ signal }) => getAddresses(signal),
  });
}
