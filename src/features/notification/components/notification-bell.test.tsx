import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/lib/auth/auth-store";
import { api } from "@/lib/api/client";
import { activateMockAdapter } from "@/lib/api/mock-adapter";
import {
  resetNotificationMockStore,
  seedNotificationMockStore,
} from "@/lib/api/mock-notifications";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { NotificationBell } from "./notification-bell";

import type { NotificationItem } from "../types";

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
    await waitFor(() => expect(screen.queryByText("Sắp hết hàng")).not.toBeInTheDocument());
    expect(await screen.findByText("Bạn chưa có thông báo nào.")).toBeVisible();
  });
});
