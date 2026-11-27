import { useMutation, useQueryClient } from "@tanstack/react-query";

import { describeBeRefusal, hasErrorCode } from "@/lib/api/describe-error";

import { attachCreditRequestFile, submitCreditRequest, withdrawCreditRequest } from "./api";
import { creditRequestKeys } from "./queries";

import type { CreditRequestInput } from "./schemas";

// Every change re-reads the list and the detail (they share the `credit-requests` root). A refusal saying the request
// moved on elsewhere (decided, a stale version) re-reads too, so the page shows where it stands. The screen shows the
// refusal itself — no generic toast with the BE's raw text.

function useRefresh() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: creditRequestKeys.all });
}

const MOVED_ON = [
  "OPTIMISTIC_LOCK",
  "CREDIT_REQUEST_INVALID_TRANSITION",
  "CREDIT_REQUEST_ALREADY_OPEN",
];
const movedOn = (error: unknown) => MOVED_ON.some((code) => hasErrorCode(error, code));

export function useSubmitCreditRequest() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: CreditRequestInput) => submitCreditRequest(input),
    onSuccess: refresh,
    onError: (error) => movedOn(error) && refresh(),
  });
}

export function useWithdrawCreditRequest() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: withdrawCreditRequest,
    onSuccess: refresh,
    onError: (error) => movedOn(error) && refresh(),
  });
}

export function useAttachCreditRequestFile() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: attachCreditRequestFile,
    onSuccess: refresh,
    onError: (error) => movedOn(error) && refresh(),
  });
}

/** The BE words its refusals in Vietnamese; these codes get the portal's own words (handoff A). */
export function describeCreditRequestError(error: unknown): string {
  return describeBeRefusal(error, {
    CREDIT_REQUEST_ALREADY_OPEN:
      "Bạn đang có một đề nghị chờ xử lý. Vui lòng chờ kết quả hoặc rút đề nghị đó trước.",
    CREDIT_REQUEST_NOT_FOUND: "Không tìm thấy đề nghị.",
    CREDIT_REQUEST_INVALID_TRANSITION: "Đề nghị đã có kết quả nên không thay đổi được nữa.",
    CREDIT_REQUEST_NOT_FILER: "Đề nghị do Sale gửi thay bạn — vui lòng liên hệ Sale để rút.",
    OPTIMISTIC_LOCK: "Đề nghị vừa được cập nhật. Vui lòng tải lại trang rồi thử lại.",
    PAYLOAD_TOO_LARGE: "Tệp vượt 25 MB.",
    UNSUPPORTED_MEDIA_TYPE: "Chỉ nhận PDF, Word, Excel, JPEG hoặc PNG.",
  });
}
