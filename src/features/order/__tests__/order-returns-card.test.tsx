import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { beReturn, RETURN_ID } from "@/lib/returns/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { OrderReturnsCard } from "../components/order-returns-card";
import { orderDtoSchema } from "../schemas";
import { beOrder, orderId } from "./fixtures";

const order = (over: Record<string, unknown> = {}) => orderDtoSchema.parse({ ...beOrder, ...over });
const listOf = (items: unknown[]) => ({
  items,
  page: 0,
  size: 100,
  totalElements: items.length,
  totalPages: 1,
  hasNext: false,
  hasPrevious: false,
});

function backend(permissions: string[]) {
  return vi.spyOn(api, "get").mockImplementation(async (url: string) => {
    if (url === "/identity/me/permissions")
      return { data: { roles: ["CUSTOMER"], permissions, dataScope: "OWN" } };
    if (url === "/returns/me") {
      const r = beReturn({ orderId });
      return { data: listOf([{ ...r, customerId: null, channel: "PORTAL" }]) };
    }
    if (url === `/returns/me/${RETURN_ID}`) return { data: beReturn({ orderId }) };
    throw new ApiError(404, "NOT_FOUND", url);
  });
}

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("OrderReturnsCard", () => {
  it("lists the order's returns with their status, each linking to its page", async () => {
    backend(["sales-rmas:READ"]);
    renderWithProviders(<OrderReturnsCard order={order({ deliveryState: "DELIVERED" })} />);
    const link = await screen.findByRole("link", { name: /RMA-20261110-0001/ });
    expect(link).toHaveAttribute("href", `/account/returns/${RETURN_ID}`);
    expect(screen.getByText("Chờ gửi hàng về")).toBeInTheDocument();
  });

  it("asks nothing before delivery or without sales-rmas:READ", async () => {
    const get = backend(["sales-orders:READ"]);
    renderWithProviders(<OrderReturnsCard order={order({ deliveryState: "DELIVERED" })} />);
    renderWithProviders(<OrderReturnsCard order={order({ deliveryState: "IN_TRANSIT" })} />);
    await vi.waitFor(() =>
      expect(get).toHaveBeenCalledWith("/identity/me/permissions", expect.anything()),
    );
    expect(get.mock.calls.some(([url]) => String(url).startsWith("/returns"))).toBe(false);
  });
});
