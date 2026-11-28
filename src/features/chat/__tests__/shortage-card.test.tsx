import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders } from "@/test/render";
import { shortagePayload } from "@/test/shortage-card";

import { MessageItem } from "../components/message-item";
import { chatMessageDtoSchema } from "../schemas";
import { CONVERSATION_ID, cardMessageJson } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

function renderCard(json: Record<string, unknown>) {
  const message = chatMessageDtoSchema.parse(json);
  return renderWithProviders(
    <MessageItem conversationId={CONVERSATION_ID} message={message} canAct />,
  );
}

const sent = (payload: Record<string, unknown> = {}) =>
  cardMessageJson("SHORTAGE_CHOICE", shortagePayload(payload), { customerActions: ["CHOOSE"] });

describe("SHORTAGE_CHOICE card — waiting for the customer (SENT)", () => {
  it("shows the title, the lines and one button per way with its money / date effect", () => {
    renderCard(sent());
    const card = screen.getByRole("region", { name: /Đơn thiếu 2 thùng/ });
    expect(within(card).getByText("Chờ anh/chị chọn")).toBeInTheDocument();
    expect(card).toHaveTextContent("SO-20261128-000007");
    expect(card).toHaveTextContent("Đợt 1 · giao 05/12/2026 - 10/12/2026");
    expect(card).toHaveTextContent("Thiếu 2");
    expect(card).toHaveTextContent("Em xin lỗi anh/chị, kho còn thiếu 2 thùng.");
    for (const name of [
      "Chờ sản xuất phần thiếu",
      "Giảm số thùng",
      "Giao một phần rồi đóng phần còn lại",
      "Huỷ đơn",
    ]) {
      expect(within(card).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(card).toHaveTextContent("Dự kiến giao từ 22/12/2026.");
    expect(card).toHaveTextContent("đồng ý dời lịch giao tới ngày đó");
    expect(card).toHaveTextContent("Các đợt sau (đợt 2, 3) cũng bị đóng.");
    expect(card).toHaveTextContent("phí (nếu có) theo thoả thuận với Sale");
    expect(card).not.toHaveTextContent("INVENTORY");
  });

  it("shows only the ways the BE offered: no reduce button when the card does not carry it", () => {
    renderCard(
      sent({
        options: [
          { option: "WAIT_FOR_PRODUCTION", expectedDeliveryDate: "2026-12-08", afterWindow: false },
        ],
      }),
    );
    expect(screen.queryByRole("button", { name: "Giảm số thùng" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chờ sản xuất phần thiếu" })).toBeInTheDocument();
  });

  it("asks for confirmation first, then posts CHOOSE with the card's version and the note, once", async () => {
    const user = userEvent.setup();
    let finish: (value: unknown) => void = () => undefined;
    const post = vi
      .spyOn(api, "post")
      .mockReturnValue(new Promise((resolve) => (finish = resolve)) as never);
    renderCard(sent());
    await user.click(screen.getByRole("button", { name: "Giảm số thùng" }));
    const dialog = await screen.findByRole("dialog", { name: "Xác nhận chọn: Giảm số thùng" });
    expect(dialog).toHaveTextContent("Bỏ 2 thùng thiếu của đợt này");
    expect(post).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/Lời nhắn cho Sale/), "Cứ giao 8 thùng nhé");
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận chọn" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[0]).toMatch(
      new RegExp(`^/chat/me/conversations/${CONVERSATION_ID}/cards/[^/]+/actions$`),
    );
    expect(post.mock.calls[0]?.[1]).toEqual({
      action: "CHOOSE",
      option: "REDUCE_CARTONS",
      version: 3,
      note: "Cứ giao 8 thùng nhé",
    });
    expect(within(dialog).getByRole("button", { name: "Đang gửi..." })).toBeDisabled();
    finish({
      data: cardMessageJson(
        "SHORTAGE_CHOICE",
        shortagePayload({
          status: "ANSWERED",
          version: 4,
          chosen: {
            option: "REDUCE_CARTONS",
            at: "2026-11-28T03:00:00Z",
            note: "Cứ giao 8 thùng nhé",
          },
        }),
      ),
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /Xác nhận chọn/ })).not.toBeInTheDocument(),
    );
  });

  it("keeps the dialog open with the BE's refusal when the card changed meanwhile", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError(
        409,
        "SHORTAGE_CARD_STATE_CONFLICT",
        "Thẻ đã có lựa chọn hoặc không còn hiệu lực — tải lại để xem trạng thái mới.",
      ),
    );
    renderCard(sent());
    await user.click(screen.getByRole("button", { name: "Huỷ đơn" }));
    const dialog = await screen.findByRole("dialog", { name: "Xác nhận chọn: Huỷ đơn" });
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận chọn" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Thẻ đã có lựa chọn");
  });
});

describe("SHORTAGE_CHOICE card — the other states", () => {
  const closed = (payload: Record<string, unknown>, state = "OPEN") =>
    cardMessageJson("SHORTAGE_CHOICE", shortagePayload(payload), { state, customerActions: [] });

  it("ANSWERED: the choice and its time, 'Sale sẽ thực hiện', no buttons", () => {
    renderCard(
      closed({
        status: "ANSWERED",
        chosen: { option: "WAIT_FOR_PRODUCTION", at: "2026-11-28T03:30:00Z", note: null },
      }),
    );
    const card = screen.getByRole("region", { name: /Đơn thiếu 2 thùng/ });
    expect(card).toHaveTextContent(
      "Anh/chị đã chọn: Chờ sản xuất phần thiếu lúc 28/11/2026 10:30 — Sale sẽ thực hiện.",
    );
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });

  it("EXECUTED: 'Sale đã thực hiện: …'", () => {
    renderCard(
      closed(
        {
          status: "EXECUTED",
          chosen: { option: "CANCEL_ORDER", at: "2026-11-28T03:30:00Z", note: null },
          executedAt: "2026-11-28T05:00:00Z",
        },
        "CLOSED",
      ),
    );
    const card = screen.getByRole("region", { name: /Đơn thiếu 2 thùng/ });
    expect(within(card).getAllByText("Sale đã thực hiện")).toHaveLength(1);
    expect(card).toHaveTextContent("Sale đã thực hiện: Huỷ đơn.");
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });

  it("SUPERSEDED: 'Đã có thẻ mới thay thế', no buttons", () => {
    renderCard(closed({ status: "SUPERSEDED", endedReason: "REPLACED" }, "SUPERSEDED"));
    const card = screen.getByRole("region", { name: /Đơn thiếu 2 thùng/ });
    expect(card).toHaveTextContent("Đã có thẻ mới thay thế");
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });

  it("EXPIRED: 'Không cần chọn nữa', and 'đơn đã đủ hàng' once the warehouse found the cartons", () => {
    renderCard(closed({ status: "EXPIRED", endedReason: "REALLOCATED" }, "EXPIRED"));
    const card = screen.getByRole("region", { name: /Đơn thiếu 2 thùng/ });
    expect(card).toHaveTextContent("Không cần chọn nữa — đơn đã đủ hàng.");
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });

  it("EXPIRED for another reason does not claim the order is complete", () => {
    renderCard(closed({ status: "EXPIRED", endedReason: "ORDER_CANCELLED" }, "EXPIRED"));
    expect(screen.getByRole("region", { name: /Đơn thiếu 2 thùng/ })).not.toHaveTextContent(
      "đủ hàng",
    );
  });
});

describe("SHORTAGE_CHOICE card that cannot be read", () => {
  it("falls back to the card's text instead of breaking the thread", () => {
    renderCard(
      cardMessageJson("SHORTAGE_CHOICE", { cardId: "x" }, {}, { body: "Đơn thiếu 2 thùng - SO-1" }),
    );
    expect(screen.getByText("Đơn thiếu 2 thùng - SO-1")).toBeInTheDocument();
  });
});
