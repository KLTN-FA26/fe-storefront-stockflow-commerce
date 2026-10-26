import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getCatalogPage, getCatalogProduct, getSearchSuggestions } from "@/features/catalog/api";
import { placeOrder } from "@/features/cart/checkout-api";
import { getMyCustomerId, listAddresses } from "@/features/customer/address/api";
import { cancelMyOrder, getMyOrders, getOrder } from "@/features/order/api";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { activateMockAdapter } from "@/lib/api/mock-adapter";
import { getAvailability, getPrices } from "@/lib/catalog/api";
import { NotCustomerError, signInCustomer } from "@/lib/auth/customer-session";
import { useAuthStore } from "@/lib/auth/auth-store";
import { MOCK_PASSWORD, MOCK_CUSTOMER_LOGIN } from "@/lib/api/mock-auth";

// The whole USE_MOCK=true path through the real adapter, route table and axios: what the screens
// get in `pnpm dev` with USE_MOCK=true. Latency is simulated, so this is one flow, not many tests.
const originalAdapter = api.defaults.adapter;

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(Math, "random").mockReturnValue(0.06); // no simulated 5% error, shortest latency
  activateMockAdapter();
});
afterAll(() => {
  vi.restoreAllMocks();
  if (originalAdapter) api.defaults.adapter = originalAdapter;
});

describe("mock adapter serves the storefront the way the BE does", () => {
  it("browses, prices, checks stock, orders, and cancels", async () => {
    // Catalogue: fixed-word routes win over /{slug}; a SKU list rides as repeated `sku` params.
    const page = await getCatalogPage({ page: 1, size: 12 });
    expect(page).toMatchObject({ page: 1, size: 12, hasNext: true });
    expect(page.items).toHaveLength(12);
    const product = await getCatalogProduct("ly-giay-2-lop-8oz");
    expect(product.variants.map((v) => v.sku)).toEqual([
      "CUP-PAPER-8OZ-WHT",
      "CUP-PAPER-8OZ-KRAFT",
    ]);
    expect(await getAvailability(["cup-paper-8oz-wht", "CUP-PAPER-8OZ-KRAFT"])).toEqual([
      { sku: "CUP-PAPER-8OZ-WHT", availability: "IN_STOCK" },
      { sku: "CUP-PAPER-8OZ-KRAFT", availability: "LOW_STOCK" },
    ]);
    const prices = await getPrices(["CUP-PAPER-8OZ-WHT", "CUP-CUSTOM-LOGO"]);
    expect(prices.map((p) => p.sku)).toEqual(["CUP-PAPER-8OZ-WHT"]);
    expect((await getSearchSuggestions("ly gi"))[0]?.slug).toBe("ly-giay-2-lop-8oz");
    await expect(getCatalogProduct("khong-ton-tai")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });

    // Checkout: the customer id and address come from the same mock customer.
    const customerId = await getMyCustomerId();
    const addresses = await listAddresses(customerId);
    const shipping = addresses.find((a) => a.type === "SHIPPING" && a.defaultAddress)!;
    const ordersBefore = (await getMyOrders({ page: 1, size: 1 })).totalElements;
    const placed = await placeOrder({
      requestId: crypto.randomUUID(),
      customerId,
      shippingAddressId: shipping.addressId,
      lines: [{ sku: "CUP-PAPER-8OZ-WHT", quantity: 1000, unitPrice: 780 }],
    });
    expect(placed).toMatchObject({ status: "PENDING_PAYMENT", totalAmount: 780000 });
    expect((await getMyOrders({ page: 1, size: 1 })).totalElements).toBe(ordersBefore + 1);
    const detail = await getOrder(placed.orderId);
    expect(detail).toMatchObject({ statusGroup: "AWAITING_PAYMENT", paymentTerm: "PREPAID" });
    expect(detail.shippingAddress?.recipientName).toBe(shipping.recipientName);

    // A refusal comes back as ApiError with the BE's code.
    await expect(
      placeOrder({
        requestId: crypto.randomUUID(),
        customerId,
        shippingAddressId: shipping.addressId,
        lines: [{ sku: "CUP-PAPER-8OZ-WHT", quantity: 1000, unitPrice: 1 }],
      }),
    ).rejects.toMatchObject({ status: 409, code: "CHECKOUT_PRICE_CHANGED" });

    // Not yet released: cancelled at once. The stock it held is back.
    await expect(
      cancelMyOrder({ orderId: placed.orderId, reasonCode: "DUPLICATE_ORDER" }),
    ).resolves.toEqual({
      result: "CANCELLED",
    });
    expect((await getOrder(placed.orderId)).statusGroup).toBe("CANCELLED");
    expect(await getAvailability(["CUP-PAPER-8OZ-WHT"])).toEqual([
      { sku: "CUP-PAPER-8OZ-WHT", availability: "IN_STOCK" },
    ]);
  }, 30_000);

  it("answers a cancellation past release with 202 REQUESTED, then 409 while it waits", async () => {
    const inProduction = (await getMyOrders({ page: 1, size: 20 })).items.find(
      (order) => order.status === "IN_PRODUCTION",
    )!;
    const first = await cancelMyOrder({
      orderId: inProduction.orderId,
      reasonCode: "CUSTOMER_REQUEST",
    });
    expect(first.result).toBe("REQUESTED");
    expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/);
    const second = await cancelMyOrder({ orderId: inProduction.orderId }).catch((e: unknown) => e);
    expect(second).toBeInstanceOf(ApiError);
    expect(second).toMatchObject({ status: 409, code: "ORDER_CANCELLATION_REQUEST_PENDING" });
    // The order itself is unchanged: the BE gives the customer no sign of the request.
    expect((await getOrder(inProduction.orderId)).status).toBe("IN_PRODUCTION");
  }, 30_000);

  it("signs a customer in through the mock BE, and turns a staff account away", async () => {
    await expect(
      signInCustomer({ username: MOCK_CUSTOMER_LOGIN.email, password: "wrong" }),
    ).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    await expect(
      signInCustomer({ username: MOCK_CUSTOMER_LOGIN.email, password: MOCK_PASSWORD }),
    ).resolves.toEqual({
      mustChangePassword: false,
    });
    expect(useAuthStore.getState().user).toMatchObject({
      customerId: "c0ffee00-0000-4000-8000-000000000010",
      fullName: MOCK_CUSTOMER_LOGIN.fullName,
    });
    useAuthStore.getState().logout();

    // Any e-mail of the legacy staff mock data signs in as staff.
    const staff = await api
      .get<unknown>("/staff-users")
      .then((r) => (r.data as { items: Array<{ email: string }> }).items[0]?.email);
    await expect(
      signInCustomer({ username: staff ?? "", password: MOCK_PASSWORD }),
    ).rejects.toBeInstanceOf(NotCustomerError);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  }, 30_000);
});
