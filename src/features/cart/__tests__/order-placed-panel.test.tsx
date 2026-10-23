import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { OrderPlacedPanel } from "../components/order-placed-panel";
import type { PlacedOrder } from "../checkout-schemas";

const ORDER_ID = "7c1f6f0e-3c36-4e0e-9a43-2b0f0d6a1c11";
const order = (over: Partial<PlacedOrder> = {}): PlacedOrder => ({
  orderId: ORDER_ID,
  orderNumber: "SO-20261023-000007",
  status: "PENDING_PAYMENT",
  totalAmount: 12_500_000,
  currency: "VND",
  paymentTerm: "DEPOSIT",
  ...over,
});
const instructions = {
  orderId: ORDER_ID,
  orderNumber: "SO-20261023-000007",
  bankName: "Vietcombank",
  accountNumber: "0071000888999",
  accountName: "CONG TY TNHH STOCKFLOW",
  transferReference: "SO-20261023-000007",
  amountDue: 3_750_000,
  currency: "VND",
  dueBy: "TO_CONFIRM",
  dueByNote: "Đơn được xác nhận khi nhận đủ tiền cọc.",
};

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("OrderPlacedPanel transfer instructions", () => {
  it("tells the customer where and how much to transfer", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: instructions });
    renderWithProviders(<OrderPlacedPanel order={order()} />);

    expect(await screen.findByText("0071000888999")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sao chép nội dung chuyển khoản" })).toBeVisible();
    expect(screen.getByText("Số tiền cần chuyển").nextElementSibling).toHaveTextContent(
      /3\.750\.000/,
    );
  });

  it("does not ask for a transfer on a credit order", () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: instructions });
    renderWithProviders(<OrderPlacedPanel order={order({ paymentTerm: "CREDIT" })} />);
    expect(get).not.toHaveBeenCalled();
  });

  it("keeps the order confirmation and points to Sales when the shop has no bank account (503)", async () => {
    vi.spyOn(api, "get").mockRejectedValue(
      new ApiError(503, "TRANSFER_INSTRUCTIONS_UNAVAILABLE", "x"),
    );
    renderWithProviders(<OrderPlacedPanel order={order()} />);

    expect(await screen.findByText(/liên hệ Sale/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Đã đặt hàng" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem đơn hàng" })).toBeInTheDocument();
  });
});
