import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OrderDetailError from "@/app/(storefront)/account/orders/[id]/error";
import OrdersError from "@/app/(storefront)/account/orders/error";
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
});
