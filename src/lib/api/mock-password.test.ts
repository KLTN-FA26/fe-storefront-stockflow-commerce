import { describe, expect, it } from "vitest";

import { mockPasswordResponse } from "./mock-routes";

describe("mock password contract", () => {
  it("returns success with deterministic revoked session counts", () => {
    expect(
      mockPasswordResponse({
        currentPassword: "CurrentPass123",
        newPassword: "NewPassword1",
        logoutOtherDevices: false,
      }).data,
    ).toMatchObject({ success: true, data: { revokedSessions: 0 } });
    expect(
      mockPasswordResponse({
        currentPassword: "CurrentPass123",
        newPassword: "NewPassword1",
        logoutOtherDevices: true,
      }).data,
    ).toMatchObject({ success: true, data: { revokedSessions: 2 } });
  });

  it("mirrors validation and stable backend error codes", () => {
    expect(
      mockPasswordResponse({ currentPassword: "CurrentPass123", newPassword: "weak" }).data,
    ).toMatchObject({ success: false, errorCode: "VALIDATION_FAILED" });
    expect(
      mockPasswordResponse({ currentPassword: "wrong", newPassword: "NewPassword1" }).data,
    ).toMatchObject({ success: false, errorCode: "INVALID_CURRENT_PASSWORD" });
    expect(
      mockPasswordResponse({ currentPassword: "CurrentPass123", newPassword: "CurrentPass123" })
        .data,
    ).toMatchObject({ success: false, errorCode: "PASSWORD_UNCHANGED" });
  });
});
