import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderDetailScreen } from "@/features/order/components/order-detail-screen";
import { OrdersScreen } from "@/features/order/components/orders-screen";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import {
  createMockOrderBook,
  foreignMockOrderId,
  seedMockOrders,
  type MockOrder,
  type MockOrderBook,
  type MockResult,
} from "@/lib/api/mock-fixtures/orders";
import { MOCK_CUSTOMER_PERMISSIONS } from "@/lib/api/mock-my-permissions";

const notFound = vi.fn();
vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const CUSTOMER = "CUS-0010";
let book: MockOrderBook;
let permissions: readonly string[];

/** Routes axios calls to the BE-shaped mock book, the way client.ts + the BE would answer. */
function settle(result: MockResult) {
  const body = result.data as Record<string, unknown>;
  if (result.status >= 400) {
    throw new ApiError(
      result.status,
      String(body.errorCode),
      String(body.message),
      undefined,
      String(body.correlationId),
    );
  }
  return { data: body.data };
}

function fakeBackend() {
  vi.spyOn(api, "get").mockImplementation(async (url, config) => {
    if (url === "/identity/me/permissions") {
      return { data: { roles: ["CUSTOMER"], permissions: [...permissions], dataScope: "OWN" } };
    }
    if (url === "/orders/me") return settle(book.page(config?.params as Record<string, unknown>));
    return settle(book.get(url.replace("/orders/", "")));
  });
  vi.spyOn(api, "post").mockImplementation(async (url) =>
    settle(book.cancel(url.split("/")[2] ?? "")),
  );
}

function renderWithProviders(
  ui: ReactNode,
  opts: { searchParams?: string; onUrlUpdate?: OnUrlUpdateFunction } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <NuqsTestingAdapter
        hasMemory
        searchParams={opts.searchParams ?? ""}
        {...(opts.onUrlUpdate ? { onUrlUpdate: opts.onUrlUpdate } : {})}
      >
        {ui}
      </NuqsTestingAdapter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

const seeded = (status: MockOrder["status"]) =>
  seedMockOrders(CUSTOMER).find((o) => o.customerId === CUSTOMER && o.status === status)!;

beforeEach(() => {
  book = createMockOrderBook(CUSTOMER, seedMockOrders(CUSTOMER));
  permissions = MOCK_CUSTOMER_PERMISSIONS;
  fakeBackend();
});
afterEach(() => {
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
  notFound.mockReset();
});

describe("OrdersScreen", () => {
  it("lists BE orders with a localized status, VND total and page info", async () => {
    renderWithProviders(<OrdersScreen />);

    expect(await screen.findByText("Trang 1 / 3")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getAllByText("Chờ thanh toán").length).toBeGreaterThan(0);
    expect(screen.queryByText("PENDING_PAYMENT")).not.toBeInTheDocument();
    expect(screen.getAllByText(/₫/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Trang trước" })).toBeDisabled();
  });

  it("previews each order by its first SKU and says what happens next", async () => {
    renderWithProviders(<OrdersScreen />);
    const pending = seeded("PENDING_PAYMENT");
    const card = (await screen.findByText(pending.orderNumber)).closest("article")!;

    expect(within(card).getByText(pending.lines[0]!.sku)).toBeInTheDocument();
    expect(
      within(card).getByText("Đơn sẽ được chuẩn bị ngay khi bạn thanh toán."),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: `Xem đơn ${pending.orderNumber}` }),
    ).toHaveAttribute("href", `/account/orders/${pending.orderId}`);
    const paid = seeded("PAID");
    const multi = (await screen.findByText(paid.orderNumber)).closest("article")!;
    expect(
      within(multi).getByText(`và ${paid.lines.length - 1} mặt hàng khác`),
    ).toBeInTheDocument();
  });

  it("moves to the next page through the URL and asks the BE for page 1 (0-based)", async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    renderWithProviders(<OrdersScreen />, { onUrlUpdate });

    await userEvent.click(await screen.findByRole("button", { name: "Trang sau" }));

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("page")).toBe("2");
    expect(await screen.findByText("Trang 2 / 3")).toBeInTheDocument();
    expect(api.get).toHaveBeenLastCalledWith(
      "/orders/me",
      expect.objectContaining({ params: { page: 1, size: 10 } }),
    );
  });

  it("brings an out-of-range ?page back to the last page", async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    renderWithProviders(<OrdersScreen />, { searchParams: "?page=9", onUrlUpdate });

    expect(await screen.findByText("Trang 3 / 3")).toBeInTheDocument();
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("page")).toBe("3");
  });

  it("never sends a negative page for ?page=0", async () => {
    renderWithProviders(<OrdersScreen />, { searchParams: "?page=0" });
    expect(await screen.findByText("Trang 1 / 3")).toBeInTheDocument();
    for (const [, config] of vi.mocked(api.get).mock.calls) {
      expect((config?.params as { page: number }).page).toBeGreaterThanOrEqual(0);
    }
  });

  it("waits for the network instead of claiming there are no orders when the fetch is paused", async () => {
    onlineManager.setOnline(false);
    renderWithProviders(<OrdersScreen />);

    expect(await screen.findByText("Đang chờ kết nối")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Đang tải danh sách đơn hàng" })).toBeInTheDocument();
    expect(screen.queryByText("Bạn chưa có đơn hàng nào")).not.toBeInTheDocument();

    onlineManager.setOnline(true);
    expect(await screen.findByText("Trang 1 / 3")).toBeInTheDocument();
  });

  it("offers the way back to page 1 when a later page fails to load", async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Missing permission"));
    renderWithProviders(<OrdersScreen />, { searchParams: "?page=2", onUrlUpdate });

    await userEvent.click(await screen.findByRole("button", { name: "Về trang đầu" }));
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("page")).toBeNull();
    expect(await screen.findByText("Trang 1 / 3")).toBeInTheDocument();
  });

  it("still lists the page when one order has a status newer than the FE", async () => {
    const b2b = { ...seeded("PAID"), status: "CONFIRMED" } as unknown as MockOrder;
    book = createMockOrderBook(CUSTOMER, [b2b, seeded("SHIPPED")]);
    renderWithProviders(<OrdersScreen />);

    const card = (await screen.findByText(b2b.orderNumber)).closest("article")!;
    expect(within(card).getByText("Đang xử lý")).toBeInTheDocument();
    expect(screen.getByText(seeded("SHIPPED").orderNumber)).toBeInTheDocument();
    expect(screen.queryByText(/không đúng định dạng/)).not.toBeInTheDocument();
  });

  it("shows the empty state when the customer has no orders", async () => {
    book = createMockOrderBook(CUSTOMER, []);
    renderWithProviders(<OrdersScreen />);
    expect(await screen.findByText("Bạn chưa có đơn hàng nào")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tiếp tục mua sắm" })).toBeInTheDocument();
  });

  it("explains a missing customer profile instead of offering a retry", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found"),
    );
    renderWithProviders(<OrdersScreen />);
    expect(await screen.findByText("Chưa có hồ sơ khách hàng")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thử lại/ })).not.toBeInTheDocument();
  });

  it(
    "retries a server error twice, then shows the BE message, correlation id and a retry",
    async () => {
      const serverError = new ApiError(500, "INTERNAL", "Lỗi máy chủ", undefined, "corr-123");
      vi.mocked(api.get)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError);
      renderWithProviders(<OrdersScreen />);

      expect(
        await screen.findByText(/Hệ thống đang gặp sự cố.*\(Mã tra cứu: corr-123\)/, {}, { timeout: 6000 }),
      ).toBeInTheDocument();
      expect(api.get).toHaveBeenCalledTimes(3);
      await userEvent.click(screen.getByRole("button", { name: /Thử lại/ }));
      expect(await screen.findByText("Trang 1 / 3")).toBeInTheDocument();
    },
    15_000,
  );

  it("reports a contract break once, without retrying or leaking zod issues", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { items: [{ status: "Shipped" }] } });
    renderWithProviders(<OrdersScreen />);
    expect(await screen.findByText(/Dữ liệu trả về không đúng định dạng/)).toBeInTheDocument();
    // The same response would break the contract again: no retry.
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("keeps the loaded list but says so when a background refetch fails", async () => {
    const { client } = renderWithProviders(<OrdersScreen />);
    expect(await screen.findByText("Trang 1 / 3")).toBeInTheDocument();

    vi.mocked(api.get).mockRejectedValue(
      new ApiError(503, "SERVICE_UNAVAILABLE", "Hệ thống đang bận", undefined, "corr-503"),
    );
    await client.refetchQueries(); // resolves once the two retries are spent

    const title = await screen.findByText("Chưa cập nhật được dữ liệu mới nhất");
    const stale = title.closest('[role="status"]');
    expect(stale).not.toBeNull();
    expect(stale).toHaveTextContent(/Hệ thống đang gặp sự cố.*\(Mã tra cứu: corr-503\)/);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  }, 15_000);
});

describe("OrderDetailScreen", () => {
  it("shows lines, total and a cancel button for a PAID order", async () => {
    const paid = seeded("PAID");
    renderWithProviders(<OrderDetailScreen orderId={paid.orderId} />);

    expect(await screen.findByRole("heading", { name: "Chi tiết đơn hàng" })).toBeInTheDocument();
    expect(screen.getByText(paid.orderNumber)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Đã thanh toán" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Chuẩn bị");
    const lines = screen.getByRole("region", { name: /Sản phẩm/ });
    expect(within(lines).getByText(paid.lines[0]!.sku)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Huỷ đơn hàng ${paid.orderNumber}` }),
    ).toBeInTheDocument();
  });

  it.each(["SHIPPED", "DELIVERED", "COMPLETED", "CANCELLED", "RETURNED"] as const)(
    "hides the cancel button for %s",
    async (status) => {
      const order = seeded(status);
      renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);
      expect(await screen.findByText(order.orderNumber)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Huỷ đơn hàng/ })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Chat với CSKH/ })).toBeInTheDocument();
    },
  );

  it("never offers cancelling an order whose status the FE does not know", async () => {
    const b2b = { ...seeded("PAID"), status: "IN_PRODUCTION" } as unknown as MockOrder;
    book = createMockOrderBook(CUSTOMER, [b2b]);
    renderWithProviders(<OrderDetailScreen orderId={b2b.orderId} />);

    expect(await screen.findByRole("heading", { name: "Đang xử lý" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Huỷ đơn hàng/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tiến trình đơn hàng" })).not.toBeInTheDocument();
    expect(screen.getByText(/Nếu bạn cần huỷ hoặc thay đổi đơn này/)).toBeInTheDocument();
  });

  it("explains why a shipped order cannot be cancelled", async () => {
    renderWithProviders(<OrderDetailScreen orderId={seeded("SHIPPED").orderId} />);
    expect(await screen.findByText(/Đơn đã rời kho nên không thể huỷ/)).toBeInTheDocument();
  });

  it("drops the stepper once an order leaves the happy path", async () => {
    renderWithProviders(<OrderDetailScreen orderId={seeded("CANCELLED").orderId} />);
    expect(await screen.findByRole("heading", { name: "Đã huỷ" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tiến trình đơn hàng" })).not.toBeInTheDocument();
  });

  it("cancels a PAID order after confirmation and shows it as cancelled", async () => {
    const paid = seeded("PAID");
    renderWithProviders(<OrderDetailScreen orderId={paid.orderId} />);

    await userEvent.click(
      await screen.findByRole("button", { name: `Huỷ đơn hàng ${paid.orderNumber}` }),
    );
    expect(
      screen.getByText(/không thể khôi phục\. Nếu bạn đã thanh toán, vui lòng liên hệ CSKH/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/hoàn tiền theo chính sách/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận huỷ" }));

    expect(await screen.findByText("Đơn đã bị huỷ và sẽ không được giao.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Huỷ đơn hàng/ })).not.toBeInTheDocument();
  });

  it("shows the BE 409 message and refetches the order that moved on", async () => {
    const paid = seeded("PAID");
    renderWithProviders(<OrderDetailScreen orderId={paid.orderId} />);
    await userEvent.click(
      await screen.findByRole("button", { name: `Huỷ đơn hàng ${paid.orderNumber}` }),
    );

    // Warehouse ships it between page load and the click.
    const shipped = { ...paid, status: "SHIPPED" as const };
    book = createMockOrderBook(CUSTOMER, [shipped]);
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận huỷ" }));

    expect(
      await screen.findByText(/Đơn hàng vừa chuyển sang trạng thái khác nên không thể huỷ nữa/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/cannot be cancelled|SHIPPED/)).not.toBeInTheDocument();
    expect(await screen.findAllByText("Đang giao hàng")).not.toHaveLength(0);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Huỷ đơn hàng/ })).not.toBeInTheDocument(),
    );
  });

  it("explains a missing customer profile instead of claiming the order does not exist", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found"),
    );
    renderWithProviders(<OrderDetailScreen orderId={seeded("PAID").orderId} />);

    expect(await screen.findByText("Chưa có hồ sơ khách hàng")).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("keeps the detail skeleton while a paused fetch waits for the network", async () => {
    onlineManager.setOnline(false);
    renderWithProviders(<OrderDetailScreen orderId={seeded("PAID").orderId} />);

    expect(await screen.findByText("Đang chờ kết nối")).toBeInTheDocument();
    expect(screen.queryByText("Không tải được đơn hàng")).not.toBeInTheDocument();
  });

  it("counts order lines and units with distinct words", async () => {
    const paid = seeded("PAID");
    const units = paid.lines.reduce((sum, line) => sum + line.quantity, 0);
    renderWithProviders(<OrderDetailScreen orderId={paid.orderId} />);
    expect(
      await screen.findByText(`(${paid.lines.length} mặt hàng · ${units} sản phẩm)`),
    ).toBeInTheDocument();
  });

  it.each([
    ["the same person", {}, false],
    ["the same number written +84 vs 0", { contactPhone: "0908111222" }, false],
    ["someone else", { contactName: "Nguyen Van Demo", contactPhone: "0901234567" }, true],
  ] as const)(
    "shows the ordering contact only when it differs from the recipient (%s)",
    async (_case, contact, shown) => {
      const paid = { ...seeded("PAID"), ...contact };
      book = createMockOrderBook(CUSTOMER, [paid]);
      renderWithProviders(<OrderDetailScreen orderId={paid.orderId} />);

      const delivery = await screen.findByRole("region", { name: "Giao đến" });
      expect(within(delivery).queryByText("Người đặt hàng") !== null).toBe(shown);
      if (shown) {
        expect(within(delivery).getByText("Nguyen Van Demo · 0901234567")).toBeInTheDocument();
      }
      expect(within(delivery).getByText(/Email nhận thông báo/)).toBeInTheDocument();
    },
  );

  it("copies the order number for support", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    const paid = seeded("PAID");
    renderWithProviders(<OrderDetailScreen orderId={paid.orderId} />);

    await user.click(
      await screen.findByRole("button", { name: `Sao chép mã đơn ${paid.orderNumber}` }),
    );
    expect(writeText).toHaveBeenCalledWith(paid.orderNumber);
  });

  it("treats a malformed order id as not found without calling the BE", async () => {
    renderWithProviders(<OrderDetailScreen orderId="ORD-2026-0010" />);
    await waitFor(() => expect(notFound).toHaveBeenCalled());
    const orderCalls = vi.mocked(api.get).mock.calls.filter(([url]) => url.startsWith("/orders"));
    expect(orderCalls).toHaveLength(0);
  });

  it("refreshes after cancelling when the URL carries an upper-case UUID", async () => {
    const paid = seeded("PAID");
    renderWithProviders(<OrderDetailScreen orderId={paid.orderId.toUpperCase()} />);

    await userEvent.click(
      await screen.findByRole("button", { name: `Huỷ đơn hàng ${paid.orderNumber}` }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận huỷ" }));

    expect(await screen.findByRole("heading", { name: "Đã huỷ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Huỷ đơn hàng/ })).not.toBeInTheDocument();
  });

  it("does not offer cancelling when the account lacks sales-orders:UPDATE", async () => {
    permissions = MOCK_CUSTOMER_PERMISSIONS.filter((code) => code !== "sales-orders:UPDATE");
    renderWithProviders(<OrderDetailScreen orderId={seeded("PAID").orderId} />);

    expect(await screen.findByText(/hiện không thể tự huỷ đơn/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Huỷ đơn hàng/ })).not.toBeInTheDocument();
  });

  it("keeps offering cancel when the permission list cannot be loaded", async () => {
    const paid = seeded("PAID");
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url === "/identity/me/permissions") throw new ApiError(500, "INTERNAL_ERROR", "boom");
      return real(url, config);
    });
    renderWithProviders(<OrderDetailScreen orderId={paid.orderId} />);

    expect(
      await screen.findByRole("button", { name: `Huỷ đơn hàng ${paid.orderNumber}` }),
    ).toBeInTheDocument();
  });

  it("re-reads permissions after a 403 so the cancel button goes away", async () => {
    const paid = seeded("PAID");
    renderWithProviders(<OrderDetailScreen orderId={paid.orderId} />);
    await userEvent.click(
      await screen.findByRole("button", { name: `Huỷ đơn hàng ${paid.orderNumber}` }),
    );

    // An admin took the permission away after the page loaded.
    permissions = MOCK_CUSTOMER_PERMISSIONS.filter((code) => code !== "sales-orders:UPDATE");
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(403, "FORBIDDEN", "Missing permission: sales-orders:UPDATE"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận huỷ" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("không có quyền");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Huỷ đơn hàng/ })).not.toBeInTheDocument(),
    );
  });

  it("shows a failed cancellation inside the help card, next to the cancel button", async () => {
    const paid = seeded("PAID");
    renderWithProviders(<OrderDetailScreen orderId={paid.orderId} />);
    await userEvent.click(
      await screen.findByRole("button", { name: `Huỷ đơn hàng ${paid.orderNumber}` }),
    );
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ. Vui lòng kiểm tra mạng."),
    );
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận huỷ" }));

    const help = screen.getByRole("region", { name: "Cần hỗ trợ?" });
    expect(await within(help).findByRole("alert")).toHaveTextContent(
      "Không kết nối được máy chủ. Vui lòng kiểm tra mạng.",
    );
    expect(
      within(help).getByRole("button", { name: `Huỷ đơn hàng ${paid.orderNumber}` }),
    ).toBeInTheDocument();
  });

  it("treats another customer's order as not found", async () => {
    renderWithProviders(<OrderDetailScreen orderId={foreignMockOrderId()} />);
    await waitFor(() => expect(notFound).toHaveBeenCalled());
  });
});
