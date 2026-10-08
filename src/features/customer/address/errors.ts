import { z } from "zod";

import { ApiError } from "@/lib/api/error";

/**
 * Customer-facing text for any failure reaching the address UI.
 * A zod failure means the BE response broke the contract (PRODUCTION-FRONTEND-RULES §8),
 * so it gets its own message instead of leaking the raw issue list.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.correlationId
      ? `${error.message} (Mã tra cứu: ${error.correlationId})`
      : error.message;
  }
  if (error instanceof z.ZodError) {
    return "Dữ liệu trả về không đúng định dạng. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.";
  }
  return "Đã xảy ra lỗi. Vui lòng thử lại.";
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;
