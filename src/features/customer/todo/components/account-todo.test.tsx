import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { beInstallment } from "@/lib/installments/__tests__/fixtures";
import { installmentDtoSchema } from "@/lib/installments/schemas";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { installmentsToPay } from "../queries";
import { AccountTodo } from "./account-todo";

/** An installment still owing money (the shared fixture is a paid one). */
const owed = (over: Record<string, unknown>) =>
  beInstallment({ paidAmount: 0, outstanding: 152_100, paidAt: undefined, ...over });

const ALL = ["sales-quotes:READ", "sales-orders:READ", "payment-installments:READ"];
const QUOTE_ID = "01a2043f-3d65-706a-9d7b-dcc7bff017d6";
const ORDER_ID = "18a05a36-cbcf-93d9-afb5-7b69d242383d";

const page = (items: unknown[], totalElements = items.length) => ({
  items,
  page: 0,
  size: 5,
  totalElements,
  totalPages: items.length ? 1 : 0,
  hasNext: false,
  hasPrevious: false,
});

type Answers = {
  quotes?: unknown;
  orders?: unknown;
  installments?: (status: unknown) => unknown;
};

function backend(permissions: string[], answers: Answers = {}) {
  return vi.spyOn(api, "get").mockImplementation(async (url, config) => {
    const params = (config?.params ?? {}) as Record<string, unknown>;
    if (url === "/identity/me/permissions") {
      return { data: { roles: ["CUSTOMER"], permissions, dataScope: "OWN" } };
    }
    if (url === "/quotes") return { data: answers.quotes ?? page([]) };
    if (url === "/orders/me") return { data: answers.orders ?? page([]) };
    if (url === "/installments/me") {
      return { data: answers.installments?.(params.status) ?? page([]) };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("AccountTodo — 'Việc cần làm' on the account home (SF-UX-39)", () => {
  it("links one quote to answer and one contract to sign straight to the document", async () => {
    const get = backend(ALL, {
      quotes: page([{ id: QUOTE_ID, quoteNumber: "QT-20261123-0001" }]),
      orders: page([{ orderId: ORDER_ID, orderNumber: "SO-20261120-900001" }]),
    });
    renderWithProviders(<AccountTodo />);

    expect(await screen.findByRole("link", { name: "1 báo giá chờ bạn phản hồi" })).toHaveAttribute(
      "href",
      `/account/quotes/${QUOTE_ID}`,
    );
    expect(screen.getByRole("link", { name: "1 hợp đồng chờ bạn ký" })).toHaveAttribute(
      "href",
      `/account/orders/${ORDER_ID}`,
    );
    expect(get).toHaveBeenCalledWith(
      "/quotes",
      expect.objectContaining({ params: expect.objectContaining({ status: "SENT" }) }),
    );
    expect(get).toHaveBeenCalledWith(
      "/orders/me",
      expect.objectContaining({ params: expect.objectContaining({ status: "PENDING_CONTRACT" }) }),
    );
  });

  it("sends several quotes to the list filtered to the ones waiting for an answer", async () => {
    backend(ALL, {
      quotes: page(
        [
          { id: QUOTE_ID, quoteNumber: "QT-1" },
          { id: ORDER_ID, quoteNumber: "QT-2" },
        ],
        3,
      ),
    });
    renderWithProviders(<AccountTodo />);
    expect(await screen.findByRole("link", { name: "3 báo giá chờ bạn phản hồi" })).toHaveAttribute(
      "href",
      "/account/quotes?status=SENT",
    );
  });

  it("counts the installments to pay now, overdue ones said apart, and links the payments page", async () => {
    backend(ALL, {
      installments: (status) =>
        status === "DUE"
          ? page([
              owed({ status: "DUE", overdue: true }),
              owed({ status: "DUE" }),
            ])
          : page([owed({ status: "PARTIALLY_PAID", overdue: false, reachedAt: null })]),
    });
    renderWithProviders(<AccountTodo />);
    expect(
      await screen.findByRole("link", { name: "2 đợt thanh toán đến hạn, 1 quá hạn" }),
    ).toHaveAttribute("href", "/account/payments");
  });

  it("says there is nothing to do when nothing waits", async () => {
    backend(ALL);
    renderWithProviders(<AccountTodo />);
    expect(await screen.findByText("Không có việc nào cần bạn làm lúc này.")).toBeInTheDocument();
  });

  it("reads nothing it may not read, and shows nothing without any of the permissions", async () => {
    const get = backend([]);
    const { container } = renderWithProviders(<AccountTodo />);
    await vi.waitFor(() =>
      expect(get).toHaveBeenCalledWith("/identity/me/permissions", expect.anything()),
    );
    expect(container).toBeEmptyDOMElement();
    expect(get).not.toHaveBeenCalledWith("/quotes", expect.anything());
    expect(get).not.toHaveBeenCalledWith("/orders/me", expect.anything());
  });
});

describe("installmentsToPay", () => {
  it("counts what the payments page counts: DUE, overdue, and partial ones past their milestone", () => {
    const row = (over: Record<string, unknown>) => installmentDtoSchema.parse(owed(over));
    expect(
      installmentsToPay([
        row({ status: "DUE", overdue: false }),
        row({ status: "PARTIALLY_PAID", overdue: true }),
        row({ status: "PARTIALLY_PAID", overdue: false, reachedAt: "2026-09-07T03:00:00Z" }),
        // Paid in part before its milestone: not owed yet.
        row({ status: "PARTIALLY_PAID", overdue: false, reachedAt: null }),
      ]),
    ).toEqual({ due: 3, overdue: 1 });
  });
});
