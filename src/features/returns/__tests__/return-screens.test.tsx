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
