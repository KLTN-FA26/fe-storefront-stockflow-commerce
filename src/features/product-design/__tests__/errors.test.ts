import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiError } from "@/lib/api/error";

import {
  describeDesignError,
  describeFileDownloadError,
  describeFileRefusal,
  describeLibraryUploadError,
  describeProjectError,
  isDesignConflict,
  isDesignStateChanged,
  isProjectRefusal,
  outdatedRolesOf,
  preflightIssuesOf,
} from "../errors";

const apiError = (status: number, code: string, details?: Record<string, unknown>) =>
  new ApiError(status, code, "dev text", undefined, undefined, details);

describe("describeDesignError: 429 with Retry-After", () => {
  const limited = (retryAfterSeconds?: number) =>
    new ApiError(429, "RATE_LIMITED", "x", undefined, undefined, undefined, retryAfterSeconds);

  it("429 with Retry-After 600 reads 'thử lại sau 10 phút'", () => {
    expect(describeDesignError(limited(600))).toBe(
      "Bạn đã thao tác quá nhiều lần; thử lại sau 10 phút.",
    );
    expect(describeProjectError(limited(600))).toContain("thử lại sau 10 phút");
  });

  it("rounds up to whole minutes, at least one", () => {
    expect(describeDesignError(limited(61))).toContain("sau 2 phút");
    expect(describeDesignError(limited(1))).toContain("sau 1 phút");
  });

  it("keeps the general sentence when the 429 names no wait", () => {
    expect(describeDesignError(limited())).toContain("Vui lòng thử lại sau ít phút");
  });
});

describe("describeDesignError", () => {
  // The BE's own codes (F-2): each reads as the old code it replaces.
  it.each([
    ["CONFLICT", 409, "Thiết kế đã thay đổi, hãy tải lại."],
    ["DESIGN_NOT_DRAFT", 409, "Thiết kế đã chuyển trạng thái, hãy tải lại."],
    [
      "DESIGN_DRAFT_LIMIT_REACHED",
      409,
      "Bạn đã có 50 bản nháp. Hãy xoá bớt trước khi tạo bản mới.",
    ],
    ["PRINT_CONFIG_NOT_FOUND", 404, "Quy cách này chưa nhận thiết kế."],
    ["PRODUCT_NOT_CUSTOMIZABLE", 409, "Sản phẩm này hiện không nhận thiết kế."],
    ["CUSTOMER_NOT_ACTIVE", 409, "Tài khoản của bạn hiện chưa thể bắt đầu thiết kế mới."],
    ["DESIGN_PROJECT_FULL", 409, "Dự án đã đủ 20 bản."],
    ["DESIGN_PROJECT_ARCHIVED", 409, "Dự án đã đóng."],
    ["DESIGN_PROJECT_HAS_PENDING", 409, "Còn bản đang chờ duyệt, chưa thể đóng dự án."],
    ["DESIGN_IN_ANOTHER_PROJECT", 409, "Thiết kế này đã thuộc một dự án khác."],
    ["DESIGN_PENDING_IN_PROJECT", 409, "Bản đang chờ duyệt, chưa thể gỡ khỏi dự án."],
    ["DESIGN_PROJECT_LIBRARY_FULL", 409, "Thư viện đã đủ số lượng cho phép (30 ảnh, 30 mẫu chữ)."],
    [
      "DESIGN_CLONE_TARGET_INVALID",
      409,
      "Không nhân bản được sang quy cách này. Hãy chọn quy cách khác.",
    ],
    ["DESIGN_BATCH_PREFLIGHT_FAILED", 422, "Có bản chưa đạt kiểm tra nên chưa bản nào được gửi."],
    ["VALIDATION_FAILED", 400, "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại."],
    [
      "RATE_LIMITED",
      429,
      "Bạn thao tác quá nhanh hoặc đã tải lên quá nhiều ảnh. Vui lòng thử lại sau ít phút.",
    ],
    ["UNSUPPORTED_MEDIA_TYPE", 415, "Tệp không đúng định dạng mà quy cách này nhận."],
    ["REQUEST_BODY_TOO_LARGE", 413, "Thiết kế quá phức tạp để lưu. Hãy bớt chi tiết rồi thử lại."],
    ["PAYLOAD_TOO_LARGE", 413, "Tệp vượt dung lượng cho phép."],
    ["DESIGN_ASSET_LIMIT_REACHED", 409, "Thiết kế này đã có tối đa 100 ảnh."],
  ])("answers the BE's %s in Vietnamese", (code, status, message) => {
    expect(describeDesignError(apiError(status, code))).toBe(message);
  });

  it("no longer words the front end's first contract's codes: the BE never sends them", () => {
    const generic = describeDesignError(apiError(409, "SOMETHING_ELSE"));
    for (const code of [
      "VERSION_CONFLICT",
      "INVALID_STATE",
      "DRAFT_LIMIT",
      "PRINT_CONFIG_MISSING",
      "VARIANT_UNAVAILABLE",
      "VARIANT_NOT_ELIGIBLE",
      "FILE_REJECTED",
      "PREFLIGHT_FAILED",
      "PROJECT_FULL",
      "PROJECT_ARCHIVED",
      "PROJECT_HAS_PENDING",
      "LIBRARY_FULL",
      "NOT_IN_PROJECT",
      "FILE_RULE",
      "SET_TOO_SMALL",
      "VERSION_CHANGED",
    ]) {
      expect(describeDesignError(apiError(409, code)), code).toBe(generic);
    }
  });

  it("has its own text for the other codes a design screen can hit", () => {
    const generic = describeDesignError(apiError(400, "SOMETHING_ELSE"));
    for (const [status, code] of [
      [413, "PAYLOAD_TOO_LARGE"],
      [422, "IDEMPOTENCY_KEY_REUSED"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
    ] as const) {
      expect(describeDesignError(apiError(status, code))).not.toBe(generic);
    }
  });

  // The rest of the BE's `ErrorCode`s a design endpoint answers: each has Vietnamese text of its own.
  it.each([
    ["PRODUCT_NOT_FOUND", 404],
    ["MALFORMED_REQUEST", 400],
    ["DESIGN_NOT_APPROVED", 409],
    ["IDEMPOTENT_REQUEST_IN_PROGRESS", 409],
    ["STORAGE_ERROR", 503],
  ] as const)("words %s", (code, status) => {
    const text = describeDesignError(apiError(status, code));
    expect(text).not.toBe(describeDesignError(apiError(status, "SOMETHING_ELSE")));
    expect(text).toMatch(
      /[ạảãàáâấầẩẫậăắằẳẵặẹẻẽèéêếềểễệịỉĩìíọỏõòóôốồổỗộơớờởỡợụủũùúưứừửữựỳỷỹỵđ]|không/i,
    );
  });

  it("falls back to the shared messages and never shows the BE's developer text", () => {
    expect(describeDesignError(apiError(500, "DESIGN_MOCK_FAILED"))).toContain(
      "Hệ thống đang gặp sự cố",
    );
    expect(describeDesignError(apiError(400, "WEIRD"))).not.toContain("dev text");
    expect(describeDesignError(new z.ZodError([]))).toContain("không đúng định dạng");
    expect(describeDesignError(new Error("boom"))).toBe("Đã xảy ra lỗi. Vui lòng thử lại.");
  });
});

describe("describeProjectError", () => {
  it("names the project for the generic codes the BE shares with designs", () => {
    expect(describeProjectError(apiError(409, "CONFLICT"))).toBe("Dự án đã thay đổi, hãy tải lại.");
    expect(describeProjectError(apiError(404, "NOT_FOUND"))).toBe("Không tìm thấy dự án này.");
    expect(describeProjectError(apiError(409, "DESIGN_PROJECT_ARCHIVED"))).toBe("Dự án đã đóng.");
  });
});

describe("describeFileRefusal (the BE sends 415 and 413 with a message only, F-24)", () => {
  const template = { allowedFileFormats: ["image/png", "image/jpeg"], maxFileSizeMb: 20 };

  it("words a 415 from the template's formats and a 413 PAYLOAD_TOO_LARGE from its size", () => {
    expect(describeFileRefusal(apiError(415, "UNSUPPORTED_MEDIA_TYPE"), template)).toBe(
      "Quy cách này chỉ nhận ảnh PNG, JPG.",
    );
    expect(describeFileRefusal(apiError(413, "PAYLOAD_TOO_LARGE"), template)).toBe(
      "Ảnh vượt 20 MB, mức quy cách này cho phép.",
    );
  });

  it("words the BE's Vietnamese 413 over 40 megapixels as pixels too", () => {
    const pixels = new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Ảnh quá lớn: tối đa 40 triệu điểm ảnh, hãy giảm kích thước ảnh rồi tải lại.",
    );
    const template = { allowedFileFormats: ["image/png"], maxFileSizeMb: 50 };
    expect(describeFileRefusal(pixels, template)).toMatch(/40 megapixel/);
    expect(describeLibraryUploadError(pixels, 50)).toMatch(/40 megapixel/);
    const bytes = new ApiError(413, "PAYLOAD_TOO_LARGE", "File quá lớn: tối đa 50 MB.");
    expect(describeLibraryUploadError(bytes, 50)).toBe("Tệp lớn hơn 50 MB.");
  });

  it("words a 413 over 40 megapixels as pixels, not as megabytes, and names WebP", () => {
    const pixels = new ApiError(413, "PAYLOAD_TOO_LARGE", "Image exceeds the 40 megapixel limit");
    const shown = describeFileRefusal(pixels, template);
    expect(shown).toContain("megapixel");
    expect(shown).not.toContain("MB");
    expect(
      describeFileRefusal(apiError(415, "UNSUPPORTED_MEDIA_TYPE"), {
        ...template,
        allowedFileFormats: ["image/png", "image/webp"],
      }),
    ).toBe("Quy cách này chỉ nhận ảnh PNG, WebP.");
  });

  it("is null for any other failure, so its own text stands (a 413 of the layout is not a file's)", () => {
    expect(describeFileRefusal(apiError(413, "REQUEST_BODY_TOO_LARGE"), template)).toBeNull();
    expect(describeFileRefusal(apiError(429, "RATE_LIMITED"), template)).toBeNull();
    expect(describeFileRefusal(new Error("x"), template)).toBeNull();
  });
});

describe("error predicates", () => {
  it("recognises a stale version (the BE's 409 CONFLICT) as a conflict, and nothing else", () => {
    expect(isDesignConflict(apiError(409, "CONFLICT"))).toBe(true);
    expect(isDesignConflict(apiError(409, "DESIGN_NOT_DRAFT"))).toBe(false);
    expect(isDesignConflict(new Error("x"))).toBe(false);
  });

  it("recognises a design that moved to another status (409 DESIGN_NOT_DRAFT)", () => {
    expect(isDesignStateChanged(apiError(409, "DESIGN_NOT_DRAFT"))).toBe(true);
    expect(isDesignStateChanged(apiError(409, "CONFLICT"))).toBe(false);
    expect(isDesignStateChanged(undefined)).toBe(false);
  });

  it("recognises a project that refused a new design (full or closed)", () => {
    for (const code of ["DESIGN_PROJECT_FULL", "DESIGN_PROJECT_ARCHIVED"]) {
      expect(isProjectRefusal(apiError(409, code))).toBe(true);
    }
    expect(isProjectRefusal(apiError(409, "CONFLICT"))).toBe(false);
  });
});

describe("preflightIssuesOf", () => {
  // `422 DESIGN_PREFLIGHT_FAILED`: `{rule, surfaceCode?, elementId?, message, values?}`, no level.
  const issues = [
    { rule: "EMPTY_DESIGN", message: "The design has nothing to print" },
    {
      rule: "ASSET_INVALID",
      message: "The image is not one of this design's",
      surfaceCode: "BODY",
      elementId: "el-1",
    },
  ];
  const studio = [
    { ruleId: "EMPTY_DESIGN", level: "fail", message: "Thiết kế chưa có nội dung." },
    {
      ruleId: "ASSET_INVALID",
      level: "fail",
      message: "Ảnh không hợp lệ hoặc không tải được.",
      surfaceCode: "BODY",
      elementId: "el-1",
    },
  ];

  it("reads the findings of a 422 DESIGN_PREFLIGHT_FAILED into the studio's list, in Vietnamese", () => {
    expect(preflightIssuesOf(apiError(422, "DESIGN_PREFLIGHT_FAILED", { issues }))).toEqual(studio);
  });

  it("is null for any other error, the old code included", () => {
    expect(preflightIssuesOf(apiError(422, "FILE_REJECTED", { issues }))).toBeNull();
    expect(preflightIssuesOf(apiError(422, "PREFLIGHT_FAILED", { issues }))).toBeNull();
    expect(preflightIssuesOf(new Error("x"))).toBeNull();
    expect(preflightIssuesOf(null)).toBeNull();
  });

  it("reads a rule it does not know, with a generic sentence and its code, never the BE's English", () => {
    const added = { rule: "BLEED_MISSING", message: "The bleed is missing" };

    const read = preflightIssuesOf(
      apiError(422, "DESIGN_PREFLIGHT_FAILED", { issues: [added, ...issues] }),
    );

    expect(read).toEqual([
      {
        ruleId: "BLEED_MISSING",
        level: "fail",
        message: "Thiết kế chưa đạt một kiểm tra tự động.",
      },
      ...studio,
    ]);
  });

  it("is null for a DESIGN_PREFLIGHT_FAILED whose body it cannot read", () => {
    expect(preflightIssuesOf(apiError(422, "DESIGN_PREFLIGHT_FAILED"))).toBeNull();
    expect(preflightIssuesOf(apiError(422, "DESIGN_PREFLIGHT_FAILED", { issues: "x" }))).toBeNull();
    for (const unreadable of [{ message: "no rule" }, { rule: "" }]) {
      expect(
        preflightIssuesOf(apiError(422, "DESIGN_PREFLIGHT_FAILED", { issues: [unreadable] })),
      ).toBeNull();
    }
  });
});

describe("outdatedRolesOf and the file errors", () => {
  it("reads the roles a 409 DESIGN_FILES_OUTDATED names, in the studio's order", () => {
    expect(
      outdatedRolesOf(
        apiError(409, "DESIGN_FILES_OUTDATED", { roles: ["TECHNICAL_SPEC", "PRINT_READY"] }),
      ),
    ).toEqual(["PRINT_READY", "TECHNICAL_SPEC"]);
  });

  it("repairs all three files when it names none it knows, and is null for any other error", () => {
    expect(
      outdatedRolesOf(apiError(409, "DESIGN_FILES_OUTDATED", { roles: ["NEW_ROLE"] })),
    ).toEqual(["CUSTOMER_PREVIEW", "PRINT_READY", "TECHNICAL_SPEC"]);
    expect(outdatedRolesOf(apiError(409, "DESIGN_FILES_OUTDATED"))).toHaveLength(3);
    expect(outdatedRolesOf(apiError(409, "CONFLICT"))).toBeNull();
    expect(outdatedRolesOf(new Error("x"))).toBeNull();
  });

  it("words the files' own refusals, and the integrity failure of an approved file apart from a stale version", () => {
    expect(describeDesignError(apiError(409, "DESIGN_FILES_OUTDATED"))).toContain("gửi duyệt lại");
    expect(describeDesignError(apiError(409, "DESIGN_PREFLIGHT_FAILED"))).toBe(
      "Thiết kế chưa đạt kiểm tra tự động.",
    );
    expect(describeFileDownloadError(apiError(409, "CONFLICT"))).toMatch(
      /kiểm tra toàn vẹn.*liên hệ cửa hàng/,
    );
    // The same code on a write is a stale version: its own text.
    expect(describeDesignError(apiError(409, "CONFLICT"))).toBe(
      "Thiết kế đã thay đổi, hãy tải lại.",
    );
    expect(describeFileDownloadError(apiError(404, "NOT_FOUND"))).toBe(
      describeDesignError(apiError(404, "NOT_FOUND")),
    );
  });
});
