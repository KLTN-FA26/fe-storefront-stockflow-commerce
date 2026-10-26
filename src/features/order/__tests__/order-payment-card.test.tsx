import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { OrderPaymentCard } from "../components/order-payment-card";
import { orderDtoSchema } from "../schemas";
import { beOrder, orderId } from "./fixtures";

const orderWith = (over: Record<string, unknown>) => orderDtoSchema.parse({ ...beOrder, ...over });
const instructions = {
  orderId,
  orderNumber: "SO-20260907-000431",
  bankName: "Vietcombank",
  accountNumber: "0071000888999",
  accountName: "CONG TY TNHH STOCKFLOW",
  transferReference: "SO-20260907-000431",
  amountDue: 150_000,
  currency: "VND",
  dueBy: "TO_CONFIRM",
};

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("OrderPaymentCard transfer instructions", () => {
  it("shows them while money is still due on the order", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: instructions });
    renderWithProviders(
      <OrderPaymentCard
        order={orderWith({
          status: "PENDING_PAYMENT",
          paymentTerm: "DEPOSIT",
          payment: { status: "UNPAID", paidAmount: 0, depositRequired: 150_000 },
        })}
      />,
    );

    expect(await screen.findByText("0071000888999")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      `/orders/me/${orderId}/transfer-instructions`,
      expect.anything(),
    );
  });

  it("neither asks nor shows anything for a paid order", () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: instructions });
    renderWithProviders(<OrderPaymentCard order={orderWith({})} />);
    expect(get).not.toHaveBeenCalled();
    expect(screen.queryByText("Thông tin chuyển khoản")).not.toBeInTheDocument();
  });

  it("asks nothing for a credit order, which is paid after delivery", () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: instructions });
    renderWithProviders(
      <OrderPaymentCard
        order={orderWith({
          paymentTerm: "CREDIT",
          payment: { status: "ON_CREDIT", paidAmount: 0, creditTermDays: 30 },
        })}
      />,
    );
    expect(get).not.toHaveBeenCalled();
  });
});
