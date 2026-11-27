import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installmentKeys, type Installment } from "@/lib/installments";

import { LIVE_PAYMENT_POLL_MS, useLivePayment } from "../live-payment";
import { orderKeys } from "../queries";
import { orderId } from "./fixtures";

const success = vi.fn();
vi.mock("@/components/shared/Toast", () => ({
  toast: { success: (...args: unknown[]) => success(...args) },
}));

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

function installment(
  status: Installment["status"],
  overrides: Partial<Installment> = {},
): Installment {
  return {
    installmentId: "0b7d3c1e-0000-4000-8000-0000000000a1",
    contractId: "0b7d3c1e-0000-4000-8000-0000000000c1",
    contractNumber: "HD-20261119-700051-1",
    orderId,
    orderNumber: "SO-20261119-700051",
    seq: 1,
    name: "Đặt cọc khi ký",
    milestone: "ON_SIGNING",
    amount: 9_447_840,
    paidAmount: status === "PAID" ? 9_447_840 : 0,
    outstanding: status === "PAID" ? 0 : 9_447_840,
    currency: "VND",
    status,
    overdue: false,
    ...overrides,
  } as Installment;
}

let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  success.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useLivePayment re-reads the order while money is due", () => {
  it("asks for the order and its installments every few seconds while watching", () => {
    const { invalidate, wrapper } = setup();
    renderHook(() => useLivePayment(orderId, true, [installment("DUE")]), { wrapper });

    vi.advanceTimersByTime(LIVE_PAYMENT_POLL_MS);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: orderKeys.detail(orderId) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: installmentKeys.ofOrder(orderId) });
  });

  it("asks nothing while nothing is due", () => {
    const { invalidate, wrapper } = setup();
    renderHook(() => useLivePayment(orderId, false, [installment("PAID")]), { wrapper });

    vi.advanceTimersByTime(LIVE_PAYMENT_POLL_MS * 3);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("asks nothing while the tab is hidden, and asks again when the customer comes back", () => {
    const { invalidate, wrapper } = setup();
    visibility = "hidden";
    renderHook(() => useLivePayment(orderId, true, [installment("DUE")]), { wrapper });

    vi.advanceTimersByTime(LIVE_PAYMENT_POLL_MS * 3);
    expect(invalidate).not.toHaveBeenCalled();

    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: orderKeys.detail(orderId) });
  });

  it("stops asking once nothing is due any more", () => {
    const { invalidate, wrapper } = setup();
    const { rerender } = renderHook(
      ({ watching }: { watching: boolean }) =>
        useLivePayment(orderId, watching, [installment("DUE")]),
      { wrapper, initialProps: { watching: true } },
    );
    rerender({ watching: false });
    invalidate.mockClear();

    vi.advanceTimersByTime(LIVE_PAYMENT_POLL_MS * 3);

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("useLivePayment says when the money arrived", () => {
  it("tells the customer when an installment seen unpaid turns paid", () => {
    const { wrapper } = setup();
    const { rerender } = renderHook(
      ({ list }: { list: Installment[] }) => useLivePayment(orderId, true, list),
      { wrapper, initialProps: { list: [installment("DUE")] } },
    );
    expect(success).not.toHaveBeenCalled();

    rerender({ list: [installment("PAID")] });

    expect(success).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledWith(expect.stringContaining("Đợt 1"), expect.any(String));
  });

  it("says nothing about installments already paid when the page opened", () => {
    const { wrapper } = setup();
    const { rerender } = renderHook(
      ({ list }: { list: Installment[] }) => useLivePayment(orderId, false, list),
      { wrapper, initialProps: { list: [installment("PAID")] } },
    );
    rerender({ list: [installment("PAID")] });

    expect(success).not.toHaveBeenCalled();
  });
});
