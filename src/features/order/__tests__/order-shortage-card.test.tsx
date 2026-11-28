import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";
import { SHORTAGE_CARD_ID, SHORTAGE_ORDER_ID, shortagePayload } from "@/test/shortage-card";

import { getLiveShortageCard } from "../shortage-api";
import { OrderShortageCard } from "../components/order-shortage-card";
import { OrderNextStep } from "../components/order-next-step";
import { shortageCardSchema, type ShortageCard } from "@/lib/domain/shortage";

const livePath = `/orders/me/${SHORTAGE_ORDER_ID}/shortage-cards/live`;

function backend(card: Record<string, unknown> | null, permissions = ["sales-orders:UPDATE"]) {
  return vi.spyOn(api, "get").mockImplementation(async (url: string) => {
    if (url === "/identity/me/permissions") {
      return { data: { roles: ["CUSTOMER"], permissions, dataScope: "OWN" } };
    }
    if (url === livePath) return { data: card };
    throw new ApiError(404, "NOT_FOUND", `No fake route for ${url}`);
  });
}

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("shortage card API", () => {
  it("reads the live card and treats `data: null` as none", async () => {
    const get = backend(null);
    await expect(getLiveShortageCard(SHORTAGE_ORDER_ID)).resolves.toBeNull();
    expect(get).toHaveBeenCalledWith(livePath, {});
  });
});

describe("OrderShortageCard (order page block)", () => {
  it("shows nothing when the order has no live card", async () => {
    backend(null);
    const { container } = renderWithProviders(<OrderShortageCard orderId={SHORTAGE_ORDER_ID} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(livePath, expect.anything()));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the card with the ways on, the chat link, and sends the choice with the card's version", async () => {
    const user = userEvent.setup();
    backend(shortagePayload());
    const answered = shortagePayload({
      status: "ANSWERED",
      version: 4,
      chosen: { option: "WAIT_FOR_PRODUCTION", at: "2026-11-28T03:00:00Z", note: null },
    });
    // The BE answers the choice with the answered card, and the re-read that follows finds the same.
    const post = vi.spyOn(api, "post").mockImplementation(async () => {
      backend(answered);
      return { data: answered };
    });
    renderWithProviders(<OrderShortageCard orderId={SHORTAGE_ORDER_ID} />);

    const block = await screen.findByRole("region", { name: "Đơn thiếu 2 thùng" });
    expect(block).toHaveAttribute("id", "thieu-thung");
    expect(within(block).getByRole("link", { name: "Mở chat với Sale" })).toHaveAttribute(
      "href",
      `/chat/new?kind=ORDER&id=${SHORTAGE_ORDER_ID}`,
    );
    await user.click(within(block).getByRole("button", { name: "Chờ sản xuất phần thiếu" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Xác nhận chọn: Chờ sản xuất phần thiếu",
    });
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận chọn" }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[0]).toBe(
      `/orders/me/${SHORTAGE_ORDER_ID}/shortage-cards/${SHORTAGE_CARD_ID}/choice`,
    );
    expect(post.mock.calls[0]?.[1]).toEqual({ option: "WAIT_FOR_PRODUCTION", version: 3 });
    expect(
      await screen.findByText(/Anh\/chị đã chọn: Chờ sản xuất phần thiếu/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Huỷ đơn" })).not.toBeInTheDocument();
  });

  it("says the card changed when the choice is refused 409, and keeps the dialog open", async () => {
    const user = userEvent.setup();
    backend(shortagePayload());
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError(409, "SHORTAGE_CARD_STATE_CONFLICT", "Conflict"),
    );
    renderWithProviders(<OrderShortageCard orderId={SHORTAGE_ORDER_ID} />);
    await user.click(await screen.findByRole("button", { name: "Giảm số thùng" }));
    const dialog = await screen.findByRole("dialog", { name: "Xác nhận chọn: Giảm số thùng" });
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận chọn" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Thẻ đã có lựa chọn hoặc không còn hiệu lực",
    );
  });

  it("offers no buttons to an account without the right to update its orders", async () => {
    backend(shortagePayload(), []);
    renderWithProviders(<OrderShortageCard orderId={SHORTAGE_ORDER_ID} />);
    const block = await screen.findByRole("region", { name: "Đơn thiếu 2 thùng" });
    await waitFor(() =>
      expect(within(block).queryByRole("button", { name: "Huỷ đơn" })).not.toBeInTheDocument(),
    );
    expect(block).toHaveTextContent("Hãy chat với Sale để chọn hướng xử lý.");
  });
});

describe("the order's next step while a card waits", () => {
  const nextStep = (card: ShortageCard) => (
    <OrderNextStep
      group="AWAITING_STOCK"
      contract={null}
      payable={null}
      onPay={() => undefined}
      shortage={card}
    />
  );

  it("leads to the block: 'Chọn hướng xử lý thiếu thùng'", () => {
    renderWithProviders(nextStep(shortageCardSchema.parse(shortagePayload())));
    expect(screen.getByRole("link", { name: "Chọn hướng xử lý thiếu thùng" })).toHaveAttribute(
      "href",
      "#thieu-thung",
    );
  });

  it("is gone once the customer answered", () => {
    renderWithProviders(
      nextStep(shortageCardSchema.parse(shortagePayload({ status: "ANSWERED" }))),
    );
    expect(screen.queryByRole("link", { name: /thiếu thùng/ })).not.toBeInTheDocument();
  });
});
