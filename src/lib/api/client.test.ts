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
    vi.spyOn(window, "location", "get").mockReturnValue({
      replace,
      pathname: "/cart",
      search: "?a=1",
    } as unknown as Location);
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
    // Back to where the customer was after signing in again.
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fcart%3Fa%3D1");
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

  it("does not bounce a wrong password: a 401 from the login endpoint is the form's to show", async () => {
    const replace = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      replace,
      pathname: "/login",
      search: "",
    } as unknown as Location);
    api.defaults.adapter = rejectedAdapter(401, {
      success: false,
      errorCode: "UNAUTHORIZED",
      message: "Invalid username or password",
    });

    await expect(
      api.post("/identity/auth/login", { username: "a", password: "b" }),
    ).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends no bearer to the anonymous endpoints: a stale token would be refused before they run", async () => {
    useAuthStore
      .getState()
      .login(null, { accessToken: "stale", tokenType: "Bearer", expiresInSeconds: 1 });
    const seen: Array<string | undefined> = [];
    api.defaults.adapter = async (config) => {
      seen.push(config.headers.get("Authorization") as string | undefined);
      return {
        data: { success: true, data: {} },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };
    await api.post("/identity/auth/login", { username: "a", password: "b" });
    await api.get("/customers/me");
    expect(seen).toEqual([undefined, "Bearer stale"]);
  });

  it("does not send a token whose own exp has passed: signs out and goes to the login page", async () => {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 }));
    useAuthStore.getState().login(null, {
      accessToken: `h.${payload}.s`,
      tokenType: "Bearer",
      expiresInSeconds: 1,
    });
    const replace = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      replace,
      pathname: "/account/orders",
      search: "?page=2",
    } as unknown as Location);
    const adapter = vi.fn(async (config) => ({
      data: {},
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    })) as unknown as AxiosAdapter;
    api.defaults.adapter = adapter;

    await expect(api.get("/orders/me")).rejects.toMatchObject({
      status: 401,
      code: "TOKEN_EXPIRED",
    });

    expect(adapter).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(replace).toHaveBeenCalledWith("/login?next=%2Faccount%2Forders%3Fpage%3D2");
  });
});
