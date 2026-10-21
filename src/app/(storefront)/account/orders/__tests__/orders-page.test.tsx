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
    return settle(book.get(url.replace("/orders/me/", "")));
  });
  vi.spyOn(api, "post").mockImplementation(async (url, body) =>
    settle(book.cancel(url.split("/")[2] ?? "", body as Record<string, unknown> | undefined)),
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

  it("shows each card's line count and says what happens next", async () => {
    renderWithProviders(<OrdersScreen />);
    const pending = seeded("PENDING_PAYMENT");
    const card = (await screen.findByText(pending.orderNumber)).closest("article")!;

    expect(within(card).getByText(`${pending.lines.length} mặt hàng`)).toBeInTheDocument();
    expect(
      within(card).getByText("Đơn sẽ được xử lý ngay khi bạn thanh toán."),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: `Xem đơn ${pending.orderNumber}` }),
    ).toHaveAttribute("href", `/account/orders/${pending.orderId}`);
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
    const b2b = { ...seeded("CONFIRMED"), status: "SOMETHING_NEW" } as unknown as MockOrder;
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

  it("retries a server error twice, then shows the BE message, correlation id and a retry", async () => {
    const serverError = new ApiError(500, "INTERNAL", "Lỗi máy chủ", undefined, "corr-123");
    vi.mocked(api.get)
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError);
    renderWithProviders(<OrdersScreen />);

    expect(
      await screen.findByText(
        /Hệ thống đang gặp sự cố.*\(Mã tra cứu: corr-123\)/,
        {},
        { timeout: 6000 },
      ),
    ).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(3);
    await userEvent.click(screen.getByRole("button", { name: /Thử lại/ }));
    expect(await screen.findByText("Trang 1 / 3")).toBeInTheDocument();
  }, 15_000);

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
  it("shows lines, total and a cancel button for a CONFIRMED order", async () => {
    const confirmed = seeded("CONFIRMED");
    renderWithProviders(<OrderDetailScreen orderId={confirmed.orderId} />);

    expect(await screen.findByRole("heading", { name: "Chi tiết đơn hàng" })).toBeInTheDocument();
    expect(screen.getByText(confirmed.orderNumber)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Đã xác nhận" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Chuẩn bị");
    const lines = screen.getByRole("region", { name: /Sản phẩm/ });
    expect(within(lines).getByText(confirmed.lines[0]!.sku)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Huỷ đơn hàng ${confirmed.orderNumber}` }),
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
    const b2b = { ...seeded("CONFIRMED"), status: "SOMETHING_NEW" } as unknown as MockOrder;
    book = createMockOrderBook(CUSTOMER, [b2b]);
    renderWithProviders(<OrderDetailScreen orderId={b2b.orderId} />);

    expect(await screen.findByRole("heading", { name: "Đang xử lý" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Huỷ đơn hàng/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tiến trình đơn hàng" })).not.toBeInTheDocument();
    expect(screen.getByText(/Nếu bạn cần huỷ hoặc thay đổi đơn này/)).toBeInTheDocument();
  });

  it("explains why an order already with the warehouse or carrier cannot be cancelled", async () => {
    renderWithProviders(<OrderDetailScreen orderId={seeded("SHIPPED").orderId} />);
    expect(await screen.findByText(/nên không thể huỷ/)).toBeInTheDocument();
  });

  it("drops the stepper once an order leaves the happy path", async () => {
    renderWithProviders(<OrderDetailScreen orderId={seeded("CANCELLED").orderId} />);
    expect(await screen.findByRole("heading", { name: "Đã huỷ" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tiến trình đơn hàng" })).not.toBeInTheDocument();
  });

  it("cancels a CONFIRMED order after confirmation and shows it as cancelled", async () => {
    const confirmed = seeded("CONFIRMED");
    renderWithProviders(<OrderDetailScreen orderId={confirmed.orderId} />);

    await userEvent.click(
      await screen.findByRole("button", { name: `Huỷ đơn hàng ${confirmed.orderNumber}` }),
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
    const confirmed = seeded("CONFIRMED");
    renderWithProviders(<OrderDetailScreen orderId={confirmed.orderId} />);
    await userEvent.click(
      await screen.findByRole("button", { name: `Huỷ đơn hàng ${confirmed.orderNumber}` }),
    );

    // Warehouse ships it between page load and the click.
    const shipped = { ...confirmed, status: "SHIPPED" as const };
    book = createMockOrderBook(CUSTOMER, [shipped]);
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận huỷ" }));

    const dialog = screen.getByRole("dialog");
    expect(
      await within(dialog).findByText(/Đơn hàng đã sang bước không thể huỷ/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/cannot be cancelled|SHIPPED/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Quay lại" }));
    expect(await screen.findAllByText("Đang giao hàng")).not.toHaveLength(0);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Huỷ đơn hàng/ })).not.toBeInTheDocument(),
    );
  });

  it("explains a missing customer profile instead of claiming the order does not exist", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found"),
    );
    renderWithProviders(<OrderDetailScreen orderId={seeded("CONFIRMED").orderId} />);

    expect(await screen.findByText("Chưa có hồ sơ khách hàng")).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("keeps the detail skeleton while a paused fetch waits for the network", async () => {
    onlineManager.setOnline(false);
    renderWithProviders(<OrderDetailScreen orderId={seeded("CONFIRMED").orderId} />);

    expect(await screen.findByText("Đang chờ kết nối")).toBeInTheDocument();
    expect(screen.queryByText("Không tải được đơn hàng")).not.toBeInTheDocument();
  });

  it("counts order lines and units with distinct words", async () => {
    const confirmed = seeded("CONFIRMED");
    const units = confirmed.lines.reduce((sum, line) => sum + line.quantity, 0);
    renderWithProviders(<OrderDetailScreen orderId={confirmed.orderId} />);
    expect(
      await screen.findByText(`(${confirmed.lines.length} mặt hàng · ${units} sản phẩm)`),
    ).toBeInTheDocument();
  });

  it("shows where the order goes, from the shipping address only", async () => {
    const order = seeded("CONFIRMED");
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);

    const delivery = await screen.findByRole("region", { name: "Giao hàng" });
    expect(within(delivery).getByText(order.shippingAddress!.recipientName)).toBeInTheDocument();
    expect(within(delivery).queryByText(/Email nhận thông báo/)).not.toBeInTheDocument();
  });

  it("copies the order number for support", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    const confirmed = seeded("CONFIRMED");
    renderWithProviders(<OrderDetailScreen orderId={confirmed.orderId} />);

    await user.click(
      await screen.findByRole("button", { name: `Sao chép mã đơn ${confirmed.orderNumber}` }),
    );
    expect(writeText).toHaveBeenCalledWith(confirmed.orderNumber);
  });

  it("treats a malformed order id as not found without calling the BE", async () => {
    renderWithProviders(<OrderDetailScreen orderId="ORD-2026-0010" />);
    await waitFor(() => expect(notFound).toHaveBeenCalled());
    const orderCalls = vi.mocked(api.get).mock.calls.filter(([url]) => url.startsWith("/orders"));
    expect(orderCalls).toHaveLength(0);
  });

  it("refreshes after cancelling when the URL carries an upper-case UUID", async () => {
    const confirmed = seeded("CONFIRMED");
    renderWithProviders(<OrderDetailScreen orderId={confirmed.orderId.toUpperCase()} />);

    await userEvent.click(
      await screen.findByRole("button", { name: `Huỷ đơn hàng ${confirmed.orderNumber}` }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận huỷ" }));

    expect(await screen.findByRole("heading", { name: "Đã huỷ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Huỷ đơn hàng/ })).not.toBeInTheDocument();
  });

  it("does not offer cancelling when the account lacks sales-orders:UPDATE", async () => {
    permissions = MOCK_CUSTOMER_PERMISSIONS.filter((code) => code !== "sales-orders:UPDATE");
    renderWithProviders(<OrderDetailScreen orderId={seeded("CONFIRMED").orderId} />);

    expect(await screen.findByText(/hiện không thể tự huỷ đơn/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Huỷ đơn hàng/ })).not.toBeInTheDocument();
  });

  it("keeps offering cancel when the permission list cannot be loaded", async () => {
    const confirmed = seeded("CONFIRMED");
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      if (url === "/identity/me/permissions") throw new ApiError(500, "INTERNAL_ERROR", "boom");
      return real(url, config);
    });
    renderWithProviders(<OrderDetailScreen orderId={confirmed.orderId} />);

    expect(
      await screen.findByRole("button", { name: `Huỷ đơn hàng ${confirmed.orderNumber}` }),
    ).toBeInTheDocument();
  });

  it("re-reads permissions after a 403 so the cancel button goes away", async () => {
    const confirmed = seeded("CONFIRMED");
    renderWithProviders(<OrderDetailScreen orderId={confirmed.orderId} />);
    await userEvent.click(
      await screen.findByRole("button", { name: `Huỷ đơn hàng ${confirmed.orderNumber}` }),
    );

    // An admin took the permission away after the page loaded.
    permissions = MOCK_CUSTOMER_PERMISSIONS.filter((code) => code !== "sales-orders:UPDATE");
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(403, "FORBIDDEN", "Missing permission: sales-orders:UPDATE"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận huỷ" }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
      "không có quyền",
    );
    await userEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Huỷ đơn hàng/ })).not.toBeInTheDocument(),
    );
  });

  it("keeps a failed cancellation inside the dialog, so the customer can retry", async () => {
    const confirmed = seeded("CONFIRMED");
    renderWithProviders(<OrderDetailScreen orderId={confirmed.orderId} />);
    await userEvent.click(
      await screen.findByRole("button", { name: `Huỷ đơn hàng ${confirmed.orderNumber}` }),
    );
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ. Vui lòng kiểm tra mạng."),
    );
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận huỷ" }));

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Không kết nối được máy chủ. Vui lòng kiểm tra mạng.",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Xác nhận huỷ" }));
    expect(await screen.findByRole("heading", { name: "Đã huỷ" })).toBeInTheDocument();
  });

  it("treats another customer's order as not found", async () => {
    renderWithProviders(<OrderDetailScreen orderId={foreignMockOrderId()} />);
    await waitFor(() => expect(notFound).toHaveBeenCalled());
  });
});

describe("OrderDetailScreen: asking Sales to cancel (202)", () => {
  const request = () => screen.findByRole("button", { name: /Gửi yêu cầu huỷ đơn hàng/ });

  it.each(["IN_PRODUCTION", "READY_TO_FULFILL", "IN_FULFILMENT", "ON_HOLD"] as const)(
    "offers a request, not a cancellation, for %s",
    async (status) => {
      renderWithProviders(<OrderDetailScreen orderId={seeded(status).orderId} />);
      expect(await request()).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Huỷ đơn hàng/ })).not.toBeInTheDocument();
    },
  );

  it("sends the reason and note, then shows the request as waiting for Sales", async () => {
    const order = seeded("IN_PRODUCTION");
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);
    await userEvent.click(await request());

    const dialog = screen.getByRole("dialog", { name: "Gửi yêu cầu huỷ đơn" });
    expect(within(dialog).getByText(/Sales xem xét/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("radio", { name: "Tôi đặt trùng đơn" }));
    await userEvent.type(within(dialog).getByLabelText(/Ghi chú/), "Đã đặt lại ở đơn khác");
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu huỷ" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Đã gửi yêu cầu huỷ.");
    expect(status).toHaveTextContent("Đơn giữ nguyên trạng thái");
    expect(api.post).toHaveBeenCalledWith(`/orders/${order.orderId}/cancellation`, {
      reasonCode: "DUPLICATE_ORDER",
      note: "Đã đặt lại ở đơn khác",
    });
    expect(book.pendingCancellationOf(order.orderId)).toMatchObject({
      reasonCode: "DUPLICATE_ORDER",
      note: "Đã đặt lại ở đơn khác",
    });
    // The order itself did not change, and a second request is not offered.
    expect(screen.getByRole("heading", { name: "Đang sản xuất" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Gửi yêu cầu huỷ đơn hàng/ }),
    ).not.toBeInTheDocument();
  });

  it("asks for a note when the reason is 'other', before anything is sent", async () => {
    renderWithProviders(<OrderDetailScreen orderId={seeded("IN_FULFILMENT").orderId} />);
    await userEvent.click(await request());
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Lý do khác" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu huỷ" }));

    expect(await within(dialog).findByText(/Vui lòng nhập lý do khi chọn/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows a request already waiting from the order itself, and does not offer another", async () => {
    const order = seeded("ON_HOLD");
    // Asked earlier (another tab, an earlier visit): the order detail carries it.
    book.cancel(order.orderId, { reasonCode: "CUSTOMER_REQUEST" });
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);

    expect(await screen.findByText("Đã gửi yêu cầu huỷ.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Gửi yêu cầu huỷ đơn hàng/ }),
    ).not.toBeInTheDocument();
  });

  it("learns a request is already waiting from the BE's 409, and shows that state", async () => {
    const order = seeded("ON_HOLD");
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);
    await userEvent.click(await request());
    // Asked meanwhile (another tab): the BE knows, this open page does not.
    book.cancel(order.orderId, { reasonCode: "CUSTOMER_REQUEST" });
    await userEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu huỷ" }));

    expect(await screen.findByText("Đã gửi yêu cầu huỷ.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("says the BE refused when the order was packed meanwhile (409 ORDER_NOT_CANCELLABLE)", async () => {
    const order = seeded("IN_FULFILMENT");
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);
    await userEvent.click(await request());
    book = createMockOrderBook(CUSTOMER, [{ ...order, status: "SHIPPED" }]);
    await userEvent.click(screen.getByRole("button", { name: "Gửi yêu cầu huỷ" }));

    expect(
      await within(screen.getByRole("dialog")).findByText(/không thể huỷ\. Nếu cần trả hàng/),
    ).toBeInTheDocument();
  });
});

describe("OrderDetailScreen: what the BE reports about the order", () => {
  it("shows the timeline oldest first, one step per customer-facing status", async () => {
    const order = seeded("IN_FULFILMENT"); // READY_TO_FULFILL + IN_FULFILMENT are one step: Đang chuẩn bị hàng
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);

    const timeline = await screen.findByRole("region", { name: "Lịch sử đơn hàng" });
    const steps = within(timeline).getAllByRole("listitem");
    expect(steps.map((step) => step.querySelector("p")?.textContent)).toEqual([
      "Chờ thanh toán",
      "Đã xác nhận",
      "Đang chuẩn bị hàng",
    ]);
    expect(within(steps[0]!).getByText(/\d{4}/)).toBeInTheDocument();
  });

  it("gives the reason on the cancellation step, in words", async () => {
    const order = seedMockOrders(CUSTOMER).find(
      (o) =>
        o.customerId === CUSTOMER &&
        o.status === "CANCELLED" &&
        o.history.at(-1)?.reasonCode === "PAYMENT_NOT_RECEIVED",
    )!;
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);
    expect(
      await screen.findByText("Lý do: Chưa nhận được thanh toán đúng hạn"),
    ).toBeInTheDocument();
  });

  it("shows a deposit order's payment: term, deposit, what arrived and what is still due", async () => {
    const order = seedMockOrders(CUSTOMER).find(
      (o) => o.customerId === CUSTOMER && o.paymentTerm === "DEPOSIT" && o.status === "CONFIRMED",
    )!;
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);

    const payment = await screen.findByRole("region", { name: "Thanh toán" });
    expect(within(payment).getByText("Đặt cọc")).toBeInTheDocument();
    expect(within(payment).getByText("Đã thanh toán một phần")).toBeInTheDocument();
    expect(within(payment).getByText("Tiền cọc cần thanh toán")).toBeInTheDocument();
    expect(within(payment).getByText("Còn phải thanh toán")).toBeInTheDocument();
    expect(within(payment).queryByText("Hạn thanh toán")).not.toBeInTheDocument();
  });

  it("shows a credit order's days to pay instead of an amount due", async () => {
    const order = seedMockOrders(CUSTOMER).find(
      (o) => o.customerId === CUSTOMER && o.paymentTerm === "CREDIT",
    )!;
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);

    const payment = await screen.findByRole("region", { name: "Thanh toán" });
    expect(within(payment).getByText("Công nợ", { selector: "dd" })).toBeInTheDocument();
    expect(within(payment).getByText("30 ngày sau khi giao")).toBeInTheDocument();
    expect(within(payment).queryByText("Còn phải thanh toán")).not.toBeInTheDocument();
  });

  it("shows print progress for a printed line and nothing for stock goods", async () => {
    const order = seeded("IN_PRODUCTION");
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);

    const lines = await screen.findByRole("region", { name: /Sản phẩm/ });
    const printed = order.lines.find((line) => line.designSnapshotId)!;
    expect(within(lines).getByText("Đang sản xuất")).toBeInTheDocument();
    const bar = within(lines).getByRole("progressbar", { name: `Tiến độ sản xuất ${printed.sku}` });
    expect(bar).toHaveAttribute("aria-valuenow", String(Math.floor(printed.quantity / 2)));
    expect(bar).toHaveAttribute("aria-valuemax", String(printed.quantity));
    expect(within(lines).queryByText(/không cần sản xuất/)).not.toBeInTheDocument();
  });

  it("tells a customer why an ON_HOLD order waits, without the internal reason", async () => {
    const order = seeded("ON_HOLD");
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);
    expect(await screen.findByText("Đơn đang được chúng tôi xem xét.")).toBeInTheDocument();
  });

  it("shows where delivery stands, as recorded by staff", async () => {
    renderWithProviders(<OrderDetailScreen orderId={seeded("SHIPPED").orderId} />);
    const delivery = await screen.findByRole("region", { name: "Giao hàng" });
    expect(within(delivery).getByText("Đang trên đường giao")).toBeInTheDocument();
  });

  it("does not claim a cancelled order still has money to pay", async () => {
    const cancelled = seedMockOrders(CUSTOMER).find(
      (o) => o.customerId === CUSTOMER && o.status === "CANCELLED",
    )!;
    renderWithProviders(<OrderDetailScreen orderId={cancelled.orderId} />);
    const payment = await screen.findByRole("region", { name: "Thanh toán" });
    expect(within(payment).getByText("Chưa thanh toán")).toBeInTheDocument();
    expect(within(payment).queryByText("Còn phải thanh toán")).not.toBeInTheDocument();
  });
});

describe("OrderDetailScreen: asking Sales about an order on hold", () => {
  const held = (term: "PREPAID" | "CREDIT") =>
    seedMockOrders(CUSTOMER).find(
      (o) => o.customerId === CUSTOMER && o.status === "ON_HOLD" && o.paymentTerm === term,
    ) ?? { ...seeded("ON_HOLD"), paymentTerm: term };

  it("does not say an ON_HOLD order went to production or the warehouse: it never did", async () => {
    const order = held("PREPAID");
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);
    await userEvent.click(await screen.findByRole("button", { name: /Gửi yêu cầu huỷ đơn hàng/ }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/chưa được chuyển cho sản xuất hoặc kho/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Đơn đang được chúng tôi xem xét/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/phát sinh chi phí/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Đơn đã được chuyển cho sản xuất/)).not.toBeInTheDocument();
  });

  it("names the credit approval when that is what the order waits for", async () => {
    const order = held("CREDIT");
    book = createMockOrderBook(CUSTOMER, [order]);
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);
    await screen.findByRole("button", { name: /Gửi yêu cầu huỷ đơn hàng/ });
    const help = screen.getByRole("region", { name: "Cần hỗ trợ?" });
    expect(
      within(help).getByText(
        /Đơn đang chờ duyệt hạn mức công nợ, chưa chuyển cho sản xuất hoặc kho/,
      ),
    ).toBeInTheDocument();
  });

  it("keeps the production wording for an order that really is released", async () => {
    renderWithProviders(<OrderDetailScreen orderId={seeded("IN_PRODUCTION").orderId} />);
    await userEvent.click(await screen.findByRole("button", { name: /Gửi yêu cầu huỷ đơn hàng/ }));
    expect(
      within(screen.getByRole("dialog")).getByText(/Đơn đã được chuyển cho sản xuất hoặc kho/),
    ).toBeInTheDocument();
  });
});

describe("OrderDetailScreen: a cancellation request that is no longer waiting", () => {
  it("says an EXPIRED request was closed because the order moved on, in Vietnamese, never the system's English", async () => {
    const order = seeded("SHIPPED"); // the seed's shipped order carries a request closed by the system
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);

    const card = (await screen.findByRole("heading", { name: "Yêu cầu huỷ đơn" })).closest(
      "section",
    )!;
    expect(within(card).getByText("Đã đóng")).toBeInTheDocument();
    expect(card).toHaveTextContent(/trước khi Sales kịp quyết định/);
    expect(card).toHaveTextContent(/Tôi muốn đổi địa chỉ nhận hàng/);
    expect(card).toHaveTextContent(/Đóng lúc/);
    expect(document.body.textContent).not.toMatch(/Closed: the order is/);
    // Not "waiting": no pending alert, and an order this far cannot be asked about again.
    expect(screen.queryByText("Đã gửi yêu cầu huỷ.")).not.toBeInTheDocument();
  });

  it("shows a request Sales rejected with the answer they wrote, and lets the customer ask again", async () => {
    const order = seeded("IN_PRODUCTION");
    book.cancel(order.orderId, { reasonCode: "CUSTOMER_REQUEST" });
    book.closeCancellationRequest(order.orderId, "REJECTED", "Đơn đã in xong, không huỷ được.");
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);

    const card = (await screen.findByRole("heading", { name: "Yêu cầu huỷ đơn" })).closest(
      "section",
    )!;
    expect(within(card).getByText("Không được chấp nhận")).toBeInTheDocument();
    expect(card).toHaveTextContent("Phản hồi từ Sales: Đơn đã in xong, không huỷ được.");
    expect(
      await screen.findByRole("button", { name: /Gửi yêu cầu huỷ đơn hàng/ }),
    ).toBeInTheDocument();
  });

  it("shows an accepted request", async () => {
    const order = seeded("IN_PRODUCTION");
    book.cancel(order.orderId, { reasonCode: "CUSTOMER_REQUEST" });
    book.closeCancellationRequest(order.orderId, "APPROVED");
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);

    expect(await screen.findByText("Đã chấp nhận")).toBeInTheDocument();
  });

  it("shows a waiting request as waiting, not in the closed-request card", async () => {
    const order = seeded("IN_PRODUCTION");
    book.cancel(order.orderId, { reasonCode: "CUSTOMER_REQUEST" });
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);

    expect(await screen.findByText("Đã gửi yêu cầu huỷ.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Yêu cầu huỷ đơn" })).not.toBeInTheDocument();
  });

  it("is neutral about a request status newer than this FE", async () => {
    const order = seeded("IN_PRODUCTION");
    const real = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (url, config) => {
      const result = (await real(url, config)) as { data: Record<string, unknown> };
      return url.startsWith("/orders/me/")
        ? {
            data: {
              ...result.data,
              cancellationRequest: {
                status: "ESCALATED",
                requestedAt: "2026-10-20T08:00:00Z",
              },
            },
          }
        : result;
    });
    renderWithProviders(<OrderDetailScreen orderId={order.orderId} />);

    const card = (await screen.findByRole("heading", { name: "Yêu cầu huỷ đơn" })).closest(
      "section",
    )!;
    expect(within(card).getByText("Đang cập nhật")).toBeInTheDocument();
    expect(card).not.toHaveTextContent("ESCALATED");
  });
});
