import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getCatalogPage, getCatalogProduct, getSearchSuggestions } from "@/features/catalog/api";
import { cancelMyOrder, getMyOrders, getOrder } from "@/features/order/api";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { activateMockAdapter } from "@/lib/api/mock-adapter";
import { getAvailability } from "@/lib/catalog/api";
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
  it("browses, checks stock, reads an order and cancels it", async () => {
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
    expect((await getSearchSuggestions("ly gi"))[0]?.slug).toBe("ly-giay-2-lop-8oz");
    await expect(getCatalogProduct("khong-ton-tai")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });

    // No checkout: orders are drawn up by Sales from an accepted quote (kltn-docs 14 BR-01). The
    // customer reads them and may cancel one not yet released.
    const confirmed = (await getMyOrders({ page: 1, size: 50 })).items.find(
      (order) => order.status === "CONFIRMED",
    )!;
    const detail = await getOrder(confirmed.orderId);
    expect(detail.orderNumber).toBe(confirmed.orderNumber);

    // Not yet released: cancelled at once.
    await expect(
      cancelMyOrder({ orderId: confirmed.orderId, reasonCode: "DUPLICATE_ORDER" }),
    ).resolves.toEqual({
      result: "CANCELLED",
    });
    expect((await getOrder(confirmed.orderId)).statusGroup).toBe("CANCELLED");
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
