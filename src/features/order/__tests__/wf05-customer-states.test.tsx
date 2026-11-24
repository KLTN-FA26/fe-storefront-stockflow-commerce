import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { contractStatusMeta } from "@/features/chat/labels";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { beInvoice } from "@/lib/einvoices/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { OrderDeliveryCard } from "../components/order-detail-sections";
import { OrderInvoicesCard } from "../components/order-invoices-card";
import { OrderReturnsCard } from "../components/order-returns-card";
import { OrderStatusHero } from "../components/order-status-hero";
import { CONTRACT_STATUS_META } from "../contract-labels";
import { contractDtoSchema } from "../contract-schemas";
import { displayGroup, orderProgress } from "../lifecycle";
import { orderCardDtoSchema, orderDtoSchema } from "../schemas";
import { beCard, beOrder } from "./fixtures";

/**
 * What a customer reads once WF-05's decisions are in (2026-11-23): an order closed after completion,
 * an order partly brought back by the carrier, a liquidated contract, and the 04/SS notices of an
 * invoice.
 */

const order = (over: Record<string, unknown> = {}) => orderDtoSchema.parse({ ...beOrder, ...over });
const page = (items: unknown[]) => ({
  items,
  page: 0,
  size: 200,
  totalElements: items.length,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
});

function backend(permissions: string[], routes: Record<string, () => unknown>) {
  return vi.spyOn(api, "get").mockImplementation(async (url: string) => {
    if (url === "/identity/me/permissions")
      return { data: { roles: ["CUSTOMER"], permissions, dataScope: "OWN" } };
    const route = routes[url];
    if (!route) throw new ApiError(404, "NOT_FOUND", url);
    return { data: route() };
  });
}

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("an order closed after completion (SF-02)", () => {
  it("reads 'Đã đóng', never 'hoàn tất khi hết hạn đổi trả' again", () => {
    const closed = order({ status: "CLOSED", statusGroup: "DELIVERED" });
    const group = displayGroup(closed);
    renderWithProviders(
      <OrderStatusHero group={group} progress={orderProgress(group, true)} action={null} />,
    );
    expect(screen.getByText("Đã đóng")).toBeInTheDocument();
    expect(screen.queryByText(/hoàn tất khi hết hạn đổi trả/)).toBeNull();
  });

  it("reads the same on a list row", () => {
    const card = orderCardDtoSchema.parse({
      ...beCard,
      status: "CLOSED",
      statusGroup: "DELIVERED",
    });
    expect(displayGroup(card)).toBe("CLOSED");
  });
});

describe("an order partly brought back by the carrier (WF-05 F-2, BE-35)", () => {
  const partly = (over: Record<string, unknown> = {}) =>
    order({
      status: "PARTIALLY_REFUNDED",
      statusGroup: "PARTIALLY_RETURNED",
      deliveryState: "PARTIALLY_RETURNED",
      ...over,
    });

  it("is never called 'Đã trả hàng' or 'Đã trả lại'", () => {
    const current = partly();
    renderWithProviders(
      <>
        <OrderStatusHero group={displayGroup(current)} progress={null} action={null} />
        <OrderDeliveryCard order={current} />
      </>,
    );
    expect(screen.getByText("Giữ một phần hàng")).toBeInTheDocument();
    expect(
      screen.getByText("Bạn giữ một phần hàng; phần còn lại đã trả về hoặc thất lạc"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Đã trả hàng")).toBeNull();
    expect(screen.queryByText("Đã trả lại")).toBeNull();
  });

  it("keeps the delivered part's invoices in view, and says they are coming when none is yet", async () => {
    backend(["einvoices:READ"], { "/einvoices/me": () => page([]) });
    renderWithProviders(<OrderInvoicesCard order={partly()} />);
    expect(await screen.findByText(/đang được phát hành/)).toBeInTheDocument();
  });

  it("still lists the order's returns", async () => {
    const get = backend(["sales-rmas:READ"], {
      "/returns/me": () => page([]),
    });
    renderWithProviders(<OrderReturnsCard order={partly()} />);
    await vi.waitFor(() =>
      expect(get).toHaveBeenCalledWith("/returns/me", expect.objectContaining({})),
    );
  });

  it("reads an unknown group or delivery state from a newer BE as neutral wording", () => {
    const newer = order({ statusGroup: "SOMETHING_NEW", deliveryState: "SOMETHING_NEW" });
    expect(newer.statusGroup).toBe("UNKNOWN");
    expect(newer.deliveryState).toBe("UNKNOWN");
  });
});

describe("a liquidated contract (WF-05 Q-6, F-3)", () => {
  it("reads 'Thanh lý' (decision Q-6) on the order page and in the chat card", () => {
    const contract = contractDtoSchema.parse({
      id: "c0000000-0000-4000-8000-000000000001",
      contractNumber: "HD-2026-0001",
      orderId: beOrder.orderId,
      orderNumber: beOrder.orderNumber,
      status: "LIQUIDATED",
      totals: { netAmount: 100, taxAmount: 8, totalAmount: 108 },
      version: 3,
    });
    expect(contract.status).toBe("LIQUIDATED");
    expect(CONTRACT_STATUS_META.LIQUIDATED.label).toBe("Thanh lý");
    expect(contractStatusMeta("LIQUIDATED")).toEqual(CONTRACT_STATUS_META.LIQUIDATED);
    expect(CONTRACT_STATUS_META.LIQUIDATED.label).not.toBe(CONTRACT_STATUS_META.COMPLETED.label);
  });
});

describe("the 04/SS notices of an invoice (SF-03, Q-22 §4.4)", () => {
  const notice = (status: string) => ({
    id: "0e550000-0000-4000-8000-000000000001",
    einvoiceId: beInvoice().id,
    formName: "04/SS-HĐĐT",
    correctBuyerName: "Công ty TNHH Quán cà phê Mộc",
    correctBuyerAddress: "12 Lý Tự Trọng, Quận 1, TP.HCM",
    status,
    recordedAt: "2026-11-11T03:00:00Z",
  });
  const invoices = () => page([{ ...beInvoice(), orderId: beOrder.orderId }]);

  it("shows the right name and address on the invoice's row, with what was really sent", async () => {
    backend(["einvoices:READ"], {
      "/einvoices/me": invoices,
      [`/einvoices/me/${beInvoice().id}/error-notices`]: () => [notice("ACCEPTED")],
    });
    renderWithProviders(<OrderInvoicesCard order={order({ deliveryState: "DELIVERED" })} />);
    const notices = await screen.findByRole("list", { name: "Thông báo sai sót của hoá đơn" });
    expect(within(notices).getByText(/Công ty TNHH Quán cà phê Mộc/)).toBeInTheDocument();
    expect(within(notices).getByText(/12 Lý Tự Trọng/)).toBeInTheDocument();
    expect(within(notices).getByText("Cơ quan thuế đã tiếp nhận")).toBeInTheDocument();
    expect(within(notices).getByText(/vẫn giữ nguyên giá trị/)).toBeInTheDocument();
  });

  it("never tells the customer the tax authority was notified of a notice only recorded", async () => {
    backend(["einvoices:READ"], {
      "/einvoices/me": invoices,
      [`/einvoices/me/${beInvoice().id}/error-notices`]: () => [notice("DRAFT")],
    });
    renderWithProviders(<OrderInvoicesCard order={order({ deliveryState: "DELIVERED" })} />);
    const notices = await screen.findByRole("list", { name: "Thông báo sai sót của hoá đơn" });
    expect(within(notices).getByText("Người bán đã ghi nhận")).toBeInTheDocument();
    expect(within(notices).queryByText(/cơ quan thuế/i)).toBeNull();
  });

  it("shows nothing for an invoice without notices, and says so when they cannot be read", async () => {
    backend(["einvoices:READ"], {
      "/einvoices/me": invoices,
      [`/einvoices/me/${beInvoice().id}/error-notices`]: () => [],
    });
    const { unmount } = renderWithProviders(
      <OrderInvoicesCard order={order({ deliveryState: "DELIVERED" })} />,
    );
    await screen.findByRole("list", { name: "Hoá đơn của đơn" });
    await vi.waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        `/einvoices/me/${beInvoice().id}/error-notices`,
        expect.anything(),
      ),
    );
    expect(screen.queryByRole("list", { name: "Thông báo sai sót của hoá đơn" })).toBeNull();
    unmount();
    vi.restoreAllMocks();

    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === "/identity/me/permissions")
        return { data: { roles: ["CUSTOMER"], permissions: ["einvoices:READ"], dataScope: "OWN" } };
      if (url === "/einvoices/me") return { data: invoices() };
      throw new ApiError(400, "VALIDATION_FAILED", url);
    });
    renderWithProviders(<OrderInvoicesCard order={order({ deliveryState: "DELIVERED" })} />);
    expect(
      await screen.findByText(/Chưa tải được thông báo sai sót của hoá đơn này/),
    ).toBeInTheDocument();
  });
});
