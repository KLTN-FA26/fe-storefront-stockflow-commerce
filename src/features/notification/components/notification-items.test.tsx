import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NotificationItem } from "../types";
import { NotificationItems } from "./notification-items";

const item = (severity: NotificationItem["severity"], title: string): NotificationItem => ({
  id: `${severity}-0000-4000-8000-000000000001`,
  category: "ORDER",
  severity,
  title,
  body: null,
  link: null,
  createdAt: "2026-11-22T08:00:00Z",
  read: true,
});

describe("NotificationItems — the severity badge (SF-UX-14)", () => {
  it("shows no badge on a routine notice: its title says what it is", () => {
    render(
      <NotificationItems items={[item("INFO", "Thiết kế đã được duyệt")]} onSelect={vi.fn()} />,
    );
    const row = screen.getByRole("button", { name: /Thiết kế đã được duyệt/ });
    expect(within(row).queryByText("Thông tin")).toBeNull();
  });

  it("badges a warning and a critical notice in primary ink, the tone on the icon", () => {
    render(
      <NotificationItems
        items={[item("WARN", "Đợt thanh toán sắp đến hạn"), item("CRITICAL", "Đợt đã quá hạn")]}
        onSelect={vi.fn()}
      />,
    );
    const warn = screen.getByText("Cảnh báo");
    const critical = screen.getByText("Khẩn cấp");
    for (const badge of [warn, critical]) {
      expect(badge).toHaveClass("text-ink-primary");
      expect(badge.className).not.toMatch(/\btext-(warning|danger)\b/);
    }
  });
});
