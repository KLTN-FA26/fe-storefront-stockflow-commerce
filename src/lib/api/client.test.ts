import { AxiosError, type AxiosAdapter } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./client";
import { ApiError } from "./error";
import { useAuthStore } from "@/lib/auth/auth-store";

const originalAdapter = api.defaults.adapter;

function rejectedAdapter(status: number, body: Record<string, unknown>): AxiosAdapter {
  return async (config) => {
    const response = {
      data: body,
      status,
      statusText: status === 401 ? "Unauthorized" : "Bad Request",
      headers: {},
      config,
    };
    throw new AxiosError(
      body.message as string | undefined,
      undefined,
      config,
      undefined,
      response,
    );
  };
}

afterEach(() => {
  if (originalAdapter) api.defaults.adapter = originalAdapter;
  else delete api.defaults.adapter;
  useAuthStore.getState().logout();
  vi.restoreAllMocks();
});

describe("API authentication semantics", () => {
  it("unwraps a successful backend ApiResponse envelope once", async () => {
    api.defaults.adapter = async (config) => ({
      data: {
        success: true,
        data: { accessToken: "access", tokenType: "Bearer", expiresInSeconds: 28_800 },
        timestamp: "2026-09-21T00:00:00Z",
      },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    });

    await expect(api.get("/identity/auth/login")).resolves.toMatchObject({
      data: { accessToken: "access", tokenType: "Bearer", expiresInSeconds: 28_800 },
    });
  });

  it("clears auth state and redirects on 401 without making a refresh request", async () => {
    useAuthStore.getState().login(null, {
      accessToken: "expired",
      tokenType: "Bearer",
      expiresInSeconds: 28_800,
    });
    const replace = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ replace } as unknown as Location);
    const adapter = vi.fn(
      rejectedAdapter(401, {
        success: false,
        errorCode: "UNAUTHORIZED",
        message: "Not authenticated",
        correlationId: "corr-401",
      }),
    );
    api.defaults.adapter = adapter;

    await expect(api.get("/customer/profile")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().tokens).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0]?.[0].url).toBe("/customer/profile");
  });

  it("does not clear auth state or redirect for a 400 password validation error", async () => {
    useAuthStore.getState().login(null, {
      accessToken: "valid",
      tokenType: "Bearer",
      expiresInSeconds: 28_800,
    });
    const replace = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ replace } as unknown as Location);
    api.defaults.adapter = rejectedAdapter(400, {
      success: false,
      errorCode: "INVALID_CURRENT_PASSWORD",
      message: "Mật khẩu hiện tại không đúng",
      correlationId: "corr-400",
    });

    await expect(
      api.put("/identity/auth/password", { currentPassword: "wrong" }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(replace).not.toHaveBeenCalled();
  });
});
