import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
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

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("OrderPlacedPanel", () => {
  it("confirms the order and points to the order page for the installments (kltn-docs 15)", () => {
    const get = vi.spyOn(api, "get");
    renderWithProviders(<OrderPlacedPanel order={order()} />);

    expect(screen.getByRole("heading", { name: "Đã đặt hàng" })).toBeInTheDocument();
    expect(screen.getByText(/Lịch thanh toán theo đợt và thông tin chuyển khoản/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Xem đơn hàng" })).toBeInTheDocument();
    // There is no per-order transfer endpoint any more: nothing is asked here.
    expect(get).not.toHaveBeenCalled();
  });
});
