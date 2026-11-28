import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { orderKeys } from "./queries";
import { getContractRevisions, getContractVerification } from "./contract-signing-api";

export const signingKeys = {
  action: (id: string) => ["contract-action", id] as const,
  revisions: (id: string) => [...orderKeys.contract(id), "revisions"] as const,
  verification: (code: string) => ["contract-verification", code] as const,
};
export function useContractRevisions(id: string, enabled: boolean) {
  return useQuery({
    queryKey: signingKeys.revisions(id),
    queryFn: ({ signal }) => getContractRevisions(id, signal),
    enabled,
    retry: false,
  });
}
export function useContractVerification(code: string) {
  return useQuery({
    queryKey: signingKeys.verification(code),
    queryFn: ({ signal }) => getContractVerification(code, signal),
    retry: false,
  });
}
export function useContractAction<T>(
  id: string,
  mutationFn: (input: T) => Promise<void>,
  message: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: signingKeys.action(id),
    mutationFn,
    onSuccess: () => {
      toast.success(message);
      // Contract, revisions, order detail/list and chat cards all reflect the new lifecycle.
      void client.invalidateQueries({ queryKey: orderKeys.all });
      void client.invalidateQueries({ queryKey: signingKeys.revisions(id) });
      void client.invalidateQueries({ queryKey: ["chat"] });
    },
  });
}
