import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { useAuthStore } from "@/lib/auth/auth-store";
import { STOREFRONT_PERMISSIONS } from "@/lib/auth/permission-codes";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { LoginScreen } from "../components/login-screen";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

const CUSTOMER_ID = "c0ffee00-0000-4000-8000-000000000010";

function backend(
  opts: { staff?: boolean; loginError?: ApiError; mustChangePassword?: boolean } = {},
) {
  vi.spyOn(api, "post").mockImplementation(async (url) => {
    if (url === "/identity/auth/login") {
      if (opts.loginError) throw opts.loginError;
      return { data: { accessToken: "tok", tokenType: "Bearer", expiresInSeconds: 3600 } };
    }
    return { data: undefined };
  });
  vi.spyOn(api, "get").mockImplementation(async (url) => {
    if (url === "/identity/me") {
      return {
        data: {
          userId: "u-1",
          email: "nam@example.vn",
          fullName: "Nam",
          mustChangePassword: opts.mustChangePassword ?? false,
        },
      };
    }
    if (url === "/identity/me/permissions") {
      return {
        data: {
          roles: [],
          permissions: opts.staff ? ["sales-orders:READ"] : STOREFRONT_PERMISSIONS,
          dataScope: opts.staff ? "ALL" : "OWN",
        },
      };
    }
    return { data: { customerId: CUSTOMER_ID } };
  });
}

const fill = async (user: string, password: string) => {
  await userEvent.type(screen.getByLabelText("Email đăng nhập"), user);
  await userEvent.type(screen.getByLabelText("Mật khẩu"), password);
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
};

beforeEach(() => {
  replace.mockReset();
  signOut();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("LoginScreen", () => {
  it("signs in and goes back to the page that sent the customer here", async () => {
    backend();
    renderWithProviders(<LoginScreen />, { searchParams: "?next=%2Fcart" });
    await fill("nam@example.vn", "Secret123");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/cart"));
    expect(api.post).toHaveBeenCalledWith("/identity/auth/login", {
      username: "nam@example.vn",
      password: "Secret123",
    });
    expect(useAuthStore.getState().user?.customerId).toBe(CUSTOMER_ID);
  });

  it("goes home when there is no next, and ignores a next that leaves the site", async () => {
    backend();
    renderWithProviders(<LoginScreen />, { searchParams: "?next=https%3A%2F%2Fevil.example%2Fx" });
    await fill("nam@example.vn", "Secret123");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("sends a customer whose password an administrator set to change it first", async () => {
    backend({ mustChangePassword: true });
    renderWithProviders(<LoginScreen />, { searchParams: "?next=%2Fcart" });
    await fill("nam@example.vn", "Temp12345");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account/security"));
  });

  it("asks for both fields before calling the BE", async () => {
    backend();
    renderWithProviders(<LoginScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByText("Vui lòng nhập email đăng nhập")).toBeInTheDocument();
    expect(screen.getByText("Vui lòng nhập mật khẩu")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("does not say whether the e-mail or the password was wrong", async () => {
    backend({ loginError: new ApiError(401, "UNAUTHORIZED", "Invalid username or password") });
    renderWithProviders(<LoginScreen />);
    await fill("nam@example.vn", "bad");
    expect(await screen.findByRole("alert")).toHaveTextContent("Email hoặc mật khẩu không đúng.");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Mật khẩu")).toBeInTheDocument();
  });

  it.each([
    [new ApiError(403, "ACCOUNT_NOT_ACTIVE", "x"), "không đăng nhập được"],
    [new ApiError(403, "ACCOUNT_TEMPORARILY_LOCKED", "x"), "sai mật khẩu quá nhiều lần"],
    [new ApiError(429, "RATE_LIMITED", "x"), "thử đăng nhập quá nhanh"],
    [
      new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ. Vui lòng kiểm tra mạng."),
      "Không kết nối được máy chủ",
    ],
  ])("explains %#", async (error, text) => {
    backend({ loginError: error });
    renderWithProviders(<LoginScreen />);
    await fill("nam@example.vn", "pw");
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  it("tells a staff account the storefront is not for it, and leaves it signed out", async () => {
    backend({ staff: true });
    renderWithProviders(<LoginScreen />);
    await fill("staff@example.vn", "pw");

    expect(await screen.findByRole("alert")).toHaveTextContent(/tài khoản nhân viên/);
    expect(replace).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("has nothing to offer a customer who is already signed in", async () => {
    signIn();
    renderWithProviders(<LoginScreen />, { searchParams: "?next=%2Faccount%2Forders" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account/orders"));
  });

  it("does not invent account recovery: no reset link, only Sales", () => {
    renderWithProviders(<LoginScreen />);
    expect(screen.queryByRole("link", { name: /quên mật khẩu/i })).not.toBeInTheDocument();
    expect(screen.getByText(/do Sales cấp/)).toBeInTheDocument();
  });
});
