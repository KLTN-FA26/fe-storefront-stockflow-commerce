import { z } from "zod";

import { describeApiError, hasErrorCode } from "@/lib/api/describe-error";
import { ApiError } from "@/lib/api/error";

import type { PreflightIssue } from "./engine/preflight/types";
import { preflightIssueSchema } from "./schemas";

/** The error codes of the design API (spec 2026-11-09 §4.2, §9), as the customer reads them. */
const MESSAGE_BY_CODE: Record<string, string> = {
  VERSION_CONFLICT: "Thiết kế đã thay đổi, hãy tải lại.",
  INVALID_STATE: "Thiết kế đã chuyển trạng thái, hãy tải lại.",
  DRAFT_LIMIT: "Bạn đã có 50 bản nháp. Hãy xoá bớt trước khi tạo bản mới.",
  PRINT_CONFIG_MISSING: "Quy cách này chưa nhận thiết kế.",
  VARIANT_UNAVAILABLE: "Quy cách này hiện không còn nhận thiết kế.",
  FILE_REJECTED: "Tệp không đúng định dạng hoặc vượt dung lượng cho phép.",
  PREFLIGHT_FAILED: "Thiết kế chưa đạt kiểm tra tự động.",
  PAYLOAD_TOO_LARGE: "Tệp vượt dung lượng cho phép.",
  IDEMPOTENCY_KEY_REUSED: "Yêu cầu tải lên này đã được dùng cho một tệp khác. Hãy thử lại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này trên thiết kế.",
  NOT_FOUND: "Không tìm thấy thiết kế hoặc sản phẩm này.",
};

/** Customer-facing text for any failure reaching the design UI. */
export const describeDesignError = (error: unknown) => describeApiError(error, MESSAGE_BY_CODE);

/** A write sent a stale version (409): the editor stops and offers a reload. */
export const isDesignConflict = (error: unknown) => hasErrorCode(error, "VERSION_CONFLICT");

/** The design moved to another status meanwhile, e.g. in another tab (409): re-read it. */
export const isDesignStateChanged = (error: unknown) => hasErrorCode(error, "INVALID_STATE");

/** The design is not there any more (404 to a write): deleted in another tab. Re-read it. */
export const isDesignGone = (error: unknown) => error instanceof ApiError && error.status === 404;

const issuesSchema = z.object({ issues: z.array(preflightIssueSchema) });

/**
 * The failing checks of a `422 PREFLIGHT_FAILED` (they ride in `details.issues`); null for any
 * other error, or for one whose issues cannot be read.
 */
export function preflightIssuesOf(error: unknown): PreflightIssue[] | null {
  if (!hasErrorCode(error, "PREFLIGHT_FAILED")) return null;
  const parsed = issuesSchema.safeParse(error.details);
  return parsed.success ? parsed.data.issues : null;
}
