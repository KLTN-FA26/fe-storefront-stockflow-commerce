import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/shared/Toast";
import type { ApiError } from "@/lib/api/error";
import { myPermissionKeys } from "@/lib/auth/my-permissions";

import { acceptQuote, requestQuoteChanges } from "./api";
import { describeQuoteError } from "./errors";
import { quoteKeys } from "./queries";
import type { Quote, QuoteAcceptanceInput, QuoteChangeRequestInput } from "./types";

/**
 * What an answer to a quote re-reads, success or not: the quote and the list. A refusal for a
 * stale view — OPTIMISTIC_LOCK (someone changed it), QUOTE_EXPIRED, INVALID_QUOTE_TRANSITION —
 * means the cached quote is already out of date. OPTIMISTIC_LOCK and INVALID_QUOTE_TRANSITION are said in a toast and the
 * quote re-read; the answer is never sent again on its own (plan §1.4). A 403 re-reads the permissions.
 * Other refusals are shown inline by the caller.
 */
function useQuoteAnswer<Input extends { quoteId: string }>(
  mutationFn: (input: Input) => Promise<Quote>,
  success: string,
) {
  const queryClient = useQueryClient();
  return useMutation<Quote, ApiError, Input>({
    mutationFn,
    onSuccess: (quote, { quoteId }) => {
      queryClient.setQueryData(quoteKeys.detail(quoteId), quote);
      toast.success(success);
    },
    onError: (error) => {
      if (error.code === "OPTIMISTIC_LOCK") toast.warning("Dữ liệu vừa thay đổi, đã tải lại");
      // beingRevised / withdrawn: the re-read below replaces the form, so the BE's sentence is said here.
      if (error.code === "INVALID_QUOTE_TRANSITION") toast.info(describeQuoteError(error));
    },
    onSettled: (_quote, error, { quoteId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: quoteKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: quoteKeys.detail(quoteId) }),
        error?.status === 403
          ? queryClient.invalidateQueries({ queryKey: myPermissionKeys.all })
          : undefined,
      ]),
  });
}

/** POST /quotes/{id}/acceptance. */
export const useAcceptQuote = () =>
  useQuoteAnswer<QuoteAcceptanceInput>(acceptQuote, "Đã chấp nhận báo giá");

/** POST /quotes/{id}/change-request. */
export const useRequestQuoteChanges = () =>
  useQuoteAnswer<QuoteChangeRequestInput>(requestQuoteChanges, "Đã gửi yêu cầu sửa báo giá");
