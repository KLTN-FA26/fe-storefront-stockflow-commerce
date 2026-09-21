import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import { customerProfileKeys } from "../queries";
import { CustomerProfileForm } from "./customer-profile-form";

const profile = {
  customerId: "CUS-0010",
  userId: "USER-CUS-0010",
  fullName: "Nguyễn Hoài Nam",
  email: "nam.nguyen@example.vn",
  phone: "+84908111222",
  segmentId: null,
  status: "ACTIVE",
  version: 3,
  createdAt: "2026-01-10T02:00:00Z",
};

function renderProfile() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <CustomerProfileForm />
      </QueryClientProvider>,
    ),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("CustomerProfileForm", () => {
  it("hydrates editable fields and keeps email read-only", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: profile });
    renderProfile();

    expect(await screen.findByDisplayValue("Nguyễn Hoài Nam")).toBeInTheDocument();
    expect(screen.getByDisplayValue("nam.nguyen@example.vn")).toHaveAttribute("readonly");
    expect(screen.getByText(/chưa thể thay đổi/i)).toBeInTheDocument();
  });

  it("updates fullName and phone with the latest version, then caches the returned version", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: profile });
    const put = vi.spyOn(api, "put").mockResolvedValueOnce({
      data: { ...profile, fullName: "Tên mới", phone: "0912345678", version: 4 },
    });
    const { queryClient } = renderProfile();

    const fullName = await screen.findByDisplayValue("Nguyễn Hoài Nam");
    await user.clear(fullName);
    await user.type(fullName, "Tên mới");
    const phone = screen.getByLabelText("Số điện thoại");
    await user.clear(phone);
    await user.type(phone, "0912345678");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith("/v1/customers/me", {
      fullName: "Tên mới",
      phone: "0912345678",
      version: 3,
    });
    await waitFor(() =>
      expect(queryClient.getQueryData(customerProfileKeys.profile())).toMatchObject({ version: 4 }),
    );
  });

  it("does not double-submit while the update is pending", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: profile });
    let resolveUpdate: ((value: { data: typeof profile }) => void) | undefined;
    const put = vi.spyOn(api, "put").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    renderProfile();
    await screen.findByDisplayValue("Nguyễn Hoài Nam");

    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await user.click(screen.getByRole("button", { name: /đang lưu/i }));
    expect(put).toHaveBeenCalledTimes(1);
    resolveUpdate?.({ data: { ...profile, version: 4 } });
  });

  it("maps backend field errors to the matching input", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: profile });
    vi.spyOn(api, "put").mockRejectedValueOnce(
      new ApiError(400, "VALIDATION_FAILED", "Dữ liệu không hợp lệ", {
        phone: "Số điện thoại không hợp lệ",
      }),
    );
    renderProfile();
    await screen.findByDisplayValue("Nguyễn Hoài Nam");

    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    expect(await screen.findByText("Số điện thoại không hợp lệ")).toBeInTheDocument();
  });

  it("shows an actionable conflict without retrying or overwriting the form", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: profile });
    const put = vi
      .spyOn(api, "put")
      .mockRejectedValueOnce(new ApiError(409, "OPTIMISTIC_LOCK", "Đã thay đổi ở nơi khác"));
    renderProfile();
    const fullName = await screen.findByDisplayValue("Nguyễn Hoài Nam");
    await user.clear(fullName);
    await user.type(fullName, "Bản nháp cục bộ");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    expect(await screen.findByText(/đã thay đổi ở nơi khác/i)).toBeInTheDocument();
    expect(put).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("Bản nháp cục bộ")).toBeInTheDocument();
  });

  it("distinguishes a missing customer profile from a generic fetch error", async () => {
    vi.spyOn(api, "get").mockRejectedValueOnce(
      new ApiError(404, "CUSTOMER_NOT_FOUND", "Không tìm thấy hồ sơ"),
    );
    renderProfile();
    expect(await screen.findByText(/chưa có hồ sơ khách hàng/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Họ và tên" })).not.toBeInTheDocument();
  });

  it("keeps a generic fetch failure at page level", async () => {
    vi.spyOn(api, "get").mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Mất kết nối"));
    renderProfile();

    expect(await screen.findByText(/không tải được thông tin tài khoản/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Họ và tên" })).not.toBeInTheDocument();
  });
});
