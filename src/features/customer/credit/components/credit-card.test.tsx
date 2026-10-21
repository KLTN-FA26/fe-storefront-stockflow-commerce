import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { CreditCard } from "./credit-card";

const answer = (data: unknown) => vi.spyOn(api, "get").mockResolvedValue({ data });

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("CreditCard (account page, SFCREDIT)", () => {
  it("shows the limit, what is owed, what is left and the days to pay", async () => {
    answer({
      allowedTerms: ["PREPAID", "CREDIT"],
      creditLimit: 50_000_000,
      exposure: 12_000_000,
      availableCredit: 38_000_000,
      creditTermDays: 30,
      currency: "VND",
      hasOverdue: false,
    });
    renderWithProviders(<CreditCard />);

    expect(await screen.findByRole("heading", { name: "Công nợ" })).toBeInTheDocument();
    const value = (label: string) => screen.getByText(label).nextElementSibling;
    expect(value("Hạn mức")).toHaveTextContent(/50\.000\.000/);
    expect(value("Đang nợ")).toHaveTextContent(/12\.000\.000/);
    expect(value("Còn lại")).toHaveTextContent(/38\.000\.000/);
    expect(screen.getByText(/Kỳ hạn thanh toán/)).toHaveTextContent("30 ngày");
    expect(screen.getByRole("img", { name: "Đã dùng 24% hạn mức" })).toBeInTheDocument();
    expect(screen.queryByText("Bạn có khoản công nợ quá hạn.")).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/orders/payment-terms", expect.anything());
  });

  it("warns while a receivable is overdue", async () => {
    answer({
      allowedTerms: ["CREDIT"],
      creditLimit: 1_000_000,
      exposure: 1_000_000,
      availableCredit: 0,
      hasOverdue: true,
    });
    renderWithProviders(<CreditCard />);

    expect(await screen.findByText("Bạn có khoản công nợ quá hạn.")).toBeInTheDocument();
    expect(screen.getByText("Đang nợ").nextElementSibling).toHaveTextContent(/1\.000\.000/);
    expect(screen.queryByText(/Kỳ hạn thanh toán/)).not.toBeInTheDocument();
  });

  it("shows nothing to a customer without credit (the BE omits the credit fields)", async () => {
    answer({ allowedTerms: ["PREPAID", "DEPOSIT"], defaultTerm: "PREPAID", depositPercent: 30 });
    const { container } = renderWithProviders(<CreditCard />);

    await vi.waitFor(() => expect(api.get).toHaveBeenCalled());
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("says it could not load, and retries", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Không có quyền"))
      .mockResolvedValue({ data: { allowedTerms: ["CREDIT"], creditLimit: 5_000_000 } });
    renderWithProviders(<CreditCard />);

    expect(await screen.findByText("Không tải được thông tin công nợ.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Hạn mức")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
