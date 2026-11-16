import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { beInstallment } from "@/lib/installments/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { MyInstallments } from "./my-installments";

const page = (items: unknown[], over: Record<string, unknown> = {}) => ({
  items,
  page: 0,
  size: 10,
  totalElements: items.length,
  totalPages: items.length ? 1 : 0,
  hasNext: false,
  hasPrevious: false,
  ...over,
});

function backend(
  permissions: string[],
  installments: (params: Record<string, unknown>) => unknown = () => page([]),
) {
  return vi.spyOn(api, "get").mockImplementation(async (url, config) => {
    if (url === "/identity/me/permissions") {
      return { data: { roles: ["CUSTOMER"], permissions, dataScope: "OWN" } };
    }
    if (url === "/installments/me") {
      return { data: installments((config?.params ?? {}) as Record<string, unknown>) };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("MyInstallments (account page, kltn-docs 15 §4.3)", () => {
  it("lists the customer's installments with an overdue one highlighted", async () => {
    backend(["payment-installments:READ"], () =>
      page([
        beInstallment(),
        beInstallment({
          installmentId: "6c7d8e9f-0000-4000-8000-000000000002",
          seq: 2,
          name: "Thanh toán sau giao",
          milestone: "AFTER_DELIVERY",
          paidAmount: 0,
          outstanding: 354_900,
          amount: 354_900,
          status: "DUE",
          overdue: true,
          dueDate: "2026-10-01",
        }),
      ]),
    );
    renderWithProviders(<MyInstallments />);

    const list = await screen.findByRole("list", { name: "Các đợt thanh toán" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).getByText("Quá hạn")).toBeInTheDocument();
    expect(rows[1]).toHaveAttribute("data-overdue", "true");
    expect(within(rows[0]!).getByRole("link", { name: /Đơn SO-20260907-000431/ })).toHaveAttribute(
      "href",
      expect.stringContaining("0b7d3c1e-0000-4000-8000-000000000001"),
    );
  });

  it("filters by status in the URL and asks the BE for that status from page one", async () => {
    const get = backend(["payment-installments:READ"], () => page([beInstallment()]));
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    renderWithProviders(<MyInstallments />, { searchParams: "?dotTrang=1", onUrlUpdate });

    await screen.findByRole("list", { name: "Các đợt thanh toán" });
    await user.click(screen.getByRole("button", { name: "Đến hạn" }));

    await vi.waitFor(() =>
      expect(get).toHaveBeenCalledWith("/installments/me", {
        params: { page: 0, size: 10, status: "DUE" },
        signal: expect.anything(),
      }),
    );
    expect(screen.getByRole("button", { name: "Đến hạn" })).toHaveAttribute("aria-pressed", "true");
    expect(onUrlUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ queryString: expect.stringContaining("dotTT=DUE") }),
    );
  });

  it("says the schedule comes with a signed contract when there is none", async () => {
    backend(["payment-installments:READ"]);
    renderWithProviders(<MyInstallments />);
    expect(await screen.findByText(/khi hợp đồng mua bán được ký/)).toBeInTheDocument();
  });

  it("names the filter when it leaves nothing", async () => {
    backend(["payment-installments:READ"]);
    renderWithProviders(<MyInstallments />, { searchParams: "?dotTT=PAID" });
    expect(
      await screen.findByText("Không có đợt thanh toán nào ở trạng thái “Đã thanh toán”."),
    ).toBeInTheDocument();
  });

  it("shows and asks nothing without payment-installments:READ", async () => {
    const get = backend(["sales-orders:READ"]);
    const { container } = renderWithProviders(<MyInstallments />);
    await vi.waitFor(() =>
      expect(get).toHaveBeenCalledWith("/identity/me/permissions", expect.anything()),
    );
    expect(get).not.toHaveBeenCalledWith("/installments/me", expect.anything());
    expect(container).toBeEmptyDOMElement();
  });
});
