import { describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

import { loginApi, logoutApi } from "./auth-api";

describe("auth API contract", () => {
  it("uses the access-token login contract without a refresh token or user payload", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({
      data: { accessToken: "access", tokenType: "Bearer", expiresInSeconds: 28_800 },
    });

    await expect(
      loginApi({ username: "customer@example.com", password: "Password1234" }),
    ).resolves.toEqual({
      accessToken: "access",
      tokenType: "Bearer",
      expiresInSeconds: 28_800,
    });
    expect(post).toHaveBeenCalledWith("/v1/identity/auth/login", {
      username: "customer@example.com",
      password: "Password1234",
    });
  });

  it("logs out through the server-side session endpoint without a refresh token body", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: undefined });

    await logoutApi();

    expect(post).toHaveBeenCalledWith("/v1/identity/auth/logout");
  });
});
