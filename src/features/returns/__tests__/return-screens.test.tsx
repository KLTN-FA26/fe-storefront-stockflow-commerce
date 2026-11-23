import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { beReturn, RETURN_ID } from "@/lib/returns/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { ReturnDetailScreen } from "../components/return-detail-screen";
import { ReturnsScreen } from "../components/returns-screen";

// Next's notFound() throws to the nearest not-found.tsx; here it only records the call.
const notFound = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

const page = (items: unknown[]) => ({
  items,
  page: 0,
  size: 10,
  totalElements: items.length,
  totalPages: items.length > 0 ? 1 : 0,
  hasNext: false,
  hasPrevious: false,
});

const row = (over: Record<string, unknown> = {}) => {
  const r = beReturn(over);
  return {
    id: r.id,
    rmaNumber: r.rmaNumber,
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    customerId: "c0ffee00-0000-4000-8000-000000000001",
    status: r.status,
    reasonCode: r.reasonCode,
    requestedResolution: "REFUND",
    channel: "PORTAL",
    requestedAt: r.requestedAt,
    returnDeadline: r.returnDeadline,
    settlementAmount: null,
    refundedAmount: null,
    offsetAmount: null,
    currency: "VND",
    vatAdjustmentRequired: false,
    closedAt: null,
    version: 1,
  };
};

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  notFound.mockClear();
  signOut();
});

describe("ReturnsScreen", () => {
  it("lists the customer's returns and filters by the open statuses", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: page([row()]) });
    renderWithProviders(<ReturnsScreen />);
    const link = await screen.findByRole("link", { name: /RMA-20261110-0001/ });
    expect(link).toHaveAttribute("href", `/account/returns/${RETURN_ID}`);
    expect(within(link).getByText("Chờ gửi hàng về")).toBeInTheDocument();
    expect(within(link).getByText(/Gửi hàng về trước/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Đang xử lý" }));
    await vi.waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        "/returns/me",
        expect.objectContaining({
          params: expect.objectContaining({
            status: ["REQUESTED", "AWAITING_RETURN", "RECEIVED", "SETTLEMENT_PENDING"],
          }),
        }),
      ),
    );
  });

  it("never lists a return settled with no money as refunded (SF-01)", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: page([row({ status: "RESOLVED" })].map((r) => ({ ...r, settlementAmount: 0 }))),
    });
    renderWithProviders(<ReturnsScreen />);
    const link = await screen.findByRole("link", { name: /RMA-20261110-0001/ });
    expect(within(link).getByText("Đã xử lý — không hoàn tiền")).toBeInTheDocument();
    expect(within(link).queryByText("Đã hoàn tiền")).toBeNull();
  });

  it("says when there is no return yet", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: page([]) });
    renderWithProviders(<ReturnsScreen />);
    expect(await screen.findByText("Bạn chưa có yêu cầu trả hàng nào")).toBeInTheDocument();
  });
});

describe("ReturnDetailScreen (kltn-docs 17 §4.10)", () => {
  it("tells the customer to send the approved goods back by the deadline, and lets them withdraw", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: beReturn() });
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: beReturn({ status: "CANCELLED" }) });
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    expect(await screen.findByText("Gửi hàng về kho")).toBeInTheDocument();
    expect(screen.getByText("MUG-CERAMIC-11OZ")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Rút yêu cầu trả hàng" }));
    await userEvent.click(screen.getByRole("button", { name: "Rút yêu cầu" }));
    await vi.waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/returns/${RETURN_ID}/cancellation`, undefined),
    );
  });

  it("offers no withdrawal once a parcel is back, and says why", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: beReturn({
        receivedAt: "2026-11-15T03:00:00Z",
        lines: [{ ...beReturn().lines[0], receivedQuantity: 1 }],
      }),
    });
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    expect(
      await screen.findByText("Kho đã nhận một phần hàng nên không rút được yêu cầu."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rút yêu cầu trả hàng" })).toBeNull();
  });

  it("explains the BE refusal when goods arrived after the page was loaded", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: beReturn() });
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError(409, "RETURN_GOODS_PARTLY_RECEIVED", "Some goods are back"),
    );
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    await userEvent.click(await screen.findByRole("button", { name: "Rút yêu cầu trả hàng" }));
    await userEvent.click(screen.getByRole("button", { name: "Rút yêu cầu" }));
    expect(await screen.findByText(/không thể rút yêu cầu nữa/)).toBeInTheDocument();
  });

  it("hides the withdrawal while the warehouse counts a parcel (receiptDraftOpen), and says why", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: beReturn({ receiptDraftOpen: true }) });
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    expect(
      await screen.findByText(/Kho đang kiểm đếm một kiện hàng trả của yêu cầu này nên tạm thời/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rút yêu cầu trả hàng" })).toBeNull();
  });

  // G4 BE-23: a parcel being counted at the dock blocks the withdrawal; the BE says so with a code.
  it("explains a withdrawal refused while the warehouse counts a parcel (RETURN_RECEIPT_DRAFT_OPEN)", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: beReturn() });
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError(409, "RETURN_RECEIPT_DRAFT_OPEN", "A parcel is still being counted"),
    );
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    await userEvent.click(await screen.findByRole("button", { name: "Rút yêu cầu trả hàng" }));
    await userEvent.click(screen.getByRole("button", { name: "Rút yêu cầu" }));
    expect(await screen.findByText(/Kho đang kiểm đếm một kiện hàng trả/)).toBeInTheDocument();
    expect(screen.queryByText(/still being counted/)).toBeNull();
  });

  it("downloads the stock-in voucher once goods are received, and says why when there is none yet", async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:voucher"), revokeObjectURL: vi.fn() });
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    const received = beReturn({
      status: "RECEIVED",
      receivedAt: "2026-11-15T03:00:00Z",
      lines: [{ ...beReturn().lines[0], receivedQuantity: 1 }],
    });
    let voucherReady = false;
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === `/returns/me/${RETURN_ID}/receipt-voucher`) {
        if (!voucherReady) throw new ApiError(404, "GOODS_RECEIPT_NOT_FOUND", "Nothing confirmed");
        return {
          data: new Blob(["%PDF"]),
          headers: {
            "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent("Phiếu nhập kho NK-20261115-0001.pdf")}`,
          },
        };
      }
      return { data: received };
    });
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    const button = await screen.findByRole("button", {
      name: "Tải phiếu nhập kho hàng trả RMA-20261110-0001",
    });
    await userEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Kho chưa xác nhận nhận hàng trả của yêu cầu này nên chưa có phiếu nhập kho.",
    );
    voucherReady = true;
    await userEvent.click(button);
    await vi.waitFor(() => expect(saved).toEqual(["Phiếu nhập kho NK-20261115-0001.pdf"]));
  });

  it("offers no voucher before anything came back", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: beReturn() });
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    expect(await screen.findByText("Gửi hàng về kho")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /phiếu nhập kho/ })).toBeNull();
  });

  it("shows why a return was refused, and offers no withdrawal once closed", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: beReturn({ status: "REJECTED", rejectionReason: "Ảnh không thấy lỗi in." }),
    });
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    expect(await screen.findByText("Ảnh không thấy lỗi in.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rút yêu cầu trả hàng" })).toBeNull();
  });

  it("shows the refund once it is approved", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: beReturn({ status: "RESOLVED", refundedAmount: 129_000, offsetAmount: 50_000 }),
    });
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    const money = await screen.findByRole("region", { name: "Hoàn tiền" });
    expect(within(money).getByText(/129\.000/)).toBeInTheDocument();
    expect(within(money).getByText(/50\.000/)).toBeInTheDocument();
  });

  it("lets the customer add photos only while the return waits for review", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: beReturn({ status: "REQUESTED" }) });
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    expect(await screen.findByText("Thêm ảnh", { selector: "label" })).toBeInTheDocument();
  });

  // SF-04: the BE takes claim photos while the goods are still on their way back.
  it("lets the customer add photos while the approved goods are awaited", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: beReturn({ status: "AWAITING_RETURN" }) });
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    expect(await screen.findByText("Thêm ảnh", { selector: "label" })).toBeInTheDocument();
  });

  // SF-01 / Q-4: the refusal is the answer to the customer's claim, with its fixed reason.
  it("shows a return refused by policy as handled without a refund, with its reason", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: beReturn({
        status: "RESOLVED",
        outcome: "REFUSED",
        refusalReason: "CUSTOMER_DAMAGE",
        refusalNote: "Thùng bị ẩm do để ngoài trời.",
        refundedAmount: 0,
        offsetAmount: 0,
        receivedAt: "2026-11-15T03:00:00Z",
        lines: [
          { ...beReturn().lines[0], receivedQuantity: 1, refundQuantity: 0, refundAmount: 0 },
        ],
        history: [
          { status: "REQUESTED", occurredAt: "2026-11-10T03:00:00Z" },
          { status: "RESOLVED", occurredAt: "2026-11-16T03:00:00Z" },
        ],
      }),
    });
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    const status = (await screen.findByText(/Lý do: Hư hỏng do bảo quản/)).closest(
      "[role=status]",
    )!;
    expect(status).toHaveTextContent("Đã xử lý — không hoàn tiền");
    expect(status).toHaveTextContent("Lý do: Hư hỏng do bảo quản/sử dụng.");
    expect(status).toHaveTextContent("Thùng bị ẩm do để ngoài trời.");
    expect(status).toHaveTextContent(/vẫn thuộc về bạn/);
    expect(screen.queryByText("Đã hoàn tiền")).toBeNull();
    // No "0 ₫ / 0 ₫" money card, and the history step says the same.
    expect(screen.queryByRole("region", { name: "Hoàn tiền" })).toBeNull();
    const history = screen.getByRole("region", { name: "Lịch sử" });
    expect(within(history).getByText("Đã xử lý — không hoàn tiền")).toBeInTheDocument();
  });

  // Audit r2 returns H1: the customer's choice for goods held for them, as Sales recorded it.
  it.each([
    ["SEND_BACK", /kho sẽ gửi trả hàng bạn đã gửi về, phí vận chuyển do bạn chịu/],
    ["DESTROY_ON_BEHALF", /đồng ý để công ty huỷ hộ/],
    ["SOMETHING_NEW", /Sales đã ghi lựa chọn của bạn/],
  ])("shows the recorded custody choice %s", async (custodyChoice, text) => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: beReturn({
        status: "RESOLVED",
        outcome: "REFUSED",
        refusalReason: "CUSTOMER_DAMAGE",
        refundedAmount: 0,
        offsetAmount: 0,
        receivedAt: "2026-11-15T03:00:00Z",
        custodyChoice,
        lines: [
          { ...beReturn().lines[0], receivedQuantity: 1, refundQuantity: 0, refundAmount: 0 },
        ],
      }),
    });
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    const status = (await screen.findByText(/Lý do: Hư hỏng do bảo quản/)).closest(
      "[role=status]",
    )!;
    expect(status).toHaveTextContent(text);
    expect(status).not.toHaveTextContent(/Sales sẽ liên hệ để thống nhất/);
  });

  it("reads a return closed at 0 by an older BE (no outcome) as not refunded", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: beReturn({ status: "RESOLVED", refundedAmount: 0, offsetAmount: 0 }),
    });
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    const status = (
      await screen.findByText(/Yêu cầu đã kết thúc và không có khoản hoàn tiền nào/)
    ).closest("[role=status]")!;
    expect(status).toHaveTextContent("Đã xử lý — không hoàn tiền");
    expect(screen.queryByText("Đã hoàn tiền")).toBeNull();
    expect(screen.queryByRole("region", { name: "Hoàn tiền" })).toBeNull();
  });

  it("is not found for a bad id, without asking the BE", () => {
    const get = vi.spyOn(api, "get");
    renderWithProviders(<ReturnDetailScreen returnId="not-an-id" />);
    expect(notFound).toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("is not found for another customer's return (BE 404)", async () => {
    vi.spyOn(api, "get").mockRejectedValue(
      new ApiError(404, "RETURN_REQUEST_NOT_FOUND", "No return request"),
    );
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    await vi.waitFor(() => expect(notFound).toHaveBeenCalled());
  });
});
