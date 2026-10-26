import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { ToastProvider } from "@/components/shared/Toast";

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
    expect(put).toHaveBeenCalledWith("/customers/me", {
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

  it("preserves the draft and conflict when reloading fails with a cached profile", async () => {
    const user = userEvent.setup();
    const reloadError = new ApiError(0, "NETWORK_ERROR", "Mất kết nối");
    let rejectReload!: (error: ApiError) => void;
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({ data: profile })
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectReload = reject;
          }),
      );
    const put = vi
      .spyOn(api, "put")
      .mockRejectedValueOnce(new ApiError(409, "OPTIMISTIC_LOCK", "Đã thay đổi ở nơi khác"));
    const { queryClient } = renderProfile();
    render(<ToastProvider />);

    const fullName = await screen.findByRole("textbox", { name: "Họ và tên" });
    await waitFor(() => expect(fullName).toHaveValue(profile.fullName));
    await user.clear(fullName);
    await user.type(fullName, "Bản nháp cục bộ");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    expect(await screen.findByText(/thông tin đã thay đổi ở nơi khác/i)).toBeVisible();
    expect(fullName).toHaveValue("Bản nháp cục bộ");
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    expect(put).toHaveBeenCalledExactlyOnceWith("/customers/me", {
      fullName: "Bản nháp cục bộ",
      phone: profile.phone,
      version: 3,
    });

    await user.click(screen.getByRole("button", { name: "Tải lại dữ liệu" }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    const pendingReload = screen.getByRole("button", { name: "Đang tải lại..." });
    expect(pendingReload).toBeDisabled();
    expect(pendingReload).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Đang tải lại...");
    await user.click(pendingReload);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.map(([path]) => path)).toEqual(["/customers/me", "/customers/me"]);
    await act(async () => {
      rejectReload(reloadError);
      // Flush Query notifications and reloadLatest's continuation before checking the UI.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => {
      expect(queryClient.getQueryState(customerProfileKeys.profile())).toMatchObject({
        status: "error",
        fetchStatus: "idle",
        error: reloadError,
      });
    });

    // A failed refetch retains the last successful data. Keep this real cache behavior
    // so treating stale result.data as a successful reload cannot pass this test.
    expect(queryClient.getQueryData(customerProfileKeys.profile())).toEqual(profile);
    expect.soft(screen.getByRole("textbox", { name: "Họ và tên" })).toHaveValue("Bản nháp cục bộ");
    expect
      .soft(screen.getByRole("textbox", { name: "Họ và tên" }))
      .not.toHaveValue(profile.fullName);
    expect.soft(screen.queryByText(/thông tin đã thay đổi ở nơi khác/i)).toBeVisible();
    expect.soft(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    expect
      .soft(screen.queryByText(/mất kết nối|không.*(?:tải|kết nối)|tải.*thất bại/i))
      .toBeVisible();
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect.soft(put).toHaveBeenCalledTimes(1);
  });

  it("clears the reload error and conflict only after a successful retry, then saves the new version", async () => {
    const user = userEvent.setup();
    const latestProfile = { ...profile, fullName: "Tên mới từ server", version: 4 };
    let resolveReload!: (value: { data: typeof profile }) => void;
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({ data: profile })
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Mất kết nối"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveReload = resolve;
          }),
      );
    const put = vi
      .spyOn(api, "put")
      .mockRejectedValueOnce(new ApiError(409, "OPTIMISTIC_LOCK", "Đã thay đổi ở nơi khác"))
      .mockResolvedValueOnce({
        data: { ...latestProfile, fullName: "Bản sửa sau tải lại", version: 5 },
      });
    const { queryClient } = renderProfile();
    const fullName = await screen.findByDisplayValue(profile.fullName);
    await user.clear(fullName);
    await user.type(fullName, "Bản nháp cục bộ");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await user.click(await screen.findByRole("button", { name: "Tải lại dữ liệu" }));
    expect(await screen.findByText("Không thể tải dữ liệu mới nhất")).toBeVisible();
    expect(screen.queryByText("Không thể lưu thông tin")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tải lại dữ liệu" }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    expect(fullName).toHaveValue("Bản nháp cục bộ");
    expect(screen.getByText("Không thể tải dữ liệu mới nhất")).toBeVisible();
    expect(screen.getByText("Thông tin đã thay đổi ở nơi khác")).toBeVisible();
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    await act(async () => {
      resolveReload({ data: latestProfile });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(fullName).toHaveValue(latestProfile.fullName));
    expect(queryClient.getQueryData(customerProfileKeys.profile())).toEqual(latestProfile);
    expect(screen.queryByText("Thông tin đã thay đổi ở nơi khác")).not.toBeInTheDocument();
    expect(screen.queryByText("Không thể tải dữ liệu mới nhất")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đang tải lại..." })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeEnabled();

    await user.clear(fullName);
    await user.type(fullName, "Bản sửa sau tải lại");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put).toHaveBeenLastCalledWith("/customers/me", {
      fullName: "Bản sửa sau tải lại",
      phone: latestProfile.phone,
      version: 4,
    });
    await waitFor(() =>
      expect(queryClient.getQueryData(customerProfileKeys.profile())).toMatchObject({ version: 5 }),
    );
  });

  it("keeps the dirty form mounted when a background refetch returns CUSTOMER_NOT_FOUND with cached data", async () => {
    const user = userEvent.setup();
    const refetchError = new ApiError(404, "CUSTOMER_NOT_FOUND", "Không tìm thấy hồ sơ");
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({ data: profile })
      .mockRejectedValueOnce(refetchError);
    const { queryClient } = renderProfile();
    const fullName = await screen.findByDisplayValue(profile.fullName);
    const form = fullName.closest("form");
    expect(form).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Số điện thoại" })).toHaveValue(profile.phone);

    await user.clear(fullName);
    await user.type(fullName, "Bản nháp cục bộ");
    expect(fullName).toHaveValue("Bản nháp cục bộ");

    // Refetch the real mounted query without submitting or using the conflict reload flow.
    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: customerProfileKeys.profile(),
        exact: true,
        type: "active",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => {
      expect(queryClient.getQueryState(customerProfileKeys.profile())).toMatchObject({
        status: "error",
        fetchStatus: "idle",
        error: refetchError,
        data: profile,
      });
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.map(([path]) => path)).toEqual(["/customers/me", "/customers/me"]);
    expect(queryClient.getQueryData(customerProfileKeys.profile())).toEqual(profile);

    expect.soft(form).toBeInTheDocument();
    expect
      .soft(screen.queryByRole("textbox", { name: "Họ và tên" }))
      .toHaveValue("Bản nháp cục bộ");
    // Also check the original input: replacing it with a new form must not hide a reset.
    expect.soft(fullName).toHaveValue("Bản nháp cục bộ");
    expect.soft(screen.queryByText("Chưa có hồ sơ khách hàng")).not.toBeInTheDocument();
    expect.soft(screen.queryByRole("textbox", { name: "Họ và tên" })).toBeInTheDocument();
    expect.soft(screen.queryByRole("textbox", { name: "Số điện thoại" })).toBeInTheDocument();
  });

  it("keeps a dirty draft tied to its original version after a background success changes another field", async () => {
    const user = userEvent.setup();
    const latestProfile = { ...profile, phone: "0912345678", version: 4 };
    vi.spyOn(api, "get")
      .mockResolvedValueOnce({ data: profile })
      .mockResolvedValueOnce({ data: latestProfile });
    // Model a server that rejects version 3 but accepts version 4. Sending the new
    // cached version with the old phone would silently overwrite the remote edit.
    const put = vi.spyOn(api, "put").mockImplementationOnce(async (_, body) => {
      const update = body as { fullName: string; phone: string; version: number };
      if (update.version !== latestProfile.version) {
        throw new ApiError(409, "OPTIMISTIC_LOCK", "Đã thay đổi ở nơi khác");
      }
      return { data: { ...latestProfile, ...update, version: 5 } };
    });
    const { queryClient } = renderProfile();
    const fullName = await screen.findByDisplayValue(profile.fullName);
    await user.clear(fullName);
    await user.type(fullName, "Bản nháp cục bộ");

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: customerProfileKeys.profile(), exact: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(queryClient.getQueryData(customerProfileKeys.profile())).toEqual(latestProfile);
    expect(fullName).toHaveValue("Bản nháp cục bộ");
    expect(screen.getByRole("textbox", { name: "Số điện thoại" })).toHaveValue(profile.phone);

    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect.soft(put).toHaveBeenCalledWith("/customers/me", {
      fullName: "Bản nháp cục bộ",
      phone: profile.phone,
      version: 3,
    });
    await waitFor(() =>
      expect(
        screen.queryByText("Đã lưu") ?? screen.queryByText("Thông tin đã thay đổi ở nơi khác"),
      ).toBeInTheDocument(),
    );
    expect.soft(screen.queryByText("Thông tin đã thay đổi ở nơi khác")).toBeVisible();
    expect.soft(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    expect.soft(queryClient.getQueryData(customerProfileKeys.profile())).toEqual(latestProfile);
  });

  it.each(["success", "error"] as const)(
    "allows manual reload after a background %s finishes while conflict is visible",
    async (outcome) => {
      const user = userEvent.setup();
      const backgroundProfile = { ...profile, fullName: "Tên từ background", version: 4 };
      const manualProfile = { ...profile, fullName: "Tên tải lại thủ công", version: 5 };
      let resolveBackground!: (value: { data: typeof profile }) => void;
      let rejectBackground!: (error: ApiError) => void;
      const get = vi
        .spyOn(api, "get")
        .mockResolvedValueOnce({ data: profile })
        .mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              resolveBackground = resolve;
              rejectBackground = reject;
            }),
        )
        .mockResolvedValueOnce({ data: manualProfile });
      vi.spyOn(api, "put").mockRejectedValueOnce(
        new ApiError(409, "OPTIMISTIC_LOCK", "Đã thay đổi ở nơi khác"),
      );
      const { queryClient } = renderProfile();
      const fullName = await screen.findByDisplayValue(profile.fullName);
      await user.clear(fullName);
      await user.type(fullName, "Bản nháp cục bộ");
      await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
      const reload = await screen.findByRole("button", { name: "Tải lại dữ liệu" });

      let backgroundFetch!: Promise<void>;
      await act(async () => {
        backgroundFetch = queryClient.refetchQueries({
          queryKey: customerProfileKeys.profile(),
          exact: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await waitFor(() => expect(reload).toBeDisabled());
      await user.click(reload);
      expect(get).toHaveBeenCalledTimes(2);
      expect(fullName).toHaveValue("Bản nháp cục bộ");
      expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();

      await act(async () => {
        if (outcome === "success") resolveBackground({ data: backgroundProfile });
        else rejectBackground(new ApiError(0, "NETWORK_ERROR", "Mất kết nối"));
        await backgroundFetch;
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await waitFor(() => expect(reload).toBeEnabled());
      expect(fullName).toHaveValue("Bản nháp cục bộ");
      expect(screen.getByText("Thông tin đã thay đổi ở nơi khác")).toBeVisible();
      expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
      await user.click(reload);
      await waitFor(() => expect(fullName).toHaveValue(manualProfile.fullName));
      expect(get).toHaveBeenCalledTimes(3);
      expect(screen.queryByText("Thông tin đã thay đổi ở nơi khác")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeEnabled();
    },
  );

  it("keeps save and reload errors separate across a new conflict cycle", async () => {
    const user = userEvent.setup();
    const latestProfile = { ...profile, fullName: "Tên mới", version: 4 };
    const nextProfile = { ...latestProfile, fullName: "Tên mới hơn", version: 5 };
    vi.spyOn(api, "get")
      .mockResolvedValueOnce({ data: profile })
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Mất kết nối"))
      .mockResolvedValueOnce({ data: latestProfile })
      .mockResolvedValueOnce({ data: nextProfile });
    const put = vi
      .spyOn(api, "put")
      .mockRejectedValueOnce(new ApiError(409, "OPTIMISTIC_LOCK", "Đã thay đổi ở nơi khác"))
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Lưu thất bại"))
      .mockRejectedValueOnce(new ApiError(409, "OPTIMISTIC_LOCK", "Đã thay đổi lần nữa"));
    renderProfile();
    const fullName = await screen.findByDisplayValue(profile.fullName);
    await user.clear(fullName);
    await user.type(fullName, "Bản nháp cục bộ");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await user.click(await screen.findByRole("button", { name: "Tải lại dữ liệu" }));
    expect(await screen.findByText("Không thể tải dữ liệu mới nhất")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Tải lại dữ liệu" }));
    await waitFor(() => expect(fullName).toHaveValue(latestProfile.fullName));

    await user.clear(fullName);
    await user.type(fullName, "Bản nháp lần hai");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText("Lưu thất bại")).toBeVisible();
    expect(screen.getByText("Không thể lưu thông tin")).toBeVisible();
    expect(screen.queryByText("Không thể tải dữ liệu mới nhất")).not.toBeInTheDocument();
    expect(fullName).toHaveValue("Bản nháp lần hai");

    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(await screen.findByText("Thông tin đã thay đổi ở nơi khác")).toBeVisible();
    expect(screen.queryByText("Không thể lưu thông tin")).not.toBeInTheDocument();
    expect(screen.queryByText("Không thể tải dữ liệu mới nhất")).not.toBeInTheDocument();
    expect(fullName).toHaveValue("Bản nháp lần hai");
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    expect(put).toHaveBeenLastCalledWith("/customers/me", {
      fullName: "Bản nháp lần hai",
      phone: profile.phone,
      version: 4,
    });
    await user.click(screen.getByRole("button", { name: "Tải lại dữ liệu" }));
    await waitFor(() => expect(fullName).toHaveValue(nextProfile.fullName));
    expect(screen.queryByText("Thông tin đã thay đổi ở nơi khác")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeEnabled();
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
