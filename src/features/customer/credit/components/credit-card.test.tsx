import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { beInstallment } from "@/lib/installments/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { CreditRequestSection } from "../../credit-request";
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
const EMPTY_PAGE = {
  items: [],
  page: 0,
  size: 10,
  totalElements: 0,
  totalPages: 0,
  hasNext: false,
  hasPrevious: false,
};
/** The position at GET /orders/credit-position/me; the card's credit requests (BE PR #490) answer an empty page. */
const answer = (data: unknown) =>
  vi
    .spyOn(api, "get")
    .mockImplementation(async (url: string) =>
      url === "/credit-requests/mine" ? { data: EMPTY_PAGE } : { data },
    );

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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
    expect(value("Dư nợ trả sau giao hàng")).toHaveTextContent(/12\.000\.000/);
    // The limit and what is left of it, under the owed figure.
    expect(value("Dư nợ trả sau giao hàng")?.nextElementSibling).toHaveTextContent(
      /Hạn mức 50\.000\.000.*còn dùng được 38\.000\.000/,
    );
    expect(value("Quá hạn")).toHaveTextContent(/^0/);
    expect(screen.getByText("Không có khoản quá hạn")).toBeInTheDocument();
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
    // No internal step (who approves) is told to the customer, and the way to pay is one tap away.
    expect(screen.getByRole("alert")).not.toHaveTextContent(/kế toán/);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Hợp đồng mới sẽ được gửi sau khi khoản quá hạn được thanh toán.",
    );
    expect(screen.getByRole("link", { name: "Thanh toán ngay" })).toHaveAttribute(
      "href",
      "/account/payments",
    );
    expect(screen.getByText("Quá hạn").nextElementSibling).toHaveTextContent(/400\.000/);
  });

  it("shows what is due now, on-signing installments included, next to an exposure of 0 (sf-03)", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === "/credit-requests/mine") return { data: EMPTY_PAGE };
      if (url === "/identity/me/permissions") {
        return {
          data: {
            roles: ["CUSTOMER"],
            permissions: ["payment-installments:READ"],
            dataScope: "OWN",
          },
        };
      }
      if (url === "/installments/me") {
        const items = [
          beInstallment({
            seq: 1,
            name: "Đặt cọc",
            milestone: "ON_SIGNING",
            status: "DUE",
            overdue: true,
            paidAmount: 0,
            outstanding: 7_048_620,
            dueDate: "2026-11-17",
          }),
        ];
        return { data: { ...EMPTY_PAGE, size: 200, items, totalElements: 1, totalPages: 1 } };
      }
      return {
        data: position({
          exposure: 0,
          availableCredit: 50_000_000,
          hasOverdue: true,
          overdueAmount: 7_048_620,
          oldestOverdueDueDate: "2026-11-17",
        }),
      };
    });
    renderWithProviders(<CreditCard />);

    const value = (label: string) => screen.getByText(label).nextElementSibling;
    expect(await screen.findByText("Cần thanh toán ngay")).toBeInTheDocument();
    expect(value("Cần thanh toán ngay")).toHaveTextContent(/7\.048\.620/);
    expect(screen.getByText("1 đợt, gồm cả đợt thanh toán khi ký hợp đồng")).toBeInTheDocument();
    expect(value("Dư nợ trả sau giao hàng")).toHaveTextContent(/^0/);
    expect(value("Quá hạn")).toHaveTextContent(/7\.048\.620/);
    expect(
      screen.getByText(/không nằm trong dư nợ mà nằm trong Cần thanh toán ngay/),
    ).toBeInTheDocument();
  });

  it("a customer with neither credit nor anything owed sees only the way to ask for credit (handoff A3)", async () => {
    const { creditLimit: _l, creditTermDays: _d, availableCredit: _a, ...rest } = position();
    answer({ ...rest, exposure: 0 });
    renderWithProviders(<CreditCard requests={<CreditRequestSection enabled />} />);

    expect(
      await screen.findByRole("button", { name: "Gửi đề nghị cấp hạn mức" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Dư nợ trả sau giao hàng")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows what a customer without credit still owes, without a limit or a zero-limit warning", async () => {
    const { creditLimit: _l, creditTermDays: _d, availableCredit: _a, ...rest } = position();
    answer({ ...rest, exposure: 250_000 });
    renderWithProviders(<CreditCard />);

    expect(await screen.findByText("Dư nợ trả sau giao hàng")).toBeInTheDocument();
    expect(screen.getByText("Dư nợ trả sau giao hàng").nextElementSibling).toHaveTextContent(
      /250\.000/,
    );
    expect(screen.getByText("Bạn chưa có hạn mức công nợ")).toBeInTheDocument();
    expect(screen.queryByText(/còn dùng được/)).not.toBeInTheDocument();
    expect(screen.queryByText("Hạn mức công nợ của bạn là 0 ₫.")).not.toBeInTheDocument();
  });

  it("says every contract paying after delivery is held when the limit is zero", async () => {
    answer(position({ creditLimit: 0, availableCredit: 0, exposure: 0 }));
    renderWithProviders(<CreditCard />);

    expect(await screen.findByText("Hạn mức công nợ của bạn là 0 ₫.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent(/kế toán|Sale gửi/);
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
