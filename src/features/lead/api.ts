import { api } from "@/lib/api/client";

import { leadReceiptSchema, type LeadRequest } from "./schemas";

/**
 * `POST /public/leads` (HOP-DONG-API, BE-A): anonymous, rate-limited per IP. The answer is the same whether the tax
 * code is new or already a customer's (then the BE tells that customer's Sales instead of opening a lead), so nothing
 * here can tell a visitor who is a customer.
 */
export async function submitLead(request: LeadRequest): Promise<void> {
  const { data } = await api.post<unknown>("/public/leads", request);
  leadReceiptSchema.parse(data);
}
