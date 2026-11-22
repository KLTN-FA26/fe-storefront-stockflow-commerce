import { describeApiError, hasErrorCode } from "@/lib/api/describe-error";
import { ApiError } from "@/lib/api/error";

import { filesOutdatedDetailsSchema, preflightFailedDetailsSchema } from "./design-dtos";
import { toPreflightIssues } from "./design-mappers";
import { LIBRARY_LIMIT } from "./library-schemas";
import { batchDesignIdsDetailsSchema, batchFailureDetailsSchema } from "./project-dtos";
import { PROJECT_DESIGN_LIMIT } from "./project-schemas";
import { designFileRoleSchema } from "./schemas";
import type { DesignFileRole, ReportedPreflightIssue } from "./types";

/** The BE's error codes (`ErrorCode.java`, F-2), as the customer reads them. */
const BE_MESSAGE_BY_CODE: Record<string, string> = {
  CONFLICT: "Thiết kế đã thay đổi, hãy tải lại.", // a stale version, or a state the call does not fit
  DESIGN_NOT_DRAFT: "Thiết kế đã chuyển trạng thái, hãy tải lại.",
  DESIGN_DRAFT_LIMIT_REACHED: "Bạn đã có 50 bản nháp. Hãy xoá bớt trước khi tạo bản mới.",
  PRINT_CONFIG_NOT_FOUND: "Quy cách này chưa nhận thiết kế.",
  PRODUCT_NOT_CUSTOMIZABLE: "Sản phẩm này hiện không nhận thiết kế.",
  CUSTOMER_NOT_ACTIVE: "Tài khoản của bạn hiện chưa thể bắt đầu thiết kế mới.",
  IDEMPOTENCY_KEY_REUSED: "Yêu cầu này đã được dùng cho nội dung khác. Hãy thử lại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này trên thiết kế.",
  NOT_FOUND: "Không tìm thấy thiết kế hoặc sản phẩm này.",
  // Sending a design (rows 16, 19): the BE's own checks of the layout and of its files.
  DESIGN_PREFLIGHT_FAILED: "Thiết kế chưa đạt kiểm tra tự động.",
  DESIGN_FILES_OUTDATED:
    "File đã vẽ không còn khớp với thiết kế hiện tại. Hãy bấm gửi duyệt lại để vẽ lại file.",
  DESIGN_PRINT_FILE_INVALID: "File in chưa đúng khổ hoặc định dạng của quy cách. Hãy thử lại.",
  // The layout and the images (rows 10-15): refusals that carry a `message` and no `details`.
  REQUEST_BODY_TOO_LARGE: "Thiết kế quá phức tạp để lưu. Hãy bớt chi tiết rồi thử lại.",
  UNSUPPORTED_MEDIA_TYPE: "Tệp không đúng định dạng mà quy cách này nhận.",
  PAYLOAD_TOO_LARGE: "Tệp vượt dung lượng cho phép.",
  DESIGN_ASSET_LIMIT_REACHED: "Thiết kế này đã có tối đa 100 ảnh.",
  // 120 uploads an hour, 60 recorded preflight failures an hour: one text for the design screens.
  RATE_LIMITED:
    "Bạn thao tác quá nhanh hoặc đã tải lên quá nhiều ảnh. Vui lòng thử lại sau ít phút.",
  // Projects, their library and clones (rows 9, 21-36).
  DESIGN_PROJECT_FULL: `Dự án đã đủ ${PROJECT_DESIGN_LIMIT} bản.`,
  DESIGN_PROJECT_ARCHIVED: "Dự án đã đóng.",
  DESIGN_PROJECT_HAS_PENDING: "Còn bản đang chờ duyệt, chưa thể đóng dự án.",
  DESIGN_IN_ANOTHER_PROJECT: "Thiết kế này đã thuộc một dự án khác.",
  DESIGN_PENDING_IN_PROJECT: "Bản đang chờ duyệt, chưa thể gỡ khỏi dự án.",
  DESIGN_PROJECT_LIBRARY_FULL: `Thư viện đã đủ số lượng cho phép (${LIBRARY_LIMIT} ảnh, ${LIBRARY_LIMIT} mẫu chữ).`,
  DESIGN_CLONE_TARGET_INVALID: "Không nhân bản được sang quy cách này. Hãy chọn quy cách khác.",
  DESIGN_BATCH_PREFLIGHT_FAILED: "Có bản chưa đạt kiểm tra nên chưa bản nào được gửi.",
  // The rest of what the design endpoints can answer (SF5 sweep of the BE's `ErrorCode`).
  PRODUCT_NOT_FOUND: "Không tìm thấy sản phẩm này.",
  MALFORMED_REQUEST: "Không đọc được nội dung thiết kế. Hãy tải lại trang rồi thử lại.",
  DESIGN_NOT_APPROVED: "Chỉ bản đã được duyệt mới gửi yêu cầu báo giá được.",
  IDEMPOTENT_REQUEST_IN_PROGRESS:
    "Yêu cầu trước vẫn đang được xử lý. Vui lòng đợi vài giây rồi thử lại.",
  STORAGE_ERROR: "Chưa lưu được tệp lúc này. Vui lòng thử lại sau ít phút.",
};

/** Words only the mock's reviewer simulation (`__mock`) sends; the BE has no such answer. */
const MOCK_MESSAGE_BY_CODE: Record<string, string> = {
  APPROVAL_FAILED: "Duyệt chưa thành công, bản vẫn đang chờ duyệt.",
};

const MESSAGE_BY_CODE: Record<string, string> = {
  ...MOCK_MESSAGE_BY_CODE,
  ...BE_MESSAGE_BY_CODE,
};

const FORMAT_NAMES: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WebP",
};

type FileRule =
  | { rule: "FORMAT"; formats: string[] }
  | { rule: "FILE_SIZE"; maxFileSizeMb: number }
  | { rule: "PIXELS" };

/** An image over 40 megapixels, refused by the BE (413) or before sending: one sentence for both. */
export const TOO_MANY_PIXELS_MESSAGE =
  "Ảnh có quá nhiều điểm ảnh (tối đa 40 megapixel). Hãy thu nhỏ kích thước ảnh rồi tải lại.";

function describeFileRule(rule: FileRule): string {
  if (rule.rule === "PIXELS") return TOO_MANY_PIXELS_MESSAGE;
  if (rule.rule === "FILE_SIZE")
    return `Ảnh vượt ${rule.maxFileSizeMb} MB, mức quy cách này cho phép.`;
  const names = rule.formats.map((format) => FORMAT_NAMES[format] ?? format);
  return `Quy cách này chỉ nhận ảnh ${names.join(", ")}.`;
}

/**
 * A 413 `PAYLOAD_TOO_LARGE` is also an image over 40 megapixels (BE `ImageDimensions`); only its `message` tells them
 * apart: "…40 megapixel…" in English, "…40 triệu điểm ảnh…" in Vietnamese (`refusal.image.tooManyPixels`).
 */
const isPixelRefusal = (error: ApiError) => /megapixel|điểm ảnh/i.test(error.message);

/**
 * The words for a file the BE refused with only a `message` (no `details`): 415 is a format the
 * template does not take, 413 `PAYLOAD_TOO_LARGE` a file over its size (F-24). The reason is built
 * from the design's template. Null for any other error.
 */
export function describeFileRefusal(
  error: unknown,
  template: { allowedFileFormats: readonly string[]; maxFileSizeMb: number },
): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 415) {
    return describeFileRule({ rule: "FORMAT", formats: [...template.allowedFileFormats] });
  }
  if (error.status === 413 && error.code === "PAYLOAD_TOO_LARGE") {
    if (isPixelRefusal(error)) return describeFileRule({ rule: "PIXELS" });
    return describeFileRule({ rule: "FILE_SIZE", maxFileSizeMb: template.maxFileSizeMb });
  }
  return null;
}

/**
 * 429 `RATE_LIMITED` with the BE's `Retry-After`: how long to wait, in minutes (rounded up, at least
 * one). Null for any other error, and for a 429 that names no wait.
 */
function describeWait(error: unknown): string | null {
  if (!hasErrorCode(error, "RATE_LIMITED") || error.retryAfterSeconds === undefined) return null;
  const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
  return `Bạn đã thao tác quá nhiều lần; thử lại sau ${minutes} phút.`;
}

/** Customer-facing text for any failure reaching the design UI. */
export function describeDesignError(error: unknown): string {
  return describeWait(error) ?? describeApiError(error, MESSAGE_BY_CODE);
}

const PROJECT_MESSAGE_BY_CODE: Record<string, string> = {
  ...MESSAGE_BY_CODE,
  CONFLICT: "Dự án đã thay đổi, hãy tải lại.", // a stale project version
  NOT_FOUND: "Không tìm thấy dự án này.",
};

/**
 * An upload to the project library refused by the BE: a 413 is an image over 40 megapixels or a file over the
 * library's `maxMb`, each in its own words (not the generic "over the allowed size"); anything else as a project error.
 */
export function describeLibraryUploadError(error: unknown, maxMb: number): string {
  if (error instanceof ApiError && error.status === 413 && error.code === "PAYLOAD_TOO_LARGE") {
    return isPixelRefusal(error)
      ? describeFileRule({ rule: "PIXELS" })
      : `Tệp lớn hơn ${maxMb} MB.`;
  }
  return describeProjectError(error);
}

/** Customer-facing text for a failure on a project screen: the generic codes name the project. */
export function describeProjectError(error: unknown): string {
  return describeWait(error) ?? describeApiError(error, PROJECT_MESSAGE_BY_CODE);
}

/** A write sent a stale version (409): the editor stops and offers a reload. */
export const isDesignConflict = (error: unknown) => hasErrorCode(error, "CONFLICT");

/** The design moved to another status meanwhile, e.g. in another tab (409): re-read it. */
export const isDesignStateChanged = (error: unknown) => hasErrorCode(error, "DESIGN_NOT_DRAFT");

/** The project a design was to start in refused it, full or closed (409): trying again cannot help. */
export const isProjectRefusal = (error: unknown) =>
  hasErrorCode(error, "DESIGN_PROJECT_FULL") || hasErrorCode(error, "DESIGN_PROJECT_ARCHIVED");

/** The design is not there any more (404 to a write): deleted in another tab. Re-read it. */
export const isDesignGone = (error: unknown) => error instanceof ApiError && error.status === 404;

/**
 * The BE judged the design's preflight Fail (`422 DESIGN_PREFLIGHT_FAILED`), whatever it lists. It
 * has written the failure into the design's history itself: the studio must not record it again.
 */
export const isPreflightRefusal = (error: unknown) =>
  hasErrorCode(error, "DESIGN_PREFLIGHT_FAILED");

/**
 * The failing checks of a `422 DESIGN_PREFLIGHT_FAILED` (`details.issues`: `{rule, surfaceCode?,
 * elementId?, message, values?}`), as the studio's issue list with a Vietnamese sentence per rule
 * (`toPreflightIssues`); null for any other error, or for one whose issues cannot be read.
 */
export function preflightIssuesOf(error: unknown): ReportedPreflightIssue[] | null {
  if (!isPreflightRefusal(error)) return null;
  const parsed = preflightFailedDetailsSchema.safeParse(error.details);
  return parsed.success ? toPreflightIssues(parsed.data.issues) : null;
}

/** The files of a design to draw again: those named, or all three when none named is known. */
function knownRoles(named: readonly string[]): DesignFileRole[] {
  const wanted = new Set(named);
  const known = designFileRoleSchema.options.filter((kind) => wanted.has(kind));
  return known.length > 0 ? known : [...designFileRoleSchema.options];
}

/**
 * The roles a `409 DESIGN_FILES_OUTDATED` says to draw again (`details.roles`: a file is missing or
 * was drawn from another layout, or the template changed since); null for any other error.
 */
export function outdatedRolesOf(error: unknown): DesignFileRole[] | null {
  if (!(error instanceof ApiError) || error.code !== "DESIGN_FILES_OUTDATED") return null;
  const parsed = filesOutdatedDetailsSchema.safeParse(error.details);
  // Roles that cannot be read mean every file is drawn again.
  return knownRoles(parsed.success ? parsed.data.roles : []);
}

const INTEGRITY_FAILED =
  "File đã duyệt này không qua được bước kiểm tra toàn vẹn nên chưa thể tải xuống. Vui lòng liên hệ cửa hàng để được hỗ trợ.";

const DOWNLOAD_UNAVAILABLE = "Chưa lấy được tệp lúc này. Vui lòng thử lại sau ít phút.";

/**
 * Words for a failed download of a design's file. The BE checks a file of the approved bundle
 * before it issues the link (`DesignServiceImpl.requireApprovedFileIntact`, d47ed4ae): a stored
 * file that no longer matches its checksum is 409 `CONFLICT` "Design integrity verification
 * failed"; one missing from the store is 503 `STORAGE_ERROR` (the store's `stat` fails), not the
 * 409 the contract names. A draft's or a pending design's file is not checked.
 */
export function describeFileDownloadError(error: unknown): string {
  if (hasErrorCode(error, "CONFLICT") && error.status === 409) return INTEGRITY_FAILED;
  if (hasErrorCode(error, "STORAGE_ERROR")) return DOWNLOAD_UNAVAILABLE;
  return describeDesignError(error);
}

/** One design of a refused batch: its findings (studio list), or the files to draw again. */
export type BatchFailure = {
  designId: string;
  issues: ReportedPreflightIssue[];
  roles: DesignFileRole[];
};

/**
 * The designs a `422 DESIGN_BATCH_PREFLIGHT_FAILED` names (`details.designs`): each with its
 * findings, in Vietnamese as for a single design, or with the roles whose files are outdated (an
 * entry with neither has every file drawn again). Null for any other error, and for one whose
 * `details` cannot be read or name no design: nothing then says what to fix.
 */
export function batchRefusalOf(error: unknown): BatchFailure[] | null {
  if (!hasErrorCode(error, "DESIGN_BATCH_PREFLIGHT_FAILED")) return null;
  const parsed = batchFailureDetailsSchema.safeParse(error.details);
  if (!parsed.success || parsed.data.designs.length === 0) return null;
  return parsed.data.designs.map((design) => {
    const issues = toPreflightIssues(design.issues ?? []);
    return {
      designId: design.designId,
      issues,
      roles: issues.length > 0 ? [] : knownRoles(design.roles ?? []),
    };
  });
}

/**
 * The designs a round refused with 409 `CONFLICT` (a stale version) or `DESIGN_NOT_DRAFT` names
 * (`details.designIds`, BE-4): every design of the batch with that refusal. Null for any other
 * error, and when the BE named none (an older BE, or a refusal met after the planning step).
 */
export function refusedDesignIdsOf(error: unknown): string[] | null {
  if (!hasErrorCode(error, "CONFLICT") && !isDesignStateChanged(error)) return null;
  return namedDesignIdsOf(error);
}

/**
 * The designs a batch refusal names: every refused design with its own code (`details.designs`,
 * S-1), else those of the answer's code (`details.designIds`). Null when it names none.
 */
function namedDesignIdsOf(error: unknown): string[] | null {
  if (!(error instanceof ApiError)) return null;
  const parsed = batchDesignIdsDetailsSchema.safeParse(error.details);
  if (!parsed.success) return null;
  const ids = parsed.data.designs?.map((design) => design.designId) ?? parsed.data.designIds ?? [];
  return ids.length > 0 ? ids : null;
}

/**
 * The designs a 404 to a round names as gone or out of the project. A 404 answer is the batch's
 * heaviest refusal: `details.designs` lists every refused design, the ones with another code
 * (`DESIGN_NOT_DRAFT`, `CONFLICT`) included, so only those coded `NOT_FOUND` are gone. Without
 * `designs`, `details.designIds` are the answer's own code, so all NOT_FOUND. Null when it names
 * none (d47ed4ae sends no `details`).
 */
export function goneDesignIdsOf(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.status !== 404) return null;
  const parsed = batchDesignIdsDetailsSchema.safeParse(error.details);
  if (!parsed.success) return null;
  const { designs, designIds } = parsed.data;
  const ids = designs
    ? designs.filter((design) => design.errorCode === "NOT_FOUND").map((design) => design.designId)
    : (designIds ?? []);
  return ids.length > 0 ? ids : null;
}
