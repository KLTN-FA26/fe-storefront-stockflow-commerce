import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";

import { ApiError, type ApiErrorBody } from "./error";

describe("ApiError backend envelope", () => {
  it("normalizes errorCode, fieldErrors and correlationId", () => {
    const error = ApiError.from(
      new AxiosError("request failed", "ERR_BAD_REQUEST", undefined, undefined, {
        data: {
          success: false,
          errorCode: "VALIDATION_FAILED",
          message: "Dữ liệu không hợp lệ",
          fieldErrors: [
            { field: "currentPassword", message: "Mật khẩu hiện tại không đúng", code: "Invalid" },
            { field: "newPassword", message: "Mật khẩu quá yếu", code: "Pattern" },
          ],
          correlationId: "corr-123",
          timestamp: "2026-09-21T00:00:00Z",
        },
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config: {} as never,
      }),
    );

    expect(error.status).toBe(400);
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.fieldErrors).toEqual({
      currentPassword: "Mật khẩu hiện tại không đúng",
      newPassword: "Mật khẩu quá yếu",
    });
    expect(error.fieldErrorDetails[0]?.code).toBe("Invalid");
    expect(error.correlationId).toBe("corr-123");
  });
});

describe("ApiError details", () => {
  const failure = (data: unknown) =>
    ApiError.from(
      new AxiosError("request failed", "ERR_BAD_REQUEST", undefined, undefined, {
        data: data as ApiErrorBody,
        status: 409,
        statusText: "Conflict",
        headers: {},
        config: {} as never,
      }),
    );

  it("keeps the structured details the BE sends", () => {
    const error = failure({
      success: false,
      errorCode: "BALANCE_CREDIT_LIMIT_EXCEEDED",
      message: "x",
      details: { availableCredit: 100, currency: "VND" },
    });
    expect(error.details).toEqual({ availableCredit: 100, currency: "VND" });
  });

  it("has no details when the BE sends none or sends something that is not an object", () => {
    expect(failure({ errorCode: "NOT_FOUND", message: "x" }).details).toBeUndefined();
    expect(failure({ errorCode: "X", message: "x", details: [1] }).details).toBeUndefined();
  });
});
