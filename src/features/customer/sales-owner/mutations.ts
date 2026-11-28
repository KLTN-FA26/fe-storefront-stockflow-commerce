import { useMutation, useQueryClient } from "@tanstack/react-query";

import { describeApiError, hasErrorCode } from "@/lib/api/describe-error";

import { submitOwnerChangeRequest } from "./api";
import { salesOwnerKeys } from "./queries";

const SETTLED_ELSEWHERE = ["OWNER_CHANGE_REQUEST_PENDING", "OWNER_CHANGE_REQUEST_COOLDOWN"];

/**
 * A request sent, or refused because one is open or was decided too recently: either way the list is read again, so
 * the card shows where the latest request stands.
 */
export function useSubmitOwnerChangeRequest() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: salesOwnerKeys.requests() });
  return useMutation({
    mutationFn: submitOwnerChangeRequest,
    onSuccess: refresh,
    onError: (error) => {
      if (SETTLED_ELSEWHERE.some((code) => hasErrorCode(error, code))) refresh();
    },
  });
}

/** KE-HOACH §10.5 limits: one open request per customer; 30 days after a decision before the next. */
export const OWNER_CHANGE_REQUEST_MESSAGES: Record<string, string> = {
  OWNER_CHANGE_REQUEST_PENDING:
    "Bạn đang có một yêu cầu đổi người hỗ trợ chờ duyệt. Vui lòng chờ kết quả trước khi gửi yêu cầu mới.",
  OWNER_CHANGE_REQUEST_COOLDOWN:
    "Yêu cầu trước của bạn vừa được xử lý. Bạn có thể gửi yêu cầu mới sau 30 ngày kể từ ngày có kết quả.",
};

export function describeOwnerChangeRequestError(error: unknown): string {
  return describeApiError(error, OWNER_CHANGE_REQUEST_MESSAGES);
}
