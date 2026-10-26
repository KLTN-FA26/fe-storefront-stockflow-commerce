import { describe, expect, it } from "vitest";
import { z } from "zod";

import { describeApiError, hasErrorCode, isForbiddenError, withLookup } from "./describe-error";
import { ApiError } from "./error";

const err = (status: number, code: string, message = "English developer text", id?: string) =>
  new ApiError(status, code, message, undefined, id);

describe("describeApiError", () => {
  it("chooses Vietnamese text by errorCode and never shows the BE message", () => {
    const message = describeApiError(
      err(403, "FORBIDDEN", "Missing permission: sales-orders:READ"),
    );
    expect(message).toContain("không có quyền");
    expect(message).not.toContain("Missing permission");
  });

  it("lets a feature override the common table and add its own codes", () => {
    const table = { FORBIDDEN: "Riêng", MY_CODE: "Mã riêng" };
    expect(describeApiError(err(403, "FORBIDDEN"), table)).toBe("Riêng");
    expect(describeApiError(err(409, "MY_CODE"), table)).toBe("Mã riêng");
  });

  it("appends the correlation id for support", () => {
    expect(describeApiError(err(429, "RATE_LIMITED", "x", "corr-1"))).toMatch(
      /\(Mã tra cứu: corr-1\)$/,
    );
    expect(withLookup("Xin chào", err(400, "X"))).toBe("Xin chào");
  });

  it("falls back by status: server fault, unknown 4xx, network", () => {
    expect(describeApiError(err(500, "INTERNAL_ERROR"))).toContain("Hệ thống đang gặp sự cố");
    expect(describeApiError(err(409, "NEW_CODE"))).toContain("Không thực hiện được yêu cầu");
    expect(describeApiError(new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ."))).toBe(
      "Không kết nối được máy chủ.",
    );
  });

  it("explains a contract break without the zod issues, and an unknown throw generically", () => {
    const failure = z.object({ a: z.string() }).safeParse({ a: 1 });
    expect(describeApiError(failure.error)).toContain("không đúng định dạng");
    expect(describeApiError(failure.error)).not.toContain("expected");
    expect(describeApiError(new Error("boom"))).toBe("Đã xảy ra lỗi. Vui lòng thử lại.");
  });

  it("recognises codes", () => {
    expect(hasErrorCode(err(404, "NOT_FOUND"), "NOT_FOUND")).toBe(true);
    expect(hasErrorCode(new Error("x"), "NOT_FOUND")).toBe(false);
    expect(isForbiddenError(err(403, "FORBIDDEN"))).toBe(true);
  });
});
