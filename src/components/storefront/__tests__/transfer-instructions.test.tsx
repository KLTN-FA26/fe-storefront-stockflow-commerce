import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import type { InstallmentTransfer } from "@/lib/installments";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { InstallmentTransferSection, TransferInstructionsBlock } from "../transfer-instructions";

const INSTALLMENT_ID = "7c1f6f0e-3c36-4e0e-9a43-2b0f0d6a1c11";
const transfer: InstallmentTransfer = {
  installmentId: INSTALLMENT_ID,
  contractNumber: "HD-20261108-000007-1",
  orderNumber: "SO-20261108-000007",
  seq: 1,
  name: "Đặt cọc",
  bankName: "Vietcombank",
  accountNumber: "0071000888999",
  accountName: "CONG TY TNHH STOCKFLOW",
  amountDue: 3_750_000,
  currency: "VND",
  reference: "HD-20261108-000007-1 DOT1",
  dueDate: "2026-11-20",
};

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("TransferInstructionsBlock", () => {
  it("shows the account, the transfer content, the amount due and the due day", () => {
    renderWithProviders(<TransferInstructionsBlock transfer={transfer} />);

    expect(screen.getByRole("heading", { name: "Thông tin chuyển khoản" })).toBeInTheDocument();
    expect(screen.getByText("Vietcombank")).toBeInTheDocument();
    expect(screen.getByText("0071000888999")).toBeInTheDocument();
    expect(screen.getByText("CONG TY TNHH STOCKFLOW")).toBeInTheDocument();
    expect(screen.getByText("Nội dung chuyển khoản").nextElementSibling).toHaveTextContent(
      "HD-20261108-000007-1 DOT1",
    );
    expect(screen.getByText("Số tiền cần chuyển").nextElementSibling).toHaveTextContent(
      /3\.750\.000/,
    );
    expect(screen.getByText("Hạn thanh toán").nextElementSibling).toHaveTextContent(/20/);
  });

  it("leaves the due day out when the installment has none (before delivery)", () => {
    renderWithProviders(<TransferInstructionsBlock transfer={{ ...transfer, dueDate: null }} />);
    expect(screen.queryByText("Hạn thanh toán")).not.toBeInTheDocument();
  });

  it("copies the account number and the transfer content", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // userEvent.setup() installs its own clipboard stub; replace it for this test.
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderWithProviders(<TransferInstructionsBlock transfer={transfer} />);

    await user.click(screen.getByRole("button", { name: "Sao chép số tài khoản" }));
    await user.click(screen.getByRole("button", { name: "Sao chép nội dung chuyển khoản" }));
    expect(writeText).toHaveBeenNthCalledWith(1, "0071000888999");
    expect(writeText).toHaveBeenNthCalledWith(2, "HD-20261108-000007-1 DOT1");
  });
});

describe("InstallmentTransferSection", () => {
  it("asks the customer's own installment endpoint and shows the answer", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: transfer });
    renderWithProviders(<InstallmentTransferSection installmentId={INSTALLMENT_ID} />);

    expect(await screen.findByText("0071000888999")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      `/installments/me/${INSTALLMENT_ID}/transfer-instructions`,
      expect.anything(),
    );
  });

  it("tells the customer to ask Sales when the shop has no account set up (503)", async () => {
    vi.spyOn(api, "get").mockRejectedValue(
      new ApiError(503, "TRANSFER_INSTRUCTIONS_UNAVAILABLE", "unavailable"),
    );
    renderWithProviders(<InstallmentTransferSection installmentId={INSTALLMENT_ID} />);

    expect(await screen.findByText("Chưa có thông tin chuyển khoản.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thử lại/ })).not.toBeInTheDocument();
  });

  it("says nothing is left to transfer when the installment was paid meanwhile (409)", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new ApiError(409, "INSTALLMENT_NOT_PAYABLE", "paid"));
    renderWithProviders(<InstallmentTransferSection installmentId={INSTALLMENT_ID} />);

    expect(await screen.findByText("Đợt này không cần chuyển thêm tiền.")).toBeInTheDocument();
  });

  it("offers a retry after another failure", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockRejectedValueOnce(new ApiError(400, "UNSUPPORTED_PARAMETER", "bad id"))
      .mockResolvedValue({ data: transfer });
    const user = userEvent.setup();
    renderWithProviders(<InstallmentTransferSection installmentId={INSTALLMENT_ID} />);

    await user.click(await screen.findByRole("button", { name: /Thử lại/ }));
    await waitFor(() => expect(screen.getByText("0071000888999")).toBeInTheDocument());
    expect(get).toHaveBeenCalledTimes(2);
  });
});
