import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { MyReceivables } from "./my-receivables";

const row = (over: Record<string, unknown> = {}) => ({
  receivableId: "7c1f6f0e-3c36-4e0e-9a43-2b0f0d6a1c11",
  orderId: "0b3f6f0e-3c36-4e0e-9a43-2b0f0d6a1c22",
  kind: "CREDIT_ORDER",
  amount: 1_000_000,
  paidAmount: 200_000,
  outstanding: 800_000,
  currency: "VND",
  dueDate: "2026-10-13",
  status: "OVERDUE",
  ...over,
});
const page = (items: unknown[], over: Record<string, unknown> = {}) => ({
  items,
  page: 0,
  size: 10,
  totalElements: items.length,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
  ...over,
});

let permissions: string[];
function backend(receivables: () => unknown) {
  vi.spyOn(api, "get").mockImplementation(async (url) => {
    if (url === "/identity/me/permissions") {
      return { data: { roles: ["CUSTOMER"], permissions, dataScope: "OWN" } };
    }
    if (url === "/receivables/me") return { data: receivables() };
    throw new ApiError(404, "NOT_FOUND", url);
  });
}
const receivableCalls = () =>
  vi.mocked(api.get).mock.calls.filter(([url]) => url === "/receivables/me");

beforeEach(() => {
  signIn();
  permissions = ["payment-receivables:READ"];
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("MyReceivables (account page)", () => {
  it("lists each receivable with its order link, amounts, due date and status, an overdue one highlighted", async () => {
    backend(() =>
      page([
        row(),
        row({
          receivableId: "8d2f6f0e-3c36-4e0e-9a43-2b0f0d6a1c33",
          orderId: "1c4f6f0e-3c36-4e0e-9a43-2b0f0d6a1c44",
          amount: 2_000_000,
          paidAmount: 0,
          outstanding: 2_000_000,
          dueDate: "2026-11-20",
          status: "OPEN",
        }),
      ]),
    );
    renderWithProviders(<MyReceivables />);

    expect(await screen.findByRole("heading", { name: "Công nợ của tôi" })).toBeInTheDocument();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);

    const overdue = items[0]!;
    expect(overdue).toHaveAttribute("data-overdue", "true");
    expect(within(overdue).getByText("Quá hạn")).toBeInTheDocument();
    expect(within(overdue).getByText("Số tiền").nextElementSibling).toHaveTextContent(
      /1\.000\.000/,
    );
    expect(within(overdue).getByText("Đã thanh toán").nextElementSibling).toHaveTextContent(
      /200\.000/,
    );
    expect(within(overdue).getByText("Còn phải trả").nextElementSibling).toHaveTextContent(
      /800\.000/,
    );
    expect(within(overdue).getByText("Hạn thanh toán").nextElementSibling).toHaveTextContent(/13/);
    expect(within(overdue).getByRole("link", { name: /Xem đơn hàng/ })).toHaveAttribute(
      "href",
      "/account/orders/0b3f6f0e-3c36-4e0e-9a43-2b0f0d6a1c22",
    );

    expect(items[1]).not.toHaveAttribute("data-overdue");
    expect(within(items[1]!).getByText("Chưa đến hạn")).toBeInTheDocument();
    expect(receivableCalls()[0]).toEqual([
      "/receivables/me",
      expect.objectContaining({ params: { page: 0, size: 10 } }),
    ]);
  });

  it("is not shown, and asks nothing, without the payment-receivables:READ permission", async () => {
    permissions = ["sales-orders:READ"];
    backend(() => page([row()]));
    const { container } = renderWithProviders(<MyReceivables />);

    await vi.waitFor(() =>
      expect(vi.mocked(api.get).mock.calls.some(([u]) => u === "/identity/me/permissions")).toBe(
        true,
      ),
    );
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(receivableCalls()).toHaveLength(0);
  });

  it("says so when there is nothing owed", async () => {
    backend(() => page([], { totalPages: 0 }));
    renderWithProviders(<MyReceivables />);
    expect(await screen.findByText("Bạn hiện không có khoản công nợ nào.")).toBeInTheDocument();
  });

  it("explains a failure and offers a retry", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url) => {
      if (url === "/identity/me/permissions") {
        return { data: { roles: [], permissions, dataScope: "OWN" } };
      }
      throw new ApiError(404, "CUSTOMER_NOT_FOUND", "x");
    });
    renderWithProviders(<MyReceivables />);
    expect(await screen.findByRole("button", { name: "Thử lại" })).toBeInTheDocument();
    expect(screen.getByText("Không tải được công nợ.")).toBeInTheDocument();
  });

  it("pages through the list with the BE's hasNext flag", async () => {
    backend(() => page([row()], { totalPages: 2, hasNext: true, totalElements: 11 }));
    renderWithProviders(<MyReceivables />);
    await screen.findAllByRole("listitem");
    await userEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    await vi.waitFor(() =>
      expect(receivableCalls().at(-1)?.[1]).toEqual(
        expect.objectContaining({ params: { page: 1, size: 10 } }),
      ),
    );
  });
});
