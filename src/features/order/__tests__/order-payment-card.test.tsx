import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { beOrderInstallments } from "@/lib/installments/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { OrderPaymentCard } from "../components/order-payment-card";
import { orderDtoSchema } from "../schemas";
import { beOrder, orderId } from "./fixtures";

const orderWith = (over: Record<string, unknown> = {}) =>
  orderDtoSchema.parse({ ...beOrder, ...over });

const transfer = {
  installmentId: "6c7d8e9f-0000-4000-8000-000000000002",
  contractNumber: "HD-20261108-000007-1",
  orderNumber: "SO-20260907-000431",
  seq: 2,
  name: "Thanh toán sau giao",
  bankName: "Vietcombank",
  accountNumber: "0071000888999",
  accountName: "CONG TY TNHH STOCKFLOW",
  amountDue: 354_900,
  currency: "VND",
  reference: "HD-20261108-000007-1 DOT2",
  dueDate: "2026-10-01",
};

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("OrderPaymentCard", () => {
  it("lists the contract's installments with what each still owes", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: beOrderInstallments() });
    renderWithProviders(<OrderPaymentCard order={orderWith()} />);

    const list = await screen.findByRole("list", { name: "Các đợt thanh toán" });
    expect(get).toHaveBeenCalledWith(`/installments/me/orders/${orderId}`, expect.anything());
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Đợt 1 · Đặt cọc")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Đã thanh toán")).toBeInTheDocument();
    // Overdue is a flag: the DUE installment past its day reads "Quá hạn".
    expect(within(rows[1]!).getByText("Quá hạn")).toBeInTheDocument();
    expect(screen.getByText("Còn phải thanh toán").nextElementSibling).toHaveTextContent(
      /354\.900/,
    );
  });

  it("offers transfer details only on an installment that still owes, asked when opened", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockImplementation(async (url: string) =>
        url.endsWith("/transfer-instructions")
          ? { data: transfer }
          : { data: beOrderInstallments() },
      );
    const user = userEvent.setup();
    renderWithProviders(<OrderPaymentCard order={orderWith()} />);

    const buttons = await screen.findAllByRole("button", { name: "Xem thông tin chuyển khoản" });
    // The paid deposit has none.
    expect(buttons).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(1);

    await user.click(buttons[0]!);
    expect(await screen.findByText("HD-20261108-000007-1 DOT2")).toBeInTheDocument();
    expect(get).toHaveBeenLastCalledWith(
      `/installments/me/${transfer.installmentId}/transfer-instructions`,
      expect.anything(),
    );
  });

  it("says the schedule comes with the contract when the order has no installments yet", async () => {
    vi.spyOn(api, "get").mockRejectedValue(
      new ApiError(404, "INSTALLMENT_NOT_FOUND", "Order has no installments"),
    );
    renderWithProviders(<OrderPaymentCard order={orderWith()} />);

    expect(
      await screen.findByText(/sẽ hiển thị khi hợp đồng mua bán của đơn được ký/),
    ).toBeInTheDocument();
  });

  it("shows nothing for an order cancelled before it had a contract", async () => {
    vi.spyOn(api, "get").mockRejectedValue(
      new ApiError(404, "INSTALLMENT_NOT_FOUND", "Order has no installments"),
    );
    const { container } = renderWithProviders(
      <OrderPaymentCard order={orderWith({ status: "CANCELLED", statusGroup: "CANCELLED" })} />,
    );
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("offers a retry when the schedule cannot be read", async () => {
    vi.spyOn(api, "get")
      .mockRejectedValueOnce(new ApiError(400, "UNSUPPORTED_PARAMETER", "bad id"))
      .mockResolvedValue({ data: beOrderInstallments() });
    const user = userEvent.setup();
    renderWithProviders(<OrderPaymentCard order={orderWith()} />);

    await user.click(await screen.findByRole("button", { name: /Thử lại/ }));
    expect(await screen.findByRole("list", { name: "Các đợt thanh toán" })).toBeInTheDocument();
  });
});
