import { useQuery } from "@tanstack/react-query";

import { getDesign, listDesigns } from "./api";

export const designKeys = {
  all: ["product-design"] as const,
  list: () => ["product-design", "list"] as const,
  detail: (id: string) => ["product-design", "detail", id] as const,
};

export function useDesigns() {
  return useQuery({ queryKey: designKeys.list(), queryFn: listDesigns });
}

export function useDesign(id: string) {
  return useQuery({
    queryKey: designKeys.detail(id),
    queryFn: () => getDesign(id),
    enabled: Boolean(id),
  });
}
