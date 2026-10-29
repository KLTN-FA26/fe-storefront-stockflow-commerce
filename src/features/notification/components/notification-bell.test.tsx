import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/lib/auth/auth-store";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { activateMockAdapter } from "@/lib/api/mock-adapter";
import {
  resetNotificationMockStore,
  seedNotificationMockStore,
} from "@/lib/api/mock-notifications";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { NotificationBell } from "./notification-bell";

import type { NotificationItem } from "../types";

// The mock adapter / api spies stand in for BE /notifications/me: these prove FE behaviour against
// the contract shape, not integration with a running backend.
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const alert: NotificationItem = {
  id: "11111111-1111-4111-8111-111111111111",
  category: "INVENTORY_ALERT",
  severity: "CRITICAL",
  title: "Sắp hết hàng",
  body: "Kho A cần nhập thêm hàng.",
  link: "/account/orders",
  createdAt: "2026-10-25T08:00:00Z",
  read: false,
};

activateMockAdapter();

beforeEach(() => {
  resetNotificationMockStore();
  seedNotificationMockStore("user-1", [alert]);
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  push.mockReset();
});

afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe("customer notification bell", () => {
  it("is absent for anonymous visitors (and makes no inbox request)", async () => {
    signOut();
    const get = vi.spyOn(api, "get");
    renderWithProviders(<NotificationBell />);
    expect(screen.queryByRole("button", { name: /Thông báo/i })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows the unread badge, severity, mark-all, and uses the item's in-app link", async () => {
    signIn();
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "1 thông báo chưa đọc" }));
    expect(await screen.findByText("Sắp hết hàng")).toBeVisible();
    expect(screen.getByText("Khẩn cấp")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Sắp hết hàng/i }));
    expect(push).toHaveBeenCalledWith("/account/orders");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Thông báo" })).toBeInTheDocument(),
    );
  });

  it("mark-all clears badge and never displays the previous customer's inbox", async () => {
    signIn();
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "1 thông báo chưa đọc" }));
    await user.click(screen.getByRole("button", { name: "Đánh dấu tất cả đã đọc" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Thông báo" })).toBeInTheDocument(),
    );

    useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, userId: "user-2" } : null }));
    // The mock adapter waits ~350 ms per request: post + refetch exceed the default 1 s.
    await waitFor(() => expect(screen.queryByText("Sắp hết hàng")).not.toBeInTheDocument(), {
      timeout: 4000,
    });
    expect(await screen.findByText("Bạn chưa có thông báo nào.")).toBeVisible();
  });

  it("never navigates a customer to a back-office link, but still marks it read", async () => {
    resetNotificationMockStore();
    seedNotificationMockStore("user-1", [
      { ...alert, link: "/admin/inventory/alerts?kind=EXPIRED" },
    ]);
    signIn();
    const post = vi.spyOn(api, "post");
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "1 thông báo chưa đọc" }));
    await user.click(await screen.findByRole("button", { name: /Sắp hết hàng/i }));
    expect(post).toHaveBeenCalledWith(`/notifications/me/${alert.id}/read`);
    // Let the mark-read settle (badge clears) so it cannot land in the next test's mock store.
    expect(await screen.findByRole("button", { name: "Thông báo" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("a token without a user id has no inbox owner: no bell, no request", async () => {
    signIn();
    useAuthStore.setState({ user: null });
    const get = vi.spyOn(api, "get");
    renderWithProviders(<NotificationBell />);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /Thông báo|chưa đọc/i })).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("logout with the dropdown open removes the inbox and stops personal requests", async () => {
    signIn();
    const get = vi.spyOn(api, "get");
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "1 thông báo chưa đọc" }));
    expect(await screen.findByText("Sắp hết hàng")).toBeVisible();
    const before = get.mock.calls.length;
    act(() => signOut());
    expect(screen.queryByText("Sắp hết hàng")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thông báo|chưa đọc/i })).toBeNull();
    expect(get.mock.calls.length).toBe(before);
  });

  it("refetches after 404 NOTIFICATION_NOT_FOUND so a row that is not the caller's disappears", async () => {
    // No link: the dropdown stays open, so the row can only disappear through the refetch.
    resetNotificationMockStore();
    seedNotificationMockStore("user-1", [{ ...alert, link: null }]);
    signIn();
    const get = vi.spyOn(api, "get");
    vi.spyOn(api, "post").mockImplementation(async () => {
      seedNotificationMockStore("user-1", []);
      throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "No notification");
    });
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "1 thông báo chưa đọc" }));
    const before = get.mock.calls.filter(([url]) => url === "/notifications/me").length;
    await user.click(await screen.findByRole("button", { name: /Sắp hết hàng/i }));
    // The mock adapter waits ~350 ms per request.
    expect(
      await screen.findByText("Bạn chưa có thông báo nào.", undefined, { timeout: 4000 }),
    ).toBeVisible();
    expect(get.mock.calls.filter(([url]) => url === "/notifications/me").length).toBeGreaterThan(
      before,
    );
    expect(screen.getByRole("button", { name: "Thông báo" })).toBeInTheDocument();
  });

  it("steps back to the last existing page when mark-all-read empties the unread page", async () => {
    resetNotificationMockStore();
    seedNotificationMockStore(
      "user-1",
      Array.from({ length: 11 }, (_, index) => ({
        ...alert,
        id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
        title: `Tin ${index}`,
      })),
    );
    signIn();
    const get = vi.spyOn(api, "get");
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "11 thông báo chưa đọc" }));
    await user.click(screen.getByRole("button", { name: "Chưa đọc" }));
    await user.click(await screen.findByRole("button", { name: "Cũ hơn" }));
    expect(await screen.findByText("Trang 2/2")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Đánh dấu tất cả đã đọc" }));
    // post + refetch of page 2 + clamped page 1, ~350 ms each in the mock adapter.
    expect(
      await screen.findByText("Bạn đã đọc hết thông báo.", undefined, { timeout: 4000 }),
    ).toBeVisible();
    const last = get.mock.calls.filter(([url]) => url === "/notifications/me").at(-1);
    expect((last?.[1] as { params: unknown } | undefined)?.params).toMatchObject({
      unreadOnly: true,
      page: 0,
    });
  });

  it("an inbox failure shows an error with a working retry", async () => {
    signIn();
    const real = api.get.bind(api);
    let fail = true;
    vi.spyOn(api, "get").mockImplementation((url, config) => {
      if (fail) return Promise.reject(new ApiError(503, "HTTP_503", "Service unavailable"));
      return real(url, config);
    });
    const user = userEvent.setup();
    renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole("button", { name: "Thông báo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được thông báo.");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Sắp hết hàng")).toBeVisible();
  });
});
