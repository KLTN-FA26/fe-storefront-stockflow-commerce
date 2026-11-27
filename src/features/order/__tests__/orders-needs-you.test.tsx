import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { beInstallment } from "@/lib/installments/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { OrdersScreen } from "../components/orders-screen";
import { beCard, bePage } from "./fixtures";

const awaitingContract = {
  ...beCard,
  orderId: "0b7d3c1e-0000-4000-8000-000000000009",
  orderNumber: "SO-20261120-900001",
  status: "PENDING_CONTRACT",
  statusGroup: "AWAITING_CONTRACT",
};

function backend(orders: unknown[]) {
  return vi.spyOn(api, "get").mockImplementation(async (url: string) => {
    if (url === "/identity/me/permissions") {
      return {
        data: { roles: ["CUSTOMER"], permissions: ["payment-installments:READ"], dataScope: "OWN" },
      };
    }
    if (url === "/installments/me") {
      return {
        data: bePage({
          items: [
            beInstallment(),
            beInstallment({
              installmentId: "6c7d8e9f-0000-4000-8000-000000000002",
              seq: 2,
              status: "DUE",
              overdue: true,
              paidAmount: 0,
              outstanding: 354_900,
            }),
          ],
        }),
      };
    }
    if (url === "/orders/me")
      return { data: bePage({ items: orders, totalElements: orders.length }) };
    throw new Error(`No fake route for ${url}`);
  });
}

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("orders list — Cần xử lý (SF-UX-28)", () => {
  it("asks for the orders waiting on the customer and lists those with an overdue installment", async () => {
    const get = backend([awaitingContract]);
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    renderWithProviders(<OrdersScreen />, { onUrlUpdate });

    await screen.findByText(awaitingContract.orderNumber);
    // The tab counts what waits on the customer: the order to sign, and the other order whose
    // installment is overdue (UI/UX 27/11, sf-06).
    await user.click(await screen.findByRole("button", { name: "Cần xử lý (2)" }));

    expect(
      await screen.findByRole("button", { name: "Cần xử lý (2)", pressed: true }),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/orders/me",
      expect.objectContaining({
        params: { page: 0, size: 10, status: ["PENDING_CONTRACT", "PENDING_PAYMENT"] },
      }),
    );
    expect(screen.getByRole("button", { name: /^Cần xử lý/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(onUrlUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ queryString: "?xem=can-xu-ly" }),
    );
    const overdue = await screen.findByRole("region", { name: "Đơn có đợt thanh toán quá hạn" });
    expect(within(overdue).getByRole("link", { name: "Đơn SO-20260907-000431" })).toHaveAttribute(
      "href",
      "/account/orders/0b7d3c1e-0000-4000-8000-000000000001",
    );
  });

  it("says nothing needs the customer, apart from having no orders at all", async () => {
    vi.spyOn(api, "get").mockImplementation(async (url: string) => {
      if (url === "/identity/me/permissions") {
        return { data: { roles: ["CUSTOMER"], permissions: [], dataScope: "OWN" } };
      }
      return { data: bePage({ items: [], totalElements: 0, totalPages: 0 }) };
    });
    renderWithProviders(<OrdersScreen />, { searchParams: "?xem=can-xu-ly" });
    expect(await screen.findByText("Không có đơn nào cần bạn xử lý")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem tất cả đơn" })).toBeInTheDocument();
  });
});
