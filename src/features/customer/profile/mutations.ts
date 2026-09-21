import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api/error";

import { updateCustomerProfile } from "./api";
import { customerProfileKeys } from "./queries";
import type { CustomerProfile, CustomerProfileUpdate } from "./types";

export function useUpdateCustomerProfile() {
  const queryClient = useQueryClient();

  return useMutation<CustomerProfile, ApiError, CustomerProfileUpdate>({
    mutationFn: updateCustomerProfile,
    retry: false,
    onSuccess: (profile) => {
      queryClient.setQueryData(customerProfileKeys.profile(), profile);
    },
  });
}
