import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { CreditCard } from "./credit-card";

const CUSTOMER_ID = "5a1f6f0e-3c36-4e0e-9a43-2b0f0d6a1c33";
/** BE CreditPositionResponse as GET /orders/credit-position/me sends it (NON_NULL). */
const position = (over: Record<string, unknown> = {}) => ({
  customerId: CUSTOMER_ID,
  creditLimit: 50_000_000,
  creditTermDays: 30,
  exposure: 12_000_000,
  availableCredit: 38_000_000,
  currency: "VND",
  hasOverdue: false,
  overdueAmount: 0,
  ...over,
});
const answer = (data: unknown) => vi.spyOn(api, "get").mockResolvedValue({ data });

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("CreditCard (account page, SFCREDIT; kltn-docs 15 §4.3)", () => {
  it("shows the limit, what is owed, what is left and the days to pay", async () => {
    answer(position());
    renderWithProviders(<CreditCard />);

    expect(await screen.findByRole("heading", { name: "Công nợ" })).toBeInTheDocument();
    const value = (label: string) => screen.getByText(label).nextElementSibling;
    expect(value("Hạn mức")).toHaveTextContent(/50\.000\.000/);
    expect(value("Dư nợ")).toHaveTextContent(/12\.000\.000/);
    expect(value("Còn lại")).toHaveTextContent(/38\.000\.000/);
    expect(screen.getByText(/Kỳ hạn thanh toán/)).toHaveTextContent("30 ngày");
    expect(screen.getByRole("img", { name: "Đã dùng 24% hạn mức" })).toBeInTheDocument();
    expect(screen.queryByText("Bạn có khoản công nợ quá hạn.")).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/orders/credit-position/me", expect.anything());
  });

  it("warns while an installment is overdue, with the amount and the oldest due day", async () => {
    answer(
      position({
        creditLimit: 1_000_000,
        exposure: 1_000_000,
        availableCredit: 0,
        hasOverdue: true,
        overdueAmount: 400_000,
        oldestOverdueDueDate: "2026-10-01",
      }),
    );
    renderWithProviders(<CreditCard />);

    expect(await screen.findByText("Bạn có khoản công nợ quá hạn.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Còn 400\.000.*quá hạn/);
    expect(screen.getByRole("alert")).toHaveTextContent(/2026|01\/10|1 thg 10/);
  });

  it("shows nothing to a customer with neither credit nor anything owed", async () => {
    const { creditLimit: _l, creditTermDays: _d, availableCredit: _a, ...rest } = position();
    answer({ ...rest, exposure: 0 });
    const { container } = renderWithProviders(<CreditCard />);

    await vi.waitFor(() => expect(api.get).toHaveBeenCalled());
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows what a customer without credit still owes, without a limit or a zero-limit warning", async () => {
    const { creditLimit: _l, creditTermDays: _d, availableCredit: _a, ...rest } = position();
    answer({ ...rest, exposure: 250_000 });
    renderWithProviders(<CreditCard />);

    expect(await screen.findByText("Dư nợ")).toBeInTheDocument();
    expect(screen.getByText("Dư nợ").nextElementSibling).toHaveTextContent(/250\.000/);
    expect(screen.queryByText("Hạn mức")).not.toBeInTheDocument();
    expect(screen.queryByText("Hạn mức công nợ của bạn là 0 ₫.")).not.toBeInTheDocument();
  });

  it("says every contract paying after delivery is held when the limit is zero", async () => {
    answer(position({ creditLimit: 0, availableCredit: 0, exposure: 0 }));
    renderWithProviders(<CreditCard />);

    expect(await screen.findByText("Hạn mức công nợ của bạn là 0 ₫.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("explains what the owed figure counts", async () => {
    answer(position());
    renderWithProviders(<CreditCard />);
    expect(await screen.findByText(/đợt thanh toán sau giao hàng/)).toBeInTheDocument();
  });

  it("shows nothing while the position cannot be loaded", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new ApiError(403, "FORBIDDEN", "Không có quyền"));
    const { container } = renderWithProviders(<CreditCard />);

    await vi.waitFor(() => expect(api.get).toHaveBeenCalled());
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows nothing on a contract error rather than wrong figures", async () => {
    answer(position({ exposure: "lots" }));
    const { container } = renderWithProviders(<CreditCard />);

    await vi.waitFor(() => expect(api.get).toHaveBeenCalled());
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
