import { z } from "zod";

import { describeApiError, hasErrorCode } from "@/lib/api/describe-error";
import { ApiError } from "@/lib/api/error";

import { LIBRARY_LIMIT } from "./library-schemas";
import { MIN_SET_SIZE, PROJECT_DESIGN_LIMIT } from "./project-schemas";
import { reportedPreflightIssueSchema } from "./schemas";
import type { ReportedPreflightIssue } from "./types";

/** The error codes of the design API (spec 2026-11-09 §4.2, §9), as the customer reads them. */
const MESSAGE_BY_CODE: Record<string, string> = {
  VERSION_CONFLICT: "Thiết kế đã thay đổi, hãy tải lại.",
  INVALID_STATE: "Thiết kế đã chuyển trạng thái, hãy tải lại.",
  APPROVAL_FAILED: "Duyệt chưa thành công, bản vẫn đang chờ duyệt.",
  DRAFT_LIMIT: "Bạn đã có 50 bản nháp. Hãy xoá bớt trước khi tạo bản mới.",
  PRINT_CONFIG_MISSING: "Quy cách này chưa nhận thiết kế.",
  VARIANT_UNAVAILABLE: "Quy cách này hiện không còn nhận thiết kế.",
  VARIANT_NOT_ELIGIBLE: "Không nhân bản được sang quy cách này. Hãy chọn quy cách khác.",
  FILE_REJECTED: "Tệp không đúng định dạng hoặc vượt dung lượng cho phép.",
  PREFLIGHT_FAILED: "Thiết kế chưa đạt kiểm tra tự động.",
  PAYLOAD_TOO_LARGE: "Tệp vượt dung lượng cho phép.",
  IDEMPOTENCY_KEY_REUSED: "Yêu cầu này đã được dùng cho nội dung khác. Hãy thử lại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này trên thiết kế.",
  NOT_FOUND: "Không tìm thấy thiết kế hoặc sản phẩm này.",
  // Projects (spec 2026-11-12 §4)
  PROJECT_HAS_PENDING: "Còn bản đang chờ duyệt, chưa thể đóng dự án.",
  DESIGN_IN_OTHER_PROJECT: "Thiết kế này đã thuộc một dự án khác.",
  DESIGN_ARCHIVED: "Thiết kế đã bị xoá, không thể thêm vào dự án.",
  PROJECT_FULL: `Dự án đã đủ ${PROJECT_DESIGN_LIMIT} bản.`,
  PROJECT_ARCHIVED: "Dự án đã đóng.",
  DESIGN_PENDING: "Bản đang chờ duyệt, chưa thể gỡ khỏi dự án.",
  // The project library (spec 2026-11-12 §4)
  LIBRARY_FULL: `Thư viện đã đủ số lượng cho phép (${LIBRARY_LIMIT} ảnh, ${LIBRARY_LIMIT} mẫu chữ).`,
  NOT_IN_PROJECT: "Bản thiết kế này không thuộc dự án của thư viện.",
  FILE_RULE: "Ảnh không đúng ràng buộc tệp của quy cách này.",
  // Sending a set for review (spec 2026-11-12 §8): one refusal sends none (BR-19)
  SET_TOO_SMALL: `Cần ít nhất ${MIN_SET_SIZE} bản nháp để gửi duyệt cả bộ.`,
  VERSION_CHANGED: "Có bản vừa được sửa ở nơi khác nên chưa bản nào được gửi.",
  DESIGN_NOT_DRAFT: "Có bản không còn là bản nháp nên chưa bản nào được gửi.",
  DESIGN_NOT_IN_PROJECT: "Có bản không còn thuộc dự án này nên chưa bản nào được gửi.",
  UPLOAD_INVALID: "File đã tải lên của một bản không còn dùng được. Hãy thử lại để tải lên lại.",
};

/** The rule a 422 FILE_RULE names in its `details` (BR-18): the format, or the file size. */
const fileRuleSchema = z.discriminatedUnion("rule", [
  z.object({
    rule: z.literal("FORMAT"),
    contentType: z.string(),
    formats: z.array(z.string()),
  }),
  z.object({
    rule: z.literal("FILE_SIZE"),
    sizeBytes: z.number(),
    maxFileSizeMb: z.number(),
  }),
]);
export type FileRule = z.infer<typeof fileRuleSchema>;

/** The rule that refused a library image placed in a design; null for any other error. */
export function fileRuleOf(error: unknown): FileRule | null {
  if (!hasErrorCode(error, "FILE_RULE")) return null;
  const parsed = fileRuleSchema.safeParse(error.details);
  return parsed.success ? parsed.data : null;
}

const FORMAT_NAMES: Record<string, string> = { "image/png": "PNG", "image/jpeg": "JPG" };

function describeFileRule(rule: FileRule): string {
  if (rule.rule === "FILE_SIZE")
    return `Ảnh vượt ${rule.maxFileSizeMb} MB, mức quy cách này cho phép.`;
  const names = rule.formats.map((format) => FORMAT_NAMES[format] ?? format);
  return `Quy cách này chỉ nhận ảnh ${names.join(", ")}.`;
}

/** Customer-facing text for any failure reaching the design UI. */
export function describeDesignError(error: unknown): string {
  const rule = fileRuleOf(error);
  return rule ? describeFileRule(rule) : describeApiError(error, MESSAGE_BY_CODE);
}

/** A write sent a stale version (409): the editor stops and offers a reload. */
export const isDesignConflict = (error: unknown) => hasErrorCode(error, "VERSION_CONFLICT");

/** The design moved to another status meanwhile, e.g. in another tab (409): re-read it. */
export const isDesignStateChanged = (error: unknown) => hasErrorCode(error, "INVALID_STATE");

/** The design is not there any more (404 to a write): deleted in another tab. Re-read it. */
export const isDesignGone = (error: unknown) => error instanceof ApiError && error.status === 404;

/** The server judged the design's preflight Fail (`422 PREFLIGHT_FAILED`), whatever it lists. */
export const isPreflightRefusal = (error: unknown) => hasErrorCode(error, "PREFLIGHT_FAILED");

const issuesSchema = z.object({ issues: z.array(reportedPreflightIssueSchema) });

/**
 * The failing checks of a `422 PREFLIGHT_FAILED` (they ride in `details.issues`, any non-empty
 * `ruleId`); null for any other error, or for one whose issues cannot be read.
 */
export function preflightIssuesOf(error: unknown): ReportedPreflightIssue[] | null {
  if (!hasErrorCode(error, "PREFLIGHT_FAILED")) return null;
  const parsed = issuesSchema.safeParse(error.details);
  return parsed.success ? parsed.data.issues : null;
}

const roundRefusalSchema = z.object({
  designIds: z.array(z.string()).min(1),
  failures: z
    .array(z.object({ designId: z.string(), issues: z.array(reportedPreflightIssueSchema) }))
    .optional(),
});

/** A refused review round: its code, the designs it names, and their failing checks if any. */
export type RoundRefusal = {
  code: string;
  designIds: string[];
  failures: Array<{ designId: string; issues: ReportedPreflightIssue[] }>;
};

/**
 * The designs a refused review round names (`details.designIds`, docs 12 BR-19) and, on 422
 * PREFLIGHT_FAILED, each one's failing checks; null for an error that names no design.
 */
export function roundRefusalOf(error: unknown): RoundRefusal | null {
  if (!(error instanceof ApiError)) return null;
  const parsed = roundRefusalSchema.safeParse(error.details);
  if (!parsed.success) return null;
  const { designIds, failures = [] } = parsed.data;
  return { code: error.code, designIds, failures };
}
