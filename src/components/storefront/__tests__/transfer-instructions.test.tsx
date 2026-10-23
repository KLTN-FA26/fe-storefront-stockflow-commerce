import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import type { TransferInstructions } from "@/lib/transfer-instructions";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { TransferInstructionsBlock, TransferInstructionsSection } from "../transfer-instructions";

const ORDER_ID = "7c1f6f0e-3c36-4e0e-9a43-2b0f0d6a1c11";
const instructions: TransferInstructions = {
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

describe("TransferInstructionsBlock", () => {
  it("shows the account, the transfer content, the amount due and the note", () => {
    renderWithProviders(<TransferInstructionsBlock instructions={instructions} />);

    expect(screen.getByRole("heading", { name: "Thông tin chuyển khoản" })).toBeInTheDocument();
    expect(screen.getByText("Vietcombank")).toBeInTheDocument();
    expect(screen.getByText("0071000888999")).toBeInTheDocument();
    expect(screen.getByText("CONG TY TNHH STOCKFLOW")).toBeInTheDocument();
    expect(screen.getByText("Nội dung chuyển khoản").nextElementSibling).toHaveTextContent(
      "SO-20261023-000007",
    );
    expect(screen.getByText("Số tiền cần chuyển").nextElementSibling).toHaveTextContent(
      /3\.750\.000/,
    );
    expect(screen.getByText("Đơn được xác nhận khi nhận đủ tiền cọc.")).toBeInTheDocument();
  });

  it("copies the account number and the transfer content", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // userEvent.setup() installs its own clipboard stub; replace it for this test.
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderWithProviders(<TransferInstructionsBlock instructions={instructions} />);

    await user.click(screen.getByRole("button", { name: "Sao chép số tài khoản" }));
    await user.click(screen.getByRole("button", { name: "Sao chép nội dung chuyển khoản" }));
    expect(writeText).toHaveBeenNthCalledWith(1, "0071000888999");
    expect(writeText).toHaveBeenNthCalledWith(2, "SO-20261023-000007");
  });

  it("renders nothing when there is nothing to transfer (dueBy NONE)", () => {
    const { container } = renderWithProviders(
      <TransferInstructionsBlock instructions={{ ...instructions, dueBy: "NONE", amountDue: 0 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("still shows a due amount whose deadline this FE does not know", () => {
    renderWithProviders(
      <TransferInstructionsBlock instructions={{ ...instructions, dueBy: "UNKNOWN" }} />,
    );
    expect(screen.getByText("0071000888999")).toBeInTheDocument();
  });
});

describe("TransferInstructionsSection", () => {
  it("reads the customer's own order and shows the block", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: instructions });
    renderWithProviders(<TransferInstructionsSection orderId={ORDER_ID} />);

    expect(await screen.findByText("0071000888999")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      `/orders/me/${ORDER_ID}/transfer-instructions`,
      expect.anything(),
    );
  });

  it("says plainly to contact Sales when the shop has no bank account set up (503)", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockRejectedValue(new ApiError(503, "TRANSFER_INSTRUCTIONS_UNAVAILABLE", "not configured"));
    renderWithProviders(<TransferInstructionsSection orderId={ORDER_ID} />);

    expect(
      await screen.findByText(/Cửa hàng chưa cấu hình tài khoản nhận tiền, vui lòng liên hệ Sale/),
    ).toBeInTheDocument();
    // It is not an error page, and asking again would not help.
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  });

  it("renders nothing for dueBy NONE", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: { ...instructions, dueBy: "NONE", amountDue: 0 },
    });
    const { container } = renderWithProviders(<TransferInstructionsSection orderId={ORDER_ID} />);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(container).toBeEmptyDOMElement();
  });

  it("offers a retry for any other failure", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new ApiError(404, "NOT_FOUND", "x"));
    renderWithProviders(<TransferInstructionsSection orderId={ORDER_ID} />);
    expect(await screen.findByRole("button", { name: "Thử lại" })).toBeInTheDocument();
  });
});
