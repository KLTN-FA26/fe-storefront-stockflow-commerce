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
  type MockCreditTerms,
  type MockOrderBook,
} from "@/lib/api/mock-fixtures/orders";
import { useCartStore } from "@/lib/store/use-cart-store";
import { fakeBackend } from "@/test/fake-backend";
import { renderWithProviders, resetCart, signIn, signOut } from "@/test/render";

import { CheckoutScreen } from "../components/checkout-screen";
import type { CheckoutCustomer } from "../checkout-types";

const CUSTOMER_ID = "c0ffee00-0000-4000-8000-000000000010";
const HOME = "6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60";
const OFFICE = "7a2d3b4c-5e6f-4a70-9b82-1c3d4e5f6a71";

let catalog: MockCatalog;
let book: MockOrderBook;

const customer = (over: Partial<CheckoutCustomer> = {}): CheckoutCustomer => ({
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
    {
      addressId: OFFICE,
      recipientName: "Trần Thu Hà",
      phone: "0912345678",
      summary: "45 Tràng Tiền, Hà Nội",
      isDefault: false,
    },
  ],
  ...over,
});

function setup(opts: { terms?: MockCreditTerms; noAddresses?: boolean } = {}) {
  catalog = createMockCatalog(seedMockCatalog());
  book = createMockOrderBook(CUSTOMER_ID, [], {
    catalog,
    shippingAddress: (id) => (id === HOME || id === OFFICE ? MOCK_SHIPPING_ADDRESS : undefined),
    defaultShippingAddressId: () => HOME,
    ...(opts.terms ? { terms: opts.terms } : {}),
  });
  fakeBackend({ catalog, orders: () => book });
}

const add = (sku: string, quantity: number, title = sku) =>
  useCartStore.getState().add({ sku, slug: sku.toLowerCase(), title }, quantity);
const placeButton = () => screen.findByRole("button", { name: "Đặt hàng" });
const orderPosts = () => vi.mocked(api.post).mock.calls.filter(([url]) => url === "/orders");

beforeEach(() => {
  resetCart();
  signIn();
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
  resetCart();
});

describe("CheckoutScreen", () => {
  it("shows the saved shipping addresses with the default chosen, the lines, and the total", async () => {
    setup();
    add("CUP-PAPER-8OZ-WHT", 5000, "Ly giấy 8oz");
    renderWithProviders(<CheckoutScreen customer={customer()} />);

    await placeButton();
    const group = screen.getByRole("radiogroup", { name: "Địa chỉ giao hàng" });
    expect(within(group).getByRole("radio", { name: /Nguyễn Hoài Nam/ })).toBeChecked();
    expect(within(group).getByRole("radio", { name: /Trần Thu Hà/ })).not.toBeChecked();
    expect(screen.getByText("Hàng đặt")).toBeInTheDocument();
    expect(await screen.findAllByText(/3\.600\.000/)).not.toHaveLength(0);
    expect(screen.getByText(/điều khoản đã thoả thuận với Sales/)).toBeInTheDocument();
  });

  it("places the order with the chosen address, the SKU's tier price and a request id, then shows the order", async () => {
    setup();
    add("CUP-PAPER-8OZ-WHT", 5000, "Ly giấy 8oz");
    renderWithProviders(<CheckoutScreen customer={customer()} />);
    await userEvent.click(await screen.findByRole("radio", { name: /Trần Thu Hà/ }));
    await userEvent.click(await placeButton());

    expect(await screen.findByRole("heading", { name: "Đã đặt hàng" })).toBeInTheDocument();
    const [, body] = orderPosts()[0]!;
    expect(body).toEqual({
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      customerId: CUSTOMER_ID,
      shippingAddressId: OFFICE,
      lines: [{ sku: "CUP-PAPER-8OZ-WHT", quantity: 5000, unitPrice: 720 }],
    });
    expect(screen.getByText(/SO-\d{8}-\d{6}/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem đơn hàng" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/account\/orders\/[0-9a-f-]{36}$/),
    );
    // The cart is spent, and the stock it held is gone from the catalogue.
    expect(useCartStore.getState().lines).toEqual([]);
    expect(catalog.stockOf("CUP-PAPER-8OZ-WHT")).toBe(120000 - 5000);
  });

  it("invalidates what the order changed: the order list and stock", async () => {
    setup();
    add("BOX-TAKEAWAY-M", 200);
    const { client } = renderWithProviders(<CheckoutScreen customer={customer()} />);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await userEvent.click(await placeButton());
    await screen.findByRole("heading", { name: "Đã đặt hàng" });

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(["orders"]);
    expect(keys).toContainEqual(["catalog-read", "availability"]);
  });

  it("tells a deposit customer the stock is held and money is expected", async () => {
    setup();
    add("BOX-TAKEAWAY-M", 200);
    renderWithProviders(<CheckoutScreen customer={customer()} />);
    await userEvent.click(await placeButton());
    expect(await screen.findByText(/Hàng đã được giữ cho bạn/)).toBeInTheDocument();
  });

  it("says a credit order over its limit is waiting for approval, as the BE answers 201 ON_HOLD", async () => {
    setup({
      terms: {
        defaultTerm: "CREDIT",
        allowed: ["CREDIT"],
        depositPercent: 30,
        creditLimit: 1000,
        creditTermDays: 30,
      },
    });
    add("BOX-TAKEAWAY-M", 200);
    renderWithProviders(<CheckoutScreen customer={customer()} />);
    await userEvent.click(await placeButton());

    expect(
      await screen.findByRole("heading", { name: "Đã nhận đơn, đang chờ duyệt công nợ" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/vượt hạn mức công nợ/)).toBeInTheDocument();
  });

  it("explains INSUFFICIENT_STOCK, keeps the cart, and re-reads stock", async () => {
    setup();
    add("CUP-PAPER-8OZ-KRAFT", 1000, "Ly kraft"); // only 3 in stock
    renderWithProviders(<CheckoutScreen customer={customer()} />);
    // The cart still thinks it can: LOW_STOCK is only an indicator, never a number.
    await userEvent.click(await placeButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Một số sản phẩm không đủ tồn kho");
    expect(alert).not.toHaveTextContent("Insufficient stock");
    expect(useCartStore.getState().lines).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Quay lại giỏ hàng" })).toHaveAttribute(
      "href",
      "/cart",
    );
    await waitFor(() => {
      const stockCalls = vi
        .mocked(api.get)
        .mock.calls.filter(([u]) => u === "/catalog/products/availability");
      expect(stockCalls.length).toBeGreaterThan(1);
    });
  });

  it("explains CHECKOUT_PRICE_CHANGED and re-reads prices when the list moved after the page loaded", async () => {
    setup();
    add("CUP-PAPER-8OZ-WHT", 1000, "Ly giấy 8oz");
    renderWithProviders(<CheckoutScreen customer={customer()} />);
    const button = await placeButton();
    await waitFor(() => expect(button).toBeEnabled());
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(409, "CHECKOUT_PRICE_CHANGED", "The selling price changed", undefined, "corr-5"),
    );
    await userEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Giá đã thay đổi.*Mã tra cứu: corr-5/,
    );
    await waitFor(() => {
      const priceCalls = vi
        .mocked(api.get)
        .mock.calls.filter(([u]) => u === "/catalog/products/prices");
      expect(priceCalls.length).toBeGreaterThan(1);
    });
  });

  it("keeps the same request id for a retry of the same order, and a new one once the order changed", async () => {
    setup();
    add("CUP-PAPER-8OZ-WHT", 1000, "Ly giấy 8oz");
    renderWithProviders(<CheckoutScreen customer={customer()} />);
    const button = await placeButton();
    await waitFor(() => expect(button).toBeEnabled());
    vi.mocked(api.post)
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ."))
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ."));

    await userEvent.click(button);
    await screen.findByRole("alert");
    await userEvent.click(button);
    await waitFor(() => expect(orderPosts()).toHaveLength(2));
    const [first, second] = orderPosts().map(
      ([, body]) => (body as { requestId: string }).requestId,
    );
    expect(second).toBe(first); // a retry after a timeout must not place a second order

    // A different order (another address) is a different request: the BE would otherwise answer
    // with the first order, whatever the new content says.
    await userEvent.click(screen.getByRole("radio", { name: /Trần Thu Hà/ }));
    await userEvent.click(screen.getByRole("button", { name: "Đặt hàng" }));
    await screen.findByRole("heading", { name: "Đã đặt hàng" });
    const third = (orderPosts()[2]?.[1] as { requestId: string }).requestId;
    expect(third).not.toBe(first);
  });

  it("locks the button while the order is being placed (no double submit)", async () => {
    setup();
    add("BOX-TAKEAWAY-M", 200);
    renderWithProviders(<CheckoutScreen customer={customer()} />);
    const button = await placeButton();
    await waitFor(() => expect(button).toBeEnabled());
    let release: (value: unknown) => void = () => undefined;
    vi.mocked(api.post).mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)) as never,
    );

    await userEvent.click(button);
    expect(await screen.findByRole("button", { name: "Đang đặt hàng..." })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Đang đặt hàng..." }));
    expect(orderPosts()).toHaveLength(1);
    release({
      data: {
        orderId: "0b7d3c1e-0000-4000-8000-00000000f001",
        orderNumber: "SO-1",
        status: "PENDING_PAYMENT",
        totalAmount: 1,
        currency: "VND",
      },
    });
    await screen.findByRole("heading", { name: "Đã đặt hàng" });
  });

  it("will not place an order from a cart the customer cannot buy, and says which line", async () => {
    setup();
    add("CUP-PET-500ML", 500, "Ly nhựa PET");
    renderWithProviders(<CheckoutScreen customer={customer()} />);

    expect(await screen.findByText(/Hết hàng\. Hãy xoá sản phẩm này/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đặt hàng" })).toBeDisabled();
    expect(orderPosts()).toHaveLength(0);
  });

  it("sends a customer with no shipping address to the address book", async () => {
    setup();
    add("BOX-TAKEAWAY-M", 200);
    renderWithProviders(<CheckoutScreen customer={customer({ addresses: [] })} />);

    expect(await screen.findByText("Bạn chưa có địa chỉ giao hàng.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Thêm địa chỉ giao hàng/ })).toHaveAttribute(
      "href",
      "/account/addresses",
    );
    expect(screen.getByRole("button", { name: "Đặt hàng" })).toBeDisabled();
  });

  it("explains an address book that failed to load and offers a retry", async () => {
    setup();
    add("BOX-TAKEAWAY-M", 200);
    const onRetry = vi.fn();
    renderWithProviders(
      <CheckoutScreen
        customer={customer({
          addresses: undefined,
          customerId: undefined,
          error: new ApiError(500, "INTERNAL_ERROR", "boom", undefined, "corr-3"),
          onRetry,
        })}
      />,
    );
    expect(await screen.findByText(/Mã tra cứu: corr-3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đặt hàng" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows an empty cart", async () => {
    setup();
    renderWithProviders(<CheckoutScreen customer={customer()} />);
    expect(await screen.findByText("Giỏ hàng trống")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem sản phẩm" })).toHaveAttribute("href", "/catalog");
  });

  it("asks a visitor to sign in", async () => {
    setup();
    signOut();
    add("BOX-TAKEAWAY-M", 200);
    renderWithProviders(<CheckoutScreen customer={customer()} />);
    expect(await screen.findByText("Đăng nhập để đặt hàng")).toBeInTheDocument();
  });

  it("offers no guest checkout anywhere", async () => {
    setup();
    add("BOX-TAKEAWAY-M", 200);
    renderWithProviders(<CheckoutScreen customer={customer()} />);
    await placeButton();
    expect(screen.queryByText(/khách vãng lai|guest|không cần đăng nhập/i)).not.toBeInTheDocument();
  });

  it("keeps the request id across a reload, so a retry after a timeout cannot place the order twice", async () => {
    setup();
    add("CUP-PAPER-8OZ-WHT", 1000, "Ly giấy 8oz");
    const first = renderWithProviders(<CheckoutScreen customer={customer()} />);
    const button = await placeButton();
    await waitFor(() => expect(button).toBeEnabled());
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "timeout"));
    await userEvent.click(button);
    await screen.findByRole("alert");
    first.unmount(); // the page is reloaded: new component, same sessionStorage

    renderWithProviders(<CheckoutScreen customer={customer()} />);
    const again = await placeButton();
    await waitFor(() => expect(again).toBeEnabled());
    await userEvent.click(again);
    await screen.findByRole("heading", { name: "Đã đặt hàng" });

    const ids = orderPosts().map(([, body]) => (body as { requestId: string }).requestId);
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
    // The order is placed: the same cart ordered next time is a new order with a new key.
    expect(sessionStorage.getItem("stockflow:storefront:checkout-request")).toBeNull();
  });

  it("never shows the empty cart between placing the order and showing it", async () => {
    setup();
    add("BOX-TAKEAWAY-M", 200);
    const { container } = renderWithProviders(<CheckoutScreen customer={customer()} />);
    const button = await placeButton();
    await waitFor(() => expect(button).toBeEnabled());

    const seen: boolean[] = [];
    const watcher = new MutationObserver(() =>
      seen.push(container.textContent?.includes("Giỏ hàng trống") ?? false),
    );
    watcher.observe(container, { childList: true, subtree: true, characterData: true });
    await userEvent.click(button);
    await screen.findByRole("heading", { name: "Đã đặt hàng" });
    watcher.disconnect();

    expect(seen).not.toContain(true);
    expect(useCartStore.getState().lines).toEqual([]);
  });
});
