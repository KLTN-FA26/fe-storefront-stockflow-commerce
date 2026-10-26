import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiError } from "@/lib/api/error";

import { describeDesignError, isDesignApiUnavailable, isDesignConflict } from "../errors";

const apiError = (status: number, code: string) => new ApiError(status, code, "dev text");

describe("describeDesignError", () => {
  it.each([
    ["CONFLICT", 409, "Thiết kế đã thay đổi, hãy tải lại."],
    ["OPTIMISTIC_LOCK", 409, "Thiết kế đã thay đổi, hãy tải lại."],
    ["PAYLOAD_TOO_LARGE", 413, "Tệp vượt dung lượng cho phép."],
    ["UNSUPPORTED_MEDIA_TYPE", 415, "Định dạng tệp không được hỗ trợ."],
    ["PRODUCT_NOT_CUSTOMIZABLE", 409, "Sản phẩm này không hỗ trợ thiết kế."],
    ["TEMPLATE_NOT_FOUND", 422, "Phiên bản này chưa có mẫu thiết kế."],
    ["DESIGN_API_UNAVAILABLE", 404, "Tính năng này chưa mở."],
  ])("answers %s in Vietnamese", (code, status, message) => {
    expect(describeDesignError(apiError(status, code))).toBe(message);
  });

  it("has its own text for the codes a design screen can hit", () => {
    const generic = describeDesignError(apiError(400, "SOMETHING_ELSE"));
    for (const [status, code] of [
      [422, "IDEMPOTENCY_KEY_REUSED"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
      [404, "PRODUCT_NOT_FOUND"],
      [409, "DESIGN_ARTIFACT_MISSING"],
    ] as const) {
      expect(describeDesignError(apiError(status, code))).not.toBe(generic);
    }
  });

  it("falls back to the shared messages and never shows the BE's developer text", () => {
    expect(describeDesignError(apiError(500, "INTERNAL"))).toContain("Hệ thống đang gặp sự cố");
    expect(describeDesignError(apiError(400, "WEIRD"))).not.toContain("dev text");
    expect(describeDesignError(new z.ZodError([]))).toContain("không đúng định dạng");
    expect(describeDesignError(new Error("boom"))).toBe("Đã xảy ra lỗi. Vui lòng thử lại.");
  });
});

describe("error predicates", () => {
  it("recognises a version conflict, including a lost optimistic-lock race", () => {
    expect(isDesignConflict(apiError(409, "CONFLICT"))).toBe(true);
    expect(isDesignConflict(apiError(409, "OPTIMISTIC_LOCK"))).toBe(true);
    expect(isDesignConflict(apiError(404, "NOT_FOUND"))).toBe(false);
    expect(isDesignConflict(new Error("x"))).toBe(false);
  });

  it("recognises a design endpoint the BE has not shipped", () => {
    expect(isDesignApiUnavailable(apiError(404, "DESIGN_API_UNAVAILABLE"))).toBe(true);
    expect(isDesignApiUnavailable(apiError(404, "NOT_FOUND"))).toBe(false);
  });
});
