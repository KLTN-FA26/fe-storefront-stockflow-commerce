import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import {
  createMockCatalog,
  seedMockCatalog,
  type MockCatalog,
} from "@/lib/api/mock-fixtures/catalog";
import {
  createMockOrderBook,
  MOCK_SHIPPING_ADDRESS,
  type MockOrderBook,
} from "@/lib/api/mock-fixtures/orders";
import { useCartStore } from "@/lib/store/use-cart-store";
import { fakeBackend } from "@/test/fake-backend";
import { renderWithProviders, resetCart, signIn, signOut } from "@/test/render";

import { readDuplicateOrder } from "../checkout-errors";
import { CheckoutScreen } from "../components/checkout-screen";
import type { CheckoutCustomer } from "../checkout-types";

const CUSTOMER_ID = "c0ffee00-0000-4000-8000-000000000010";
const HOME = "6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60";

let catalog: MockCatalog;
let book: MockOrderBook;

const customer: CheckoutCustomer = {
  customerId: CUSTOMER_ID,
  isLoading: false,
  error: undefined,
  onRetry: vi.fn(),
  addresses: [
    {
      addressId: HOME,
      recipientName: "Nguyễn Hoài Nam",
      phone: "0908111222",
      summary: "12 Nguyễn Huệ, Quận 1",
      isDefault: true,
    },
  ],
};

/** An order of the same customer with these lines already on the book, as if placed a moment ago. */
function earlierOrder(lines: Array<{ sku: string; quantity: number }>) {
  const placed = book.place({
    requestId: crypto.randomUUID(),
    customerId: CUSTOMER_ID,
    shippingAddressId: HOME,
    lines: lines.map((l) => {
      const priced = catalog.checkoutPrice(l.sku, l.quantity);
      return { ...l, unitPrice: "price" in priced ? priced.price : 0 };
    }),
  });
  const body = placed.data as { data?: { orderId: string; orderNumber: string } };
  if (!body.data) throw new Error(`the earlier order was refused: ${JSON.stringify(placed.data)}`);
  return { orderId: body.data.orderId, orderNumber: body.data.orderNumber };
}

const add = (sku: string, quantity: number) =>
  useCartStore.getState().add({ sku, slug: sku.toLowerCase(), title: sku }, quantity);
const placeButton = () => screen.findByRole("button", { name: "Đặt hàng" });
const orderPosts = () => vi.mocked(api.post).mock.calls.filter(([url]) => url === "/orders");

beforeEach(() => {
  resetCart();
  signIn();
  sessionStorage.clear();
  catalog = createMockCatalog(seedMockCatalog());
  book = createMockOrderBook(CUSTOMER_ID, [], {
    catalog,
    shippingAddress: (id) => (id === HOME ? MOCK_SHIPPING_ADDRESS : undefined),
    defaultShippingAddressId: () => HOME,
  });
  fakeBackend({ catalog, orders: () => book });
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
  resetCart();
});

describe("CheckoutScreen: the same order again (SCRUM-190, 409 DUPLICATE_ORDER_SUSPECTED)", () => {
  it("asks first, naming the earlier order, and creates nothing", async () => {
    const earlier = earlierOrder([{ sku: "BOX-TAKEAWAY-M", quantity: 200 }]);
    add("BOX-TAKEAWAY-M", 200);
    renderWithProviders(<CheckoutScreen customer={customer} />);
    await userEvent.click(await placeButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Đơn này có thể bị trùng");
    expect(alert).toHaveTextContent(earlier.orderNumber);
    expect(alert).toHaveTextContent("cùng sản phẩm và số lượng");
    expect(within(alert).getByRole("link", { name: "Xem đơn trước" })).toHaveAttribute(
      "href",
      `/account/orders/${earlier.orderId}`,
    );
    // Not an error banner, the cart is intact and no second order exists.
    expect(screen.queryByText("Không đặt được hàng.")).not.toBeInTheDocument();
    expect(useCartStore.getState().lines).toHaveLength(1);
    expect(book.page({ size: 50 }).data).toMatchObject({ data: { totalElements: 1 } });
  });

  it("'Vẫn đặt đơn' resends the same request with confirmDuplicate and places the order", async () => {
    earlierOrder([{ sku: "BOX-TAKEAWAY-M", quantity: 200 }]);
    add("BOX-TAKEAWAY-M", 200);
    renderWithProviders(<CheckoutScreen customer={customer} />);
    await userEvent.click(await placeButton());
    await userEvent.click(await screen.findByRole("button", { name: "Vẫn đặt đơn" }));

    expect(await screen.findByRole("heading", { name: "Đã đặt hàng" })).toBeInTheDocument();
    const [first, second] = orderPosts().map(([, body]) => body as Record<string, unknown>);
    expect(first).not.toHaveProperty("confirmDuplicate");
    expect(second).toMatchObject({ confirmDuplicate: true });
    // The same content keeps the same idempotency key: a retry cannot place two.
    expect(second?.requestId).toBe(first?.requestId);
    expect(useCartStore.getState().lines).toEqual([]);
  });

  it("does not ask when the lines differ from the earlier order", async () => {
    earlierOrder([{ sku: "BOX-TAKEAWAY-M", quantity: 300 }]);
    add("BOX-TAKEAWAY-M", 200);
    renderWithProviders(<CheckoutScreen customer={customer} />);
    await userEvent.click(await placeButton());

    expect(await screen.findByRole("heading", { name: "Đã đặt hàng" })).toBeInTheDocument();
    expect(orderPosts()).toHaveLength(1);
  });

  it("still asks when the BE sends no details, just without naming an order", async () => {
    add("BOX-TAKEAWAY-M", 200);
    renderWithProviders(<CheckoutScreen customer={customer} />);
    const button = await placeButton();
    await waitFor(() => expect(button).toBeEnabled());
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(409, "DUPLICATE_ORDER_SUSPECTED", "English developer text"),
    );
    await userEvent.click(button);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Bạn vừa đặt một đơn có cùng sản phẩm và số lượng");
    expect(alert).not.toHaveTextContent("English developer text");
    expect(within(alert).getByRole("link", { name: "Xem đơn trước" })).toHaveAttribute(
      "href",
      "/account/orders",
    );
    expect(within(alert).getByRole("button", { name: "Vẫn đặt đơn" })).toBeEnabled();
  });
});

describe("readDuplicateOrder", () => {
  it("reads the earlier order from the BE details", () => {
    const details = { orderId: "o-1", orderNumber: "SO-1", placedAt: "2026-10-28T04:00:00Z" };
    expect(
      readDuplicateOrder(
        new ApiError(409, "DUPLICATE_ORDER_SUSPECTED", "x", undefined, "c", details),
      ),
    ).toEqual(details);
  });

  it("tolerates missing or malformed details", () => {
    expect(readDuplicateOrder(new ApiError(409, "DUPLICATE_ORDER_SUSPECTED", "x"))).toEqual({});
    expect(
      readDuplicateOrder(
        new ApiError(409, "DUPLICATE_ORDER_SUSPECTED", "x", undefined, undefined, {
          orderId: 5,
        }),
      ),
    ).toEqual({});
  });

  it("is undefined for any other failure", () => {
    expect(readDuplicateOrder(new ApiError(409, "INSUFFICIENT_STOCK", "x"))).toBeUndefined();
    expect(readDuplicateOrder(new Error("boom"))).toBeUndefined();
    expect(readDuplicateOrder(undefined)).toBeUndefined();
  });
});
