import { useMutation, useQueryClient } from "@tanstack/react-query";

import { confirmDesign, submitDesign, updateDesignElements } from "./api";
import { designKeys } from "./queries";

export function useUpdateDesign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateDesignElements,
    onSuccess: (design) => {
      queryClient.invalidateQueries({ queryKey: designKeys.all });
      queryClient.setQueryData(designKeys.detail(design.id), design);
    },
  });
}

export function useSubmitDesign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitDesign,
    onSuccess: (design) => {
      queryClient.invalidateQueries({ queryKey: designKeys.all });
      queryClient.setQueryData(designKeys.detail(design.id), design);
    },
  });
}

export function useConfirmDesign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: confirmDesign,
    onSuccess: (design) => {
      queryClient.invalidateQueries({ queryKey: designKeys.all });
      queryClient.setQueryData(designKeys.detail(design.id), design);
    },
  });
}
