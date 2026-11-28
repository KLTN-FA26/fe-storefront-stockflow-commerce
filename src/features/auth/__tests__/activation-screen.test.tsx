import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { STOREFRONT_PERMISSIONS } from "@/lib/auth/permission-codes";
import { renderWithProviders, signOut } from "@/test/render";

import { ActivationScreen } from "../components/activation-screen";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

const TOKEN = "A".repeat(64);
const EMAIL = "lan@congty.vn";
const STRONG = "MatKhauMoi2026";

function backend(opts: { activationError?: ApiError; loginError?: ApiError } = {}) {
  const post = vi.spyOn(api, "post").mockImplementation(async (url) => {
    if (url === "/customers/portal-activation") {
      if (opts.activationError) throw opts.activationError;
      return { data: { email: EMAIL } };
    }
    if (url === "/identity/auth/login") {
      if (opts.loginError) throw opts.loginError;
      return { data: { accessToken: "tok", tokenType: "Bearer", expiresInSeconds: 3600 } };
    }
    return { data: undefined };
  });
  vi.spyOn(api, "get").mockImplementation(async (url) => {
    if (url === "/identity/me")
      return { data: { userId: "u-1", email: EMAIL, mustChangePassword: false } };
    if (url === "/identity/me/permissions") {
      return { data: { roles: [], permissions: STOREFRONT_PERMISSIONS, dataScope: "OWN" } };
    }
    return { data: { customerId: "c-1" } };
  });
  return post;
}

const openLink = (hash: string) => window.history.replaceState(null, "", `/portal/activate${hash}`);

const fill = async (password: string, confirm = password) => {
  await userEvent.type(screen.getByLabelText("Mật khẩu mới"), password);
  await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu"), confirm);
  await userEvent.click(screen.getByRole("button", { name: "Kích hoạt tài khoản" }));
};

beforeEach(() => {
  replace.mockReset();
  signOut();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("ActivationScreen", () => {
  it("sends the token from the link's fragment with the chosen password, then signs the customer in", async () => {
    const post = backend();
    openLink(`#token=${TOKEN}`);
    renderWithProviders(<ActivationScreen />);

    await fill(STRONG);

    expect(post).toHaveBeenCalledWith("/customers/portal-activation", {
      token: TOKEN,
      password: STRONG,
    });
    // The account signs in with the e-mail the BE answers: it is also the username.
    expect(post).toHaveBeenCalledWith("/identity/auth/login", {
      username: EMAIL,
      password: STRONG,
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("takes the secret out of the address bar once read", () => {
    backend();
    openLink(`#token=${TOKEN}`);
    renderWithProviders(<ActivationScreen />);

    expect(window.location.hash).toBe("");
    expect(screen.getByLabelText("Mật khẩu mới")).toBeInTheDocument();
  });

  it("shows no form for a link without a token", () => {
    backend();
    openLink("");
    renderWithProviders(<ActivationScreen />);

    expect(
      screen.getByRole("heading", { name: "Link kích hoạt không dùng được" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Mật khẩu mới")).not.toBeInTheDocument();
  });

  it("refuses a password the BE policy would refuse, without calling the BE", async () => {
    const post = backend();
    openLink(`#token=${TOKEN}`);
    renderWithProviders(<ActivationScreen />);

    await fill("ngan123");

    expect(await screen.findByText("Mật khẩu phải có ít nhất 10 ký tự")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("asks for the same password twice", async () => {
    const post = backend();
    openLink(`#token=${TOKEN}`);
    renderWithProviders(<ActivationScreen />);

    await fill(STRONG, `${STRONG}x`);

    expect(await screen.findByText("Mật khẩu nhập lại không khớp")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("turns to the dead-link notice when the BE refuses the invitation", async () => {
    backend({
      activationError: new ApiError(
        400,
        "PORTAL_INVITATION_INVALID",
        "This portal invitation is invalid",
      ),
    });
    openLink(`#token=${TOKEN}`);
    renderWithProviders(<ActivationScreen />);

    await fill(STRONG);

    expect(
      await screen.findByRole("heading", { name: "Link kích hoạt không dùng được" }),
    ).toBeInTheDocument();
    // "Vui lòng liên hệ Sale" comes with the way to reach them (KE-HOACH sales owner §10.7).
    expect(screen.getByRole("link", { name: "Gửi yêu cầu liên hệ Sale" })).toHaveAttribute(
      "href",
      "/mo-tai-khoan",
    );
  });

  it("says the account is ready and leads to login when signing in afterwards fails", async () => {
    backend({ loginError: new ApiError(429, "RATE_LIMITED", "Too many requests") });
    openLink(`#token=${TOKEN}`);
    renderWithProviders(<ActivationScreen />);

    await fill(STRONG);

    expect(
      await screen.findByRole("heading", { name: "Tài khoản đã được kích hoạt" }),
    ).toBeInTheDocument();
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/login");
    expect(replace).not.toHaveBeenCalled();
  });
});
