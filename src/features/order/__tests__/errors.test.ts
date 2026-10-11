import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/error";

import { describeCancelError, describeError, isNotFound } from "../errors";

describe("order error helpers", () => {
  it("treats only NOT_FOUND as a missing order, not a missing customer profile", () => {
    expect(isNotFound(new ApiError(404, "NOT_FOUND", "No order with id x"))).toBe(true);
    expect(isNotFound(new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found"))).toBe(false);
  });

  it("explains a 409 CONFLICT in Vietnamese and keeps the correlation id", () => {
    const conflict = new ApiError(
      409,
      "CONFLICT",
      "Order SO-1 cannot be cancelled from status SHIPPED; raise a return instead",
      undefined,
      "corr-409",
    );
    const message = describeCancelError(conflict);
    expect(message).toContain("không thể huỷ nữa");
    expect(message).toContain("Mã tra cứu: corr-409");
    expect(message).not.toContain("SHIPPED");
  });

  it("explains a cancelled order that is no longer visible", () => {
    expect(describeCancelError(new ApiError(404, "NOT_FOUND", "No order with id x"))).toBe(
      "Không tìm thấy đơn hàng này trong tài khoản của bạn.",
    );
  });

  it.each([
    [new ApiError(403, "FORBIDDEN", "Missing permission: sales-orders:READ"), "không có quyền"],
    [new ApiError(404, "NOT_FOUND", "No order with id 1"), "Không tìm thấy đơn hàng."],
    [new ApiError(400, "UNSUPPORTED_PARAMETER", "Page number must not be negative"), "Yêu cầu không hợp lệ"],
    [new ApiError(500, "INTERNAL_ERROR", "Something went wrong on our side"), "Hệ thống đang gặp sự cố"],
    [new ApiError(502, "HTTP_502", "Request failed with status code 502"), "Hệ thống đang gặp sự cố"],
    [new ApiError(418, "TEAPOT", "I'm a teapot"), "Không thực hiện được yêu cầu"],
  ])("never shows the raw BE message (%#)", (error, expected) => {
    const message = describeError(error);
    expect(message).toContain(expected);
    expect(message).not.toContain(error.message);
  });

  it("falls back to the general message for other failures", () => {
    expect(
      describeCancelError(new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ.")),
    ).toBe("Không kết nối được máy chủ.");
  });
});
