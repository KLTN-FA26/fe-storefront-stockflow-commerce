import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OrderDetailError from "@/app/(account)/account/orders/[id]/error";
import OrderDetailNotFound from "@/app/(account)/account/orders/[id]/not-found";
import OrdersError from "@/app/(account)/account/orders/error";
import { ApiError } from "@/lib/api/error";

describe("order route error pages", () => {
  it("links back to the account instead of relying on browser history", () => {
    render(<OrdersError error={new Error("boom")} reset={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Về tài khoản" })).toHaveAttribute("href", "/account");
  });

  it("links the detail error back to the order list and hides the raw BE message", () => {
    const error = new ApiError(403, "FORBIDDEN", "Missing permission: sales-orders:READ");
    render(<OrderDetailError error={error} reset={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Về danh sách đơn hàng" })).toHaveAttribute(
      "href",
      "/account/orders",
    );
    expect(screen.queryByText(/Missing permission/)).not.toBeInTheDocument();
  });

  it("WF-02 FE-3: the detail 404 reads right for a wrong id and an order being redrawn, with the chat", () => {
    render(<OrderDetailNotFound />);
    expect(screen.getByText("Chưa xem được đơn hàng này")).toBeInTheDocument();
    expect(screen.getByText(/Sale đang lập lại hợp đồng cho đơn này/)).toBeInTheDocument();
    expect(screen.queryByText(/không tồn tại/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat với Sale" })).toHaveAttribute(
      "href",
      "/chat/new",
    );
    expect(screen.getByRole("link", { name: "Quay lại danh sách đơn hàng" })).toHaveAttribute(
      "href",
      "/account/orders",
    );
  });
});
