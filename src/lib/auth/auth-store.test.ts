import { describe, expect, it } from "vitest";

import { useAuthStore } from "./auth-store";

describe("auth store", () => {
  it("requires only access-token metadata and no refresh token", () => {
    const tokens = {
      accessToken: "access",
      tokenType: "Bearer",
      expiresInSeconds: 28_800,
    };

    useAuthStore.getState().login(null, tokens);

    expect(useAuthStore.getState().tokens).toEqual(tokens);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
