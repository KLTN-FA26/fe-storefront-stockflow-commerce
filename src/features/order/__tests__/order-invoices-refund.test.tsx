import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { beInvoice } from "@/lib/einvoices/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { OrderDeliveryCard } from "../components/order-detail-sections";
import { OrderInvoicesCard } from "../components/order-invoices-card";
import { OrderRefundCard } from "../components/order-refund-card";
import { orderDtoSchema } from "../schemas";
import { beOrder, orderId } from "./fixtures";

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

describe("OrderInvoicesCard (kltn-docs 21 §4.3)", () => {
  it("lists only this order's issued invoices, with PDF and XML downloads", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    backend(["einvoices:READ"], {
      "/einvoices/me": () =>
        page([
          beInvoice(),
          beInvoice({
            id: "5e1a0000-0000-4000-8000-000000000009",
            orderId: "0b7d3c1e-0000-4000-8000-000000000009",
            invoiceNumber: 99,
          }),
        ]),
      [`/einvoices/me/${beInvoice().id}/files/PDF`]: () => ({
        url: "https://files/x.pdf",
        expiresAt: "2026-11-10T03:05:00Z",
      }),
    });
    renderWithProviders(<OrderInvoicesCard order={order({ deliveryState: "DELIVERED" })} />);
    const list = await screen.findByRole("list", { name: "Hoá đơn của đơn" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("1C26TAA-0000042")).toBeInTheDocument();
    await userEvent.click(within(list).getByRole("button", { name: /Tải PDF/ }));
    await vi.waitFor(() =>
      expect(open).toHaveBeenCalledWith("https://files/x.pdf", "_blank", "noopener,noreferrer"),
    );
  });

  it("tells a delivered order's customer its invoice is being issued", async () => {
    backend(["einvoices:READ"], { "/einvoices/me": () => page([]) });
    renderWithProviders(<OrderInvoicesCard order={order({ deliveryState: "DELIVERED" })} />);
    expect(await screen.findByText(/đang được phát hành/)).toBeInTheDocument();
  });

  it("shows nothing before delivery, or without einvoices:READ", async () => {
    const get = backend(["sales-orders:READ"], { "/einvoices/me": () => page([beInvoice()]) });
    const { container } = renderWithProviders(
      <OrderInvoicesCard order={order({ deliveryState: "DELIVERED" })} />,
    );
    await vi.waitFor(() =>
      expect(get).toHaveBeenCalledWith("/identity/me/permissions", expect.anything()),
    );
    expect(get).not.toHaveBeenCalledWith("/einvoices/me", expect.anything());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("OrderInvoicesCard — HT-1", () => {
  const ORIGINAL = beInvoice({ status: "REPLACED" });
  const REPLACEMENT = beInvoice({
    id: "5e1a0000-0000-4000-8000-000000000002",
    type: "REPLACEMENT",
    invoiceNumber: 57,
    issueDate: "2026-11-12",
    issuedAt: "2026-11-12T03:00:00Z",
  });

  it("links a replaced invoice to the invoice that replaced it", async () => {
    backend(["einvoices:READ"], {
      "/einvoices/me": () =>
        page([REPLACEMENT, ORIGINAL].map((i) => ({ ...i, orderId: beOrder.orderId }))),
    });
    renderWithProviders(<OrderInvoicesCard order={order({ deliveryState: "DELIVERED" })} />);
    const link = await screen.findByRole("link", { name: "1C26TAA-0000057" });
    expect(link).toHaveAttribute("href", `#einvoice-${REPLACEMENT.id}`);
    expect(document.getElementById(`einvoice-${REPLACEMENT.id}`)).not.toBeNull();
  });

  it("explains when invoices come while the order is not completed", async () => {
    backend(["einvoices:READ"], { "/einvoices/me": () => page([]) });
    renderWithProviders(
      <OrderInvoicesCard
        order={order({
          status: "SHIPPED",
          statusGroup: "SHIPPING",
          deliveryState: "DELIVERY_FAILED",
          shipments: [{ shipmentId: orderId, status: "DELIVERY_FAILED" }],
        })}
      />,
    );
    const notes = await screen.findByRole("list", { name: "Điều kiện xuất hoá đơn" });
    expect(notes).toHaveTextContent(/từng lần giao thành công/);
    expect(notes).toHaveTextContent(/chưa có lần giao thành công/);
    expect(notes).toHaveTextContent(/không được xuất hoá đơn/);
  });

  it("says nothing more once the order is completed", async () => {
    backend(["einvoices:READ"], {
      "/einvoices/me": () => page([{ ...beInvoice(), orderId: beOrder.orderId }]),
    });
    renderWithProviders(
      <OrderInvoicesCard
        order={order({ status: "COMPLETED", statusGroup: "DELIVERED", deliveryState: "DELIVERED" })}
      />,
    );
    await screen.findByRole("list", { name: "Hoá đơn của đơn" });
    expect(screen.queryByRole("list", { name: "Điều kiện xuất hoá đơn" })).toBeNull();
  });
});

describe("OrderDeliveryCard — failed deliveries (HT-1)", () => {
  it("shows why a delivery failed, and that a retry delivered it", () => {
    renderWithProviders(
      <OrderDeliveryCard
        order={order({
          deliveryState: "DELIVERY_FAILED",
          shipments: [
            {
              shipmentCode: "SO-1-S1",
              status: "DELIVERED",
              failureReason: "CUSTOMER_ABSENT",
              outcomeAt: "2026-11-10T03:00:00Z",
            },
            {
              shipmentCode: "SO-1-S2",
              status: "DELIVERY_FAILED",
              failureReason: "WRONG_ADDRESS",
              outcomeAt: "2026-11-12T03:00:00Z",
            },
          ],
        })}
      />,
    );
    const list = screen.getByRole("list", { name: "Lần giao không thành công" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent(/đã giao lại thành công/);
    expect(first).toHaveTextContent("Không gặp được người nhận");
    expect(second).toHaveTextContent(/giao không thành công/);
    expect(second).toHaveTextContent("Địa chỉ giao hàng không đúng");
  });
});

describe("OrderRefundCard (kltn-docs 15 §4.5)", () => {
  it("shows what is refundable, refunded and still to come, with each refund made", async () => {
    backend(["payment-refunds:READ"], {
      [`/refunds/me/orders/${orderId}`]: () => ({
        orderId,
        currency: "VND",
        refundStatus: "PARTIALLY_REFUNDED",
        refundable: 300_000,
        refunded: 100_000,
        remaining: 200_000,
        records: [
          {
            refundRecordId: "r-1",
            amount: 100_000,
            currency: "VND",
            refundedOn: "2026-11-12",
            reference: "FT123",
          },
        ],
      }),
    });
    renderWithProviders(
      <OrderRefundCard order={order({ status: "CANCELLED", statusGroup: "CANCELLED" })} />,
    );
    expect(await screen.findByText("Còn chờ hoàn")).toBeInTheDocument();
    expect(screen.getByText("Còn chờ hoàn").nextElementSibling).toHaveTextContent(/200\.000/);
    expect(screen.getByText("FT123")).toBeInTheDocument();
  });

  it("shows an error with a retry instead of disappearing when the refund cannot be read", async () => {
    let calls = 0;
    backend(["payment-refunds:READ"], {
      [`/refunds/me/orders/${orderId}`]: () => {
        calls += 1;
        if (calls === 1) throw new ApiError(403, "FORBIDDEN", "no");
        return {
          orderId,
          currency: "VND",
          refundStatus: "PENDING",
          refundable: 300_000,
          refunded: 0,
          remaining: 300_000,
          records: [],
        };
      },
    });
    renderWithProviders(<OrderRefundCard order={order()} />);
    expect(await screen.findByText("Chưa tải được thông tin hoàn tiền")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Còn chờ hoàn")).toBeInTheDocument();
  });

  it("is absent when nothing is refundable (404 or zero)", async () => {
    backend(["payment-refunds:READ"], {});
    const { container } = renderWithProviders(<OrderRefundCard order={order()} />);
    await vi.waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(`/refunds/me/orders/${orderId}`, expect.anything()),
    );
    expect(container).toBeEmptyDOMElement();
  });
});
