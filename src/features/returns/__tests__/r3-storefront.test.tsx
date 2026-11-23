/**
 * Audit r3 (BE r3a / r3c) on the customer's screens: money L-6 the return list says why units were not refunded (once the
 * return is RESOLVED, as the BE sends it); RAD-1 a refunded return can still hold the customer's goods (cartons settle per
 * SKU); LM-3 what a closure carried onto its fee item, and fee items named for what they are.
 */
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { installmentDtoSchema } from "@/lib/installments";
import { installmentMilestoneLabel, installmentTitle } from "@/lib/installments/selectors";
import { beInstallment } from "@/lib/installments/__tests__/fixtures";
import { beReturn, RETURN_ID } from "@/lib/returns/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { OrderRefundCard } from "../../order/components/order-refund-card";
import { orderDtoSchema } from "../../order/schemas";
import { beOrder, orderId } from "../../order/__tests__/fixtures";
import { ReturnDetailScreen } from "../components/return-detail-screen";
import { ReturnsScreen } from "../components/returns-screen";

const notFound = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  notFound.mockClear();
  signOut();
});

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
    settlementAmount: 0,
    refundedAmount: 0,
    offsetAmount: 0,
    currency: "VND",
    vatAdjustmentRequired: false,
    closedAt: null,
    version: 1,
    ...over,
  };
};

describe("money L-6: the return list says why nothing was refunded", () => {
  it("a RESOLVED row with a refusal reason reads it in Vietnamese; an unknown code shows no raw code", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: page([
        row({ status: "RESOLVED", outcome: "REFUSED", refusalReason: "CUSTOMER_DAMAGE" }),
        row({
          id: "0193a1b2-0000-7000-8000-0000000000c2",
          rmaNumber: "RMA-20261110-0002",
          status: "RESOLVED",
          outcome: "REFUSED",
          refusalReason: "SOMETHING_NEW",
        }),
      ]),
    });
    renderWithProviders(<ReturnsScreen />);
    const first = await screen.findByRole("link", { name: /RMA-20261110-0001/ });
    expect(
      within(first).getByText("Lý do không hoàn: Hư hỏng do bảo quản/sử dụng"),
    ).toBeInTheDocument();
    const second = screen.getByRole("link", { name: /RMA-20261110-0002/ });
    expect(within(second).queryByText(/Lý do không hoàn/)).toBeNull();
    expect(within(second).queryByText(/SOMETHING_NEW/)).toBeNull();
  });

  it("a row still open never shows a reason, even if one is sent", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: page([row({ status: "SETTLEMENT_PENDING", refusalReason: "CUSTOMER_DAMAGE" })]),
    });
    renderWithProviders(<ReturnsScreen />);
    const link = await screen.findByRole("link", { name: /RMA-20261110-0001/ });
    expect(within(link).queryByText(/Lý do không hoàn/)).toBeNull();
  });
});

describe("RAD-1: part of a refunded return can stay the customer's", () => {
  it("12oz refunded, 16oz withheld for customer damage: the reason and the choice for the 16oz cartons show", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: beReturn({
        status: "RESOLVED",
        outcome: "REFUNDED",
        refundedAmount: 1_200_000,
        offsetAmount: 0,
        refusalReason: "CUSTOMER_DAMAGE",
        custodyChoice: "SEND_BACK",
      }),
    });
    renderWithProviders(<ReturnDetailScreen returnId={RETURN_ID} />);
    expect(
      await screen.findByText(
        /Một phần hàng bạn gửi về không được hoàn tiền\. Lý do: Hư hỏng do bảo quản\/sử dụng/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Với phần hàng không được hoàn tiền, bạn đã chọn nhận lại/),
    ).toBeInTheDocument();
  });
});

describe("LM-3: a closure's fee item", () => {
  const order = (over: Record<string, unknown> = {}) =>
    orderDtoSchema.parse({ ...beOrder, ...over });

  it("the refund card says what the closed batches carried onto it", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === "/identity/me/permissions")
        return {
          data: { roles: ["CUSTOMER"], permissions: ["payment-refunds:READ"], dataScope: "OWN" },
        };
      if (url === `/refunds/me/orders/${orderId}`)
        return {
          data: {
            orderId,
            currency: "VND",
            refundStatus: "NONE",
            refundable: 0,
            refunded: 0,
            remaining: 0,
            feeOwed: 2_000_000,
            records: [],
            settlements: [
              { kind: "REMAINDER_CLOSED", shippingFeeWaived: 0, carriedToFee: 2_000_000 },
            ],
          },
        };
      throw new ApiError(404, "NOT_FOUND", url);
    });
    renderWithProviders(<OrderRefundCard order={order()} />);
    const label = await screen.findByText("Chuyển sang khoản phải trả khi đóng phần còn lại");
    expect(label.nextElementSibling).toHaveTextContent(/2\.000\.000/);
    expect(
      screen.getByText(/Phí khuôn, phí vận chuyển của các đợt giao đã đóng/),
    ).toBeInTheDocument();
  });

  it("names the fee item in Vietnamese and never calls the carried share a cancellation fee", () => {
    const carried = installmentDtoSchema.parse(
      beInstallment({ milestone: "CANCELLATION_FEE", name: "Fee lines of the batches closed" }),
    );
    expect(installmentTitle(carried)).toMatch(
      /Phí khuôn, phí vận chuyển của các đợt giao đã đóng$/,
    );
    expect(installmentMilestoneLabel(carried)).toBe("Khoản phải trả khi đóng phần còn lại");
    const cancellation = installmentDtoSchema.parse(
      beInstallment({ milestone: "CANCELLATION_FEE", name: "Cancellation fee" }),
    );
    expect(installmentMilestoneLabel(cancellation)).toBe("Phí huỷ đơn");
    const unknown = installmentDtoSchema.parse(
      beInstallment({ milestone: "CANCELLATION_FEE", name: "Khoản khác" }),
    );
    expect(installmentMilestoneLabel(unknown)).toBe("Phí huỷ đơn / đóng phần còn lại");
    expect(installmentTitle(unknown)).toMatch(/Khoản khác$/);
  });
});
