import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { beInstallment } from "@/lib/installments/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { paymentRows, paymentsTotals } from "../filters";
import { PAYMENTS_POLL_MS } from "../live";
import { PaymentsScreen } from "./payments-screen";

const id = (n: number) => `6c7d8e9f-0000-4000-8000-00000000000${n}`;
const paid = beInstallment({ installmentId: id(1), seq: 1 });
const notDue = beInstallment({
  installmentId: id(2),
  seq: 2,
  name: "Trước giao",
  status: "NOT_DUE",
  paidAmount: 0,
  outstanding: 200_000,
  dueDate: undefined,
});
const due = beInstallment({
  installmentId: id(3),
  seq: 3,
  name: "Sau giao đợt 1",
  status: "DUE",
  paidAmount: 0,
  outstanding: 300_000,
  dueDate: "2099-12-01",
});
const overdue = beInstallment({
  installmentId: id(4),
  seq: 4,
  name: "Sau giao đợt 2",
  status: "PARTIALLY_PAID",
  overdue: true,
  paidAmount: 100_000,
  outstanding: 254_900,
  dueDate: "2026-10-01",
});

function backend(permissions = ["payment-installments:READ"]) {
  return vi.spyOn(api, "get").mockImplementation(async (url: string) => {
    if (url === "/identity/me/permissions") {
      return { data: { roles: ["CUSTOMER"], permissions, dataScope: "OWN" } };
    }
    if (url === "/installments/me") {
      const items = [paid, notDue, due, overdue];
      return {
        data: {
          items,
          page: 0,
          size: 200,
          totalElements: items.length,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      };
    }
    if (url.endsWith("/transfer-instructions")) {
      return {
        data: {
          installmentId: id(4),
          contractNumber: "HD-20261108-000007-1",
          orderNumber: "SO-20260907-000431",
          seq: 4,
          name: "Sau giao đợt 2",
          bankName: "Vietcombank",
          accountNumber: "0071000888999",
          accountName: "CONG TY TNHH STOCKFLOW",
          amountDue: 254_900,
          currency: "VND",
          reference: "HD-20261108-000007-1 DOT4",
        },
      };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("PaymentsScreen (SF-UX-39)", () => {
  it("lists what is due now with the overdue one first, and opens its transfer in place", async () => {
    const get = backend();
    const user = userEvent.setup();
    renderWithProviders(<PaymentsScreen />);

    const list = await screen.findByRole("list", { name: "Các đợt thanh toán" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Quá hạn");
    expect(rows[1]).toHaveTextContent("Đến hạn");
    expect(get).toHaveBeenCalledWith(
      "/installments/me",
      expect.objectContaining({ params: { page: 0, size: 200 } }),
    );

    await user.click(within(rows[0]!).getByRole("button", { name: /^Xem thông tin chuyển khoản/ }));
    expect(await within(rows[0]!).findByText("HD-20261108-000007-1 DOT4")).toBeInTheDocument();
  });

  it("filters to the overdue ones, counting each filter", async () => {
    backend();
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    renderWithProviders(<PaymentsScreen />, { onUrlUpdate });

    await user.click(await screen.findByRole("button", { name: "Quá hạn (1)" }));
    const rows = within(screen.getByRole("list", { name: "Các đợt thanh toán" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(1);
    expect(onUrlUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ queryString: "?loc=qua-han" }),
    );
    // A paid installment has nothing to transfer.
    await user.click(screen.getByRole("button", { name: "Đã thanh toán (1)" }));
    expect(
      screen.queryByRole("button", { name: /thông tin chuyển khoản/ }),
    ).not.toBeInTheDocument();
  });

  it("sums what is due now and what is overdue at the top", async () => {
    backend();
    renderWithProviders(<PaymentsScreen />);

    const summary = await screen.findByLabelText("Tổng cần thanh toán");
    // Due now: the DUE one (300.000) and the overdue one (254.900); the NOT_DUE and PAID ones are not.
    expect(within(summary).getByText("Cần thanh toán ngay").nextElementSibling).toHaveTextContent(
      /554\.900/,
    );
    expect(within(summary).getByText("Quá hạn").nextElementSibling).toHaveTextContent(/254\.900/);
    expect(
      within(summary).getByText("2 đợt, gồm cả đợt thanh toán khi ký hợp đồng"),
    ).toBeInTheDocument();
  });

  it("asks again every few seconds while money is due, so a transfer shows without a reload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const get = backend();
      renderWithProviders(<PaymentsScreen />);
      await screen.findByLabelText("Tổng cần thanh toán");
      const reads = () => get.mock.calls.filter(([url]) => url === "/installments/me").length;
      const before = reads();
      await vi.advanceTimersByTimeAsync(PAYMENTS_POLL_MS + 100);
      expect(reads()).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says so when the account cannot read installments", async () => {
    backend([]);
    renderWithProviders(<PaymentsScreen />);
    expect(await screen.findByText("Tài khoản chưa xem được lịch thanh toán.")).toBeInTheDocument();
  });
});

/** The BE fixtures with their status narrowed, as the zod schema gives them to the page. */
const typed = (rows: ReturnType<typeof beInstallment>[]) =>
  rows.map((row) => ({
    ...row,
    status: row.status as "PAID" | "NOT_DUE" | "DUE" | "PARTIALLY_PAID",
    dueDate: row.dueDate ?? null,
  }));

describe("paymentsTotals", () => {
  it("counts on-signing and overdue installments as due now, and overdue apart", () => {
    const totals = paymentsTotals(typed([paid, notDue, due, overdue]));
    expect(totals.dueNow).toEqual({ amount: 554_900, count: 2 });
    expect(totals.overdue).toEqual({ amount: 254_900, count: 1 });
  });

  it("is zero when nothing is owed", () => {
    expect(paymentsTotals(typed([paid, notDue]))).toEqual({
      dueNow: { amount: 0, count: 0 },
      overdue: { amount: 0, count: 0 },
    });
  });
});

describe("paymentRows", () => {
  it("sorts overdue, due, not due, paid", () => {
    const rows = [paid, notDue, due, overdue].map((row) => ({
      ...row,
      status: row.status as "PAID" | "NOT_DUE" | "DUE" | "PARTIALLY_PAID",
      dueDate: row.dueDate ?? null,
    }));
    expect(paymentRows(rows, "tat-ca").map((row) => row.seq)).toEqual([4, 3, 2, 1]);
  });
});
