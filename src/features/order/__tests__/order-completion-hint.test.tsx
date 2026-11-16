import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { beOrderInstallments } from "@/lib/installments/__tests__/fixtures";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { OrderCompletionHint } from "../components/order-completion-hint";
import { orderDtoSchema } from "../schemas";
import { beOrder } from "./fixtures";

const delivered = (over: Record<string, unknown> = {}) =>
  orderDtoSchema.parse({
    ...beOrder,
    status: "DELIVERED",
    statusGroup: "DELIVERED",
    timeline: [
      ...beOrder.timeline,
      { status: "DELIVERED", statusGroup: "DELIVERED", occurredAt: "2026-11-01T10:00:00Z" },
    ],
    ...over,
  });

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("OrderCompletionHint (kltn-docs 17 §4.6 bước 21)", () => {
  it("states the last day to ask for a return and the installments still owing", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: beOrderInstallments() });
    renderWithProviders(
      <OrderCompletionHint order={delivered()} now={new Date("2026-11-03T00:00:00Z")} />,
    );
    const hint = await screen.findByRole("status");
    expect(hint).toHaveTextContent(/đến hết ngày 8 thg 11, 2026|08\/11\/2026/);
    expect(await screen.findByText(/Còn 1 đợt thanh toán chưa trả đủ/)).toBeInTheDocument();
  });

  it("says the order is about to complete once the window passed and nothing is owed", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: beOrderInstallments({
        outstanding: 0,
        installments: [],
      }),
    });
    renderWithProviders(
      <OrderCompletionHint order={delivered()} now={new Date("2026-11-20T00:00:00Z")} />,
    );
    expect(await screen.findByText("Đơn sắp được hoàn tất")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Đã hết thời hạn đổi / trả hàng.");
  });

  it("says nothing for an order not delivered, or already completed", () => {
    const get = vi.spyOn(api, "get");
    const { container } = renderWithProviders(
      <OrderCompletionHint order={delivered({ status: "COMPLETED", statusGroup: "DELIVERED" })} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(get).not.toHaveBeenCalled();
  });
});
