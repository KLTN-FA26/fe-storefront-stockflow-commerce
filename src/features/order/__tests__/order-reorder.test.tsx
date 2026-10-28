import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { useCartStore } from "@/lib/store/use-cart-store";
import { renderWithProviders, resetCart, signIn, signOut } from "@/test/render";

import { OrderReorder } from "../components/order-reorder";
import { orderDtoSchema } from "../schemas";
import { beOrder } from "./fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));

const DESIGN = "9c0d1e2f-0000-4000-8000-000000000002";
const stockLine = (n: number, over: Record<string, unknown> = {}) => ({
  lineId: `1a2b3c4d-0000-4000-8000-00000000010${n}`,
  sku: `CUP-${n}`,
  quantity: 1000 * n,
  unitPrice: 700,
  lineTotal: 700_000 * n,
  productSlug: `ly-${n}`,
  productTitle: `Ly giấy ${n}`,
  ...over,
});
const gone = { productSlug: null, productTitle: null, productImageUrl: null };
const orderOf = (lines: Array<Record<string, unknown>>, reorder = false) =>
  orderDtoSchema.parse({
    ...beOrder,
    lines,
    allowedActions: { cancel: false, requestCancellation: false, reorder },
  });
const inCart = () => useCartStore.getState().lines.map((l) => [l.sku, l.quantity]);
const reorderButton = () => screen.getByRole("button", { name: /^Đặt lại đơn hàng/ });

beforeEach(() => {
  resetCart();
  signIn();
  push.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
  resetCart();
});

describe("OrderReorder: an order bought at the price list", () => {
  it("fills an empty basket and goes to the cart, with no price carried over", async () => {
    renderWithProviders(<OrderReorder order={orderOf([stockLine(1), stockLine(2)])} />);
    await userEvent.click(reorderButton());

    expect(inCart()).toEqual([
      ["CUP-1", 1000],
      ["CUP-2", 2000],
    ]);
    expect(push).toHaveBeenCalledWith("/cart");
    expect(useCartStore.getState().lines[0]).toMatchObject({ slug: "ly-1", title: "Ly giấy 1" });
    expect(useCartStore.getState().lines[0]).not.toHaveProperty("unitPrice");
  });

  it("asks in the page, not with window.confirm, when the basket already has items: merge", async () => {
    const confirm = vi.spyOn(window, "confirm");
    useCartStore.getState().add({ sku: "CUP-1", slug: "ly-1", title: "Ly giấy 1" }, 500);
    useCartStore.getState().add({ sku: "BOX-9", slug: "box-9", title: "Hộp 9" }, 20);
    renderWithProviders(<OrderReorder order={orderOf([stockLine(1), stockLine(2)])} />);
    await userEvent.click(reorderButton());

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Giỏ hàng của bạn đang có 2 sản phẩm/)).toBeInTheDocument();
    expect(inCart()).toEqual([
      ["CUP-1", 500],
      ["BOX-9", 20],
    ]); // nothing yet
    await userEvent.click(within(dialog).getByRole("button", { name: "Gộp vào giỏ hiện có" }));

    expect(inCart()).toEqual([
      ["CUP-1", 1500],
      ["BOX-9", 20],
      ["CUP-2", 2000],
    ]);
    expect(push).toHaveBeenCalledWith("/cart");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("replaces the basket when the customer says so", async () => {
    useCartStore.getState().add({ sku: "BOX-9", slug: "box-9", title: "Hộp 9" }, 20);
    renderWithProviders(<OrderReorder order={orderOf([stockLine(1)])} />);
    await userEvent.click(reorderButton());
    await userEvent.click(await screen.findByRole("button", { name: "Thay thế giỏ hàng" }));

    expect(inCart()).toEqual([["CUP-1", 1000]]);
    expect(push).toHaveBeenCalledWith("/cart");
  });

  it("cancelling the question leaves the basket alone and does not navigate", async () => {
    useCartStore.getState().add({ sku: "BOX-9", slug: "box-9", title: "Hộp 9" }, 20);
    renderWithProviders(<OrderReorder order={orderOf([stockLine(1)])} />);
    await userEvent.click(reorderButton());
    await userEvent.click(await screen.findByRole("button", { name: "Huỷ" }));

    expect(inCart()).toEqual([["BOX-9", 20]]);
    expect(push).not.toHaveBeenCalled();
  });

  it("skips design lines and SKUs no longer on sale, names them, and stays on the page", async () => {
    renderWithProviders(
      <OrderReorder
        order={orderOf([
          stockLine(1),
          stockLine(2, { designSnapshotId: DESIGN, ...gone }),
          stockLine(3, gone),
        ])}
      />,
    );
    await userEvent.click(reorderButton());

    expect(inCart()).toEqual([["CUP-1", 1000]]);
    expect(push).not.toHaveBeenCalled(); // the notice has to be read first
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Đã thêm 1 sản phẩm vào giỏ hàng")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Sản phẩm in theo thiết kế cần Sale báo giá/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/CUP-2 × 2\.000/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Sản phẩm hiện không còn bán/)).toBeInTheDocument();
    expect(within(dialog).getByText(/CUP-3 × 3\.000/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Liên hệ Sale báo giá" })).toHaveAttribute(
      "href",
      "/chat",
    );
    expect(within(dialog).getByRole("link", { name: "Đến giỏ hàng" })).toHaveAttribute(
      "href",
      "/cart",
    );
  });

  it("changes nothing and says so when no line can be put back", async () => {
    useCartStore.getState().add({ sku: "BOX-9", slug: "box-9", title: "Hộp 9" }, 20);
    renderWithProviders(
      <OrderReorder order={orderOf([stockLine(1, { designSnapshotId: DESIGN, ...gone })])} />,
    );
    await userEvent.click(reorderButton());

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Không có sản phẩm nào để đặt lại")).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "Đến giỏ hàng" })).not.toBeInTheDocument();
    expect(inCart()).toEqual([["BOX-9", 20]]);
    expect(push).not.toHaveBeenCalled();
  });

  it("offers nothing when an older BE does not say where the SKUs are on sale", () => {
    renderWithProviders(
      <OrderReorder order={orderOf([stockLine(1, { productSlug: undefined })])} />,
    );
    expect(screen.queryByRole("button", { name: /Đặt lại/ })).not.toBeInTheDocument();
  });

  it("never calls the reorder endpoint: there is no quote to draft", async () => {
    const post = vi.spyOn(api, "post");
    renderWithProviders(<OrderReorder order={orderOf([stockLine(1)])} />);
    await userEvent.click(reorderButton());
    expect(post).not.toHaveBeenCalled();
  });
});

describe("OrderReorder: an order that came from a quote", () => {
  it("asks Sales for a new quote and says so, with the quote number", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: { quoteNumber: "QT-20261028-000007", status: "DRAFT" } });
    renderWithProviders(<OrderReorder order={orderOf([stockLine(1)], true)} />);
    await userEvent.click(reorderButton());

    const status = await screen.findByRole("status");
    expect(within(status).getByText("Đã gửi yêu cầu đặt lại")).toBeInTheDocument();
    expect(status).toHaveTextContent("Sale sẽ gửi báo giá mới");
    expect(status).toHaveTextContent("QT-20261028-000007");
    expect(post).toHaveBeenCalledWith(`/orders/${beOrder.orderId}/reorder`, {
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    // Nothing goes in the basket, and the button cannot send it twice.
    expect(inCart()).toEqual([]);
    expect(push).not.toHaveBeenCalled();
    expect(reorderButton()).toBeDisabled();
  });

  it("still confirms when the answer carries no quote number", async () => {
    vi.spyOn(api, "post").mockResolvedValue({ data: {} });
    renderWithProviders(<OrderReorder order={orderOf([stockLine(1)], true)} />);
    await userEvent.click(reorderButton());
    expect(await screen.findByText("Đã gửi yêu cầu đặt lại")).toBeInTheDocument();
  });

  it.each([
    ["ORDER_NOT_QUOTED", 409, /được đặt theo bảng giá/],
    ["NOT_FOUND", 404, /Không tìm thấy đơn hàng/],
    ["CUSTOMER_NOT_ACTIVE", 409, /chưa được kích hoạt/],
    ["RATE_LIMITED", 429, /quá nhanh/],
  ])("shows %s in Vietnamese, never the BE's English text", async (code, status, text) => {
    vi.spyOn(api, "post").mockRejectedValue(new ApiError(status, code, "English developer text"));
    renderWithProviders(<OrderReorder order={orderOf([stockLine(1)], true)} />);
    await userEvent.click(reorderButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(text);
    expect(alert).not.toHaveTextContent("English developer text");
    // The customer may try again.
    expect(reorderButton()).toBeEnabled();
  });

  it("keeps one request id across a retry so a second click returns the same draft", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "boom"))
      .mockResolvedValueOnce({ data: { quoteNumber: "QT-1" } });
    renderWithProviders(<OrderReorder order={orderOf([stockLine(1)], true)} />);
    await userEvent.click(reorderButton());
    await screen.findByRole("alert");
    await userEvent.click(reorderButton());
    await screen.findByText("Đã gửi yêu cầu đặt lại");

    const ids = post.mock.calls.map(([, body]) => (body as { requestId: string }).requestId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });
});
