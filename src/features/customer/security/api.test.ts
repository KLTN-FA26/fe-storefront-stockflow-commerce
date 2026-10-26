import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

import { changePassword } from "./api";
import { changePasswordSchema } from "./schemas";

afterEach(() => vi.restoreAllMocks());

const valid = {
  currentPassword: "CurrentPass1",
  newPassword: "NewPassword1",
  confirmNewPassword: "NewPassword1",
  logoutOtherDevices: false,
};

describe("change password contract", () => {
  it.each([
    ["too short", "Short1"],
    ["too long", "A".repeat(73) + "a1"],
    ["missing uppercase", "newpassword1"],
    ["missing lowercase", "NEWPASSWORD1"],
    ["missing digit", "NewPassword"],
  ])("rejects a password that is %s", (_label, newPassword) => {
    expect(() => changePasswordSchema.parse({ ...valid, newPassword })).toThrow();
  });

  it("rejects a confirmation mismatch", () => {
    expect(() =>
      changePasswordSchema.parse({ ...valid, confirmNewPassword: "DifferentPass1" }),
    ).toThrow();
  });

  it("accepts the backend-compatible password policy", () => {
    expect(changePasswordSchema.parse(valid)).toEqual(valid);
  });

  it("sends only the backend request fields and preserves the response", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValueOnce({ data: { revokedSessions: 2 } });

    await expect(
      changePassword({
        currentPassword: valid.currentPassword,
        newPassword: valid.newPassword,
        logoutOtherDevices: true,
      }),
    ).resolves.toEqual({ revokedSessions: 2 });

    expect(put).toHaveBeenCalledWith("/identity/auth/password", {
      currentPassword: valid.currentPassword,
      newPassword: valid.newPassword,
      logoutOtherDevices: true,
    });
    expect(put.mock.calls[0]?.[1]).not.toHaveProperty("confirmNewPassword");
  });
});
