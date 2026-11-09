import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiError } from "@/lib/api/error";

import {
  describeDesignError,
  isDesignConflict,
  isDesignStateChanged,
  preflightIssuesOf,
} from "../errors";

const apiError = (status: number, code: string, details?: Record<string, unknown>) =>
  new ApiError(status, code, "dev text", undefined, undefined, details);

describe("describeDesignError", () => {
  it.each([
    ["VERSION_CONFLICT", 409, "Thiết kế đã thay đổi, hãy tải lại."],
    ["INVALID_STATE", 409, "Thiết kế đã chuyển trạng thái, hãy tải lại."],
    ["DRAFT_LIMIT", 409, "Bạn đã có 50 bản nháp. Hãy xoá bớt trước khi tạo bản mới."],
    ["PRINT_CONFIG_MISSING", 422, "Quy cách này chưa nhận thiết kế."],
    ["VARIANT_UNAVAILABLE", 422, "Quy cách này hiện không còn nhận thiết kế."],
    ["FILE_REJECTED", 422, "Tệp không đúng định dạng hoặc vượt dung lượng cho phép."],
    ["PREFLIGHT_FAILED", 422, "Thiết kế chưa đạt kiểm tra tự động."],
  ])("answers %s in Vietnamese", (code, status, message) => {
    expect(describeDesignError(apiError(status, code))).toBe(message);
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

  it("falls back to the shared messages and never shows the BE's developer text", () => {
    expect(describeDesignError(apiError(500, "DESIGN_MOCK_FAILED"))).toContain(
      "Hệ thống đang gặp sự cố",
    );
    expect(describeDesignError(apiError(400, "WEIRD"))).not.toContain("dev text");
    expect(describeDesignError(new z.ZodError([]))).toContain("không đúng định dạng");
    expect(describeDesignError(new Error("boom"))).toBe("Đã xảy ra lỗi. Vui lòng thử lại.");
  });

  it("no longer knows the old BE's conflict codes", () => {
    expect(describeDesignError(apiError(409, "CONFLICT"))).not.toBe(
      "Thiết kế đã thay đổi, hãy tải lại.",
    );
  });
});

describe("error predicates", () => {
  it("recognises a stale version (409 VERSION_CONFLICT) and nothing else as a conflict", () => {
    expect(isDesignConflict(apiError(409, "VERSION_CONFLICT"))).toBe(true);
    expect(isDesignConflict(apiError(409, "INVALID_STATE"))).toBe(false);
    expect(isDesignConflict(apiError(409, "CONFLICT"))).toBe(false);
    expect(isDesignConflict(new Error("x"))).toBe(false);
  });

  it("recognises a design that moved to another status (409 INVALID_STATE)", () => {
    expect(isDesignStateChanged(apiError(409, "INVALID_STATE"))).toBe(true);
    expect(isDesignStateChanged(apiError(409, "VERSION_CONFLICT"))).toBe(false);
    expect(isDesignStateChanged(undefined)).toBe(false);
  });
});

describe("preflightIssuesOf", () => {
  const issues = [
    { ruleId: "EMPTY_DESIGN", level: "fail", message: "Thiết kế chưa có nội dung." },
    {
      ruleId: "ASSET_INVALID",
      level: "fail",
      message: "Ảnh không hợp lệ hoặc không tải được.",
      surfaceCode: "BODY",
      elementId: "el-1",
    },
  ];

  it("reads the issues of a 422 PREFLIGHT_FAILED from its details", () => {
    expect(preflightIssuesOf(apiError(422, "PREFLIGHT_FAILED", { issues }))).toEqual(issues);
  });

  it("is null for any other error", () => {
    expect(preflightIssuesOf(apiError(422, "FILE_REJECTED", { issues }))).toBeNull();
    expect(preflightIssuesOf(new Error("x"))).toBeNull();
    expect(preflightIssuesOf(null)).toBeNull();
  });

  it("is null for a PREFLIGHT_FAILED whose body it cannot read", () => {
    expect(preflightIssuesOf(apiError(422, "PREFLIGHT_FAILED"))).toBeNull();
    expect(preflightIssuesOf(apiError(422, "PREFLIGHT_FAILED", { issues: "x" }))).toBeNull();
    expect(
      preflightIssuesOf(
        apiError(422, "PREFLIGHT_FAILED", { issues: [{ ruleId: "NOPE", level: "fail" }] }),
      ),
    ).toBeNull();
  });
});
