import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import { ChangePasswordForm } from "./change-password-form";

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChangePasswordForm />
    </QueryClientProvider>,
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Mật khẩu hiện tại"), "CurrentPass1");
  await user.type(screen.getByLabelText("Mật khẩu mới"), "NewPassword1");
  await user.type(screen.getByLabelText("Xác nhận mật khẩu mới"), "NewPassword1");
}

afterEach(() => vi.restoreAllMocks());

describe("ChangePasswordForm", () => {
  it("submits with logoutOtherDevices=false by default and does not log out locally", async () => {
    const user = userEvent.setup();
    const put = vi.spyOn(api, "put").mockResolvedValueOnce({ data: { revokedSessions: 0 } });
    const logout = vi.spyOn(
      (await import("@/lib/auth/auth-store")).useAuthStore.getState(),
      "logout",
    );
    renderForm();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith("/identity/auth/password", {
      currentPassword: "CurrentPass1",
      newPassword: "NewPassword1",
      logoutOtherDevices: false,
    });
    expect(logout).not.toHaveBeenCalled();
    expect(screen.queryByText(/thiết bị khác đã được đăng xuất/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu hiện tại")).toHaveValue("");
  });

  it("shows revoked session count only when the option is enabled", async () => {
    const user = userEvent.setup();
    const put = vi.spyOn(api, "put").mockResolvedValueOnce({ data: { revokedSessions: 2 } });
    renderForm();
    await fillValidForm(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/identity/auth/password",
        expect.objectContaining({ logoutOtherDevices: true }),
      ),
    );
    expect(await screen.findByText(/2 thiết bị khác đã được đăng xuất/)).toBeInTheDocument();
  });

  it.each([
    ["INVALID_CURRENT_PASSWORD", "Mật khẩu hiện tại không đúng", "Mật khẩu hiện tại"],
    ["PASSWORD_UNCHANGED", "Mật khẩu mới phải khác mật khẩu hiện tại", "Mật khẩu mới"],
  ])("maps %s to the correct field", async (code, message, field) => {
    const user = userEvent.setup();
    vi.spyOn(api, "put").mockRejectedValueOnce(new ApiError(400, code, message));
    renderForm();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText(field)).toHaveAttribute("aria-invalid", "true");
  });

  it("maps backend newPassword field errors inline", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "put").mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ", [
        { field: "newPassword", message: "Mật khẩu không hợp lệ" },
      ]),
    );
    renderForm();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));
    expect(await screen.findByText("Mật khẩu không hợp lệ")).toBeInTheDocument();
  });

  it("keeps rate limiting at form level", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "put").mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", "Too many"));
    renderForm();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));
    expect(await screen.findByText(/thử quá nhiều lần/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu mới")).toHaveAttribute("aria-invalid", "false");
  });

  it("keeps an unknown server error at form level", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "put").mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Máy chủ lỗi"));
    renderForm();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));
    expect(await screen.findByText("Máy chủ lỗi")).toBeInTheDocument();
  });

  it("prevents duplicate submits while pending", async () => {
    const user = userEvent.setup();
    let resolve: ((value: { data: { revokedSessions: number } }) => void) | undefined;
    const put = vi.spyOn(api, "put").mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolve = res;
        }),
    );
    renderForm();
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));
    await user.click(screen.getByRole("button", { name: /đang cập nhật/i }));
    expect(put).toHaveBeenCalledTimes(1);
    resolve?.({ data: { revokedSessions: 0 } });
  });
});
