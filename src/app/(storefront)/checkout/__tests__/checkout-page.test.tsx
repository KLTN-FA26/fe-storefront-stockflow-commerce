import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CheckoutPage from "../page";

vi.mock("@/hooks/use-vietnam-addresses", () => ({
  useVietnamAddresses: () => ({ provinces: [], wards: [], loading: false }),
}));

describe("CheckoutPage", () => {
  it("keeps ordering locked until the address is complete", () => {
    render(<CheckoutPage />);

    expect(screen.getByRole("button", { name: "Giữ hàng và đặt hàng" })).toBeDisabled();
    expect(screen.getByText("Thiếu thông tin địa chỉ")).toBeInTheDocument();
  });

  it("recomputes the total when express shipping is chosen", async () => {
    const user = userEvent.setup();
    render(<CheckoutPage />);

    // 627.000 subtotal + 30.000 standard shipping − 20.000 discount.
    expect(screen.getByText(/637\.000/)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/Nhanh/));

    // 627.000 subtotal + 60.000 express shipping − 20.000 discount.
    expect(screen.getByText(/667\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/637\.000/)).toBeNull();
  });
});
