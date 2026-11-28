import { useMutation } from "@tanstack/react-query";

import { withLookup } from "@/lib/api/describe-error";
import { ApiError } from "@/lib/api/error";

import { submitLead } from "./api";

export function useSubmitLead() {
  return useMutation({ mutationFn: submitLead });
}

export const LEAD_RATE_LIMITED_MESSAGE =
  "Bạn vừa gửi nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau ít phút.";
export const LEAD_FAILED_MESSAGE = "Chưa gửi được yêu cầu. Vui lòng thử lại sau ít phút.";

/**
 * Two answers only: too many requests (429), or try again. A refusal never says why in business terms, so the form
 * cannot be used to learn whether a company is already a customer (KE-HOACH §10.7).
 */
export function describeLeadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429 || error.code === "RATE_LIMITED") return LEAD_RATE_LIMITED_MESSAGE;
    if (error.status === 0) return error.message;
    return withLookup(LEAD_FAILED_MESSAGE, error);
  }
  return LEAD_FAILED_MESSAGE;
}
