import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders } from "@/test/render";

import { quoteCardPayloadSchema } from "../card-payloads";
import { AcceptQuoteDialog } from "../components/cards/quote-dialogs";
import { MessageItem } from "../components/message-item";
import { chatMessageDtoSchema } from "../schemas";
import {
  CONVERSATION_ID,
  LINE_ID,
  cardMessageJson,
  designRequestPayload,
  quotePayload,
} from "./fixtures";

afterEach(() => vi.restoreAllMocks());

function renderCard(json: Record<string, unknown>, canAct = true) {
  const message = chatMessageDtoSchema.parse(json);
  return renderWithProviders(
    <MessageItem conversationId={CONVERSATION_ID} message={message} canAct={canAct} />,
  );
}

describe("TC-F13-02: card buttons are the customer's only", () => {
  it("QUOTE_REQUEST shows no button even when staffActions offers CREATE_QUOTE", () => {
    renderCard(
      cardMessageJson("QUOTE_REQUEST", designRequestPayload(), {
        customerActions: [],
        staffActions: ["CREATE_QUOTE"],
      }),
    );
    const card = screen.getByRole("region", { name: /Yêu cầu báo giá/ });
    expect(within(card).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText(/Lập báo giá/)).not.toBeInTheDocument();
    expect(within(card).getByText("Đã duyệt")).toBeInTheDocument();
  });

  it("QUOTE_REQUEST shows a returned design with its reason", () => {
    renderCard(
      cardMessageJson(
        "QUOTE_REQUEST",
        designRequestPayload({
          designStatus: "DRAFT",
          customerSku: null,
          returnReason: "Logo bị lệch vùng in",
        }),
      ),
    );
    expect(screen.getByText("Bị trả lại")).toBeInTheDocument();
    expect(screen.getByText("Logo bị lệch vùng in")).toBeInTheDocument();
  });

  it("QUOTE shows exactly the customerActions the BE sent", () => {
    renderCard(
      cardMessageJson("QUOTE", quotePayload(), {
        customerActions: ["REQUEST_CHANGES"],
        staffActions: ["CREATE_QUOTE"],
      }),
    );
    expect(screen.getByRole("button", { name: "Yêu cầu sửa" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Chấp nhận" })).not.toBeInTheDocument();
  });

  it("QUOTE buttons are disabled once validUntil has passed, though the payload says SENT", () => {
    renderCard(
      cardMessageJson("QUOTE", quotePayload({ validUntil: "2020-01-01T00:00:00Z" }), {
        customerActions: ["ACCEPT", "REQUEST_CHANGES"],
      }),
    );
    expect(screen.getByRole("button", { name: "Chấp nhận" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Yêu cầu sửa" })).toBeDisabled();
    expect(screen.getByText("Hết hiệu lực")).toBeInTheDocument();
  });

  it("a SUPERSEDED quote card says it was replaced and offers nothing", () => {
    renderCard(cardMessageJson("QUOTE", quotePayload(), { state: "SUPERSEDED" }));
    expect(screen.getByText("Đã thay bằng bản mới")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chấp nhận" })).not.toBeInTheDocument();
  });

  it("an unknown card kind shows its fallback text", () => {
    renderCard(
      cardMessageJson("PRODUCTION_PROGRESS", { step: 1 }, {}, { body: "Đơn đang sản xuất" }),
    );
    expect(screen.getByText("Đơn đang sản xuất")).toBeInTheDocument();
  });
});

describe("accepting a quote on its card (C10)", () => {
  const open = () =>
    renderCard(
      cardMessageJson("QUOTE", quotePayload(), { customerActions: ["ACCEPT", "REQUEST_CHANGES"] }),
    );

  it("posts {action: ACCEPT, version, cartons: {<line id>: n}}", async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: cardMessageJson("QUOTE", quotePayload({ status: "ACCEPTED" }), { state: "ACTED" }),
    });
    open();
    await user.click(screen.getByRole("button", { name: "Chấp nhận" }));
    const input = await screen.findByLabelText(/Dòng 1/);
    expect(input).toHaveValue(60);
    await user.clear(input);
    await user.type(input, "80");
    await user.click(screen.getByRole("button", { name: "Chấp nhận báo giá" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[0]).toMatch(
      new RegExp(`^/chat/me/conversations/${CONVERSATION_ID}/cards/[^/]+/actions$`),
    );
    expect(post.mock.calls[0]?.[1]).toEqual({
      action: "ACCEPT",
      version: 3,
      cartons: { [LINE_ID]: 80 },
    });
  });

  it("on QUOTE_BELOW_MOQ shows the BE message and highlights details.lineNo", async () => {
    const user = userEvent.setup();
    const message =
      "Dòng 1 (LY-GIAY-DEMO-12OZ-XANH): 10 thùng thấp hơn số lượng đặt tối thiểu (MOQ) là 20 thùng.";
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError(409, "QUOTE_BELOW_MOQ", message, undefined, undefined, {
        lineNo: 1,
        sku: "LY-GIAY-DEMO-12OZ-XANH",
        cartons: 10,
        moq: 20,
      }),
    );
    open();
    await user.click(screen.getByRole("button", { name: "Chấp nhận" }));
    const input = await screen.findByLabelText(/Dòng 1/);
    await user.clear(input);
    await user.type(input, "10");
    await user.click(screen.getByRole("button", { name: "Chấp nhận báo giá" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.closest("[data-refused]")).not.toBeNull();
  });

  it("keeps the typed cartons when polling refreshes the card while the dialog is open", async () => {
    const user = userEvent.setup();
    const linesOf = () => quoteCardPayloadSchema.parse(quotePayload()).lines;
    const props = {
      open: true,
      onOpenChange: () => undefined,
      pending: false,
      error: null,
      badLine: null,
      onAccept: () => undefined,
    };
    const view = render(<AcceptQuoteDialog {...props} lines={linesOf()} />);
    const input = await screen.findByLabelText(/Dòng 1/);
    await user.clear(input);
    await user.type(input, "25");
    // A poll parses the card again: same content, new array.
    view.rerender(<AcceptQuoteDialog {...props} lines={linesOf()} />);
    expect(screen.getByLabelText(/Dòng 1/)).toHaveValue(25);
  });

  it("REQUEST_CHANGES requires a note before anything is sent", async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, "post");
    open();
    await user.click(screen.getByRole("button", { name: "Yêu cầu sửa" }));
    await user.click(await screen.findByRole("button", { name: "Gửi yêu cầu sửa" }));
    expect(await screen.findByText("Vui lòng ghi rõ nội dung cần sửa.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});
