import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { renderWithProviders } from "@/test/render";

import { MessageItem } from "../components/message-item";
import { chatMessageDtoSchema } from "../schemas";
import { CONVERSATION_ID, cardMessageJson, messageJson } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

const ORDER_ID = "88888888-8888-4888-8888-888888888888";
const INVOICE_ID = "99999999-9999-4999-8999-999999999999";
const ROUND_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function renderMessage(json: Record<string, unknown>) {
  const message = chatMessageDtoSchema.parse(json);
  return renderWithProviders(
    <MessageItem conversationId={CONVERSATION_ID} message={message} canAct />,
  );
}

const samplePayload = (overrides: Record<string, unknown> = {}) => ({
  roundId: ROUND_ID,
  roundNo: 1,
  productionOrderCode: "PO-20261120-0001",
  status: "WAITING",
  openedAt: "2026-11-20T03:00:00Z",
  skus: [],
  media: [],
  ...overrides,
});

describe("ORDER_STATUS card", () => {
  it("words the shipment status and failure reason in Vietnamese, never the raw code", () => {
    renderMessage(
      cardMessageJson("ORDER_STATUS", {
        orderId: ORDER_ID,
        orderNumber: "SO-20261120-000001",
        shipmentCode: "SHP-0001",
        status: "DELIVERY_FAILED",
        failureReasonCode: "CUSTOMER_ABSENT",
        carrierName: "Giao Hàng Nhanh",
        packageCount: 3,
        occurredAt: "2026-11-20T03:00:00Z",
      }),
    );
    const card = screen.getByRole("region", { name: /Giao hàng/ });
    expect(within(card).getByText("Giao không thành công")).toBeInTheDocument();
    expect(within(card).getByText("Không gặp được người nhận")).toBeInTheDocument();
    expect(within(card).getByText("Giao Hàng Nhanh")).toBeInTheDocument();
    expect(card).not.toHaveTextContent("DELIVERY_FAILED");
    expect(within(card).getByRole("link", { name: "Xem đơn hàng" })).toHaveAttribute(
      "href",
      `/account/orders/${ORDER_ID}`,
    );
  });
});

describe("ORDER_STATUS card superseded by a later shipment event", () => {
  it("keeps its own shipment status instead of 'Đã thay bằng bản mới'", () => {
    renderMessage(
      cardMessageJson(
        "ORDER_STATUS",
        { orderId: ORDER_ID, shipmentCode: "SHP-0001", status: "DELIVERED" },
        { state: "SUPERSEDED" },
      ),
    );
    const card = screen.getByRole("region", { name: /Giao hàng/ });
    expect(within(card).getByText("Đã giao")).toBeInTheDocument();
    expect(card).not.toHaveTextContent("Đã thay bằng bản mới");
  });
});

describe("INVOICE card", () => {
  it("downloads the PDF through the e-invoice's short-lived link", async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(api, "get").mockResolvedValue({
      data: { url: "https://files.example.vn/invoice.pdf", expiresAt: "2026-11-20T04:00:00Z" },
    });
    const replace = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({ location: { replace }, close: vi.fn() } as never);
    renderMessage(
      cardMessageJson("INVOICE", {
        id: INVOICE_ID,
        status: "ISSUED",
        orderId: ORDER_ID,
        orderNumber: "SO-20261120-000001",
        templateCode: "1C26T",
        symbol: "AA",
        invoiceNumber: 42,
        issueDate: "2026-11-20",
        currency: "VND",
        grandTotal: 22_842_000,
        hasXml: false,
        hasPdf: true,
      }),
    );
    expect(screen.queryByRole("button", { name: /XML/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tải hoá đơn (PDF)" }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("https://files.example.vn/invoice.pdf"),
    );
    expect(get.mock.calls[0]?.[0]).toBe(`/einvoices/me/${INVOICE_ID}/files/PDF`);
  });
});

describe("SAMPLE_APPROVAL card", () => {
  const waiting = () =>
    cardMessageJson("SAMPLE_APPROVAL", samplePayload(), {
      customerActions: ["APPROVE", "REQUEST_REPRINT"],
    });

  it("APPROVE posts the action to the card endpoint and disables the buttons while pending", async () => {
    const user = userEvent.setup();
    let finish: (value: unknown) => void = () => undefined;
    const post = vi
      .spyOn(api, "post")
      .mockReturnValue(new Promise((resolve) => (finish = resolve)) as never);
    renderMessage(waiting());
    await user.click(screen.getByRole("button", { name: "Duyệt mẫu" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[0]).toMatch(
      new RegExp(`^/chat/me/conversations/${CONVERSATION_ID}/cards/[^/]+/actions$`),
    );
    expect(post.mock.calls[0]?.[1]).toEqual({ action: "APPROVE" });
    expect(screen.getByRole("button", { name: "In lại mẫu" })).toBeDisabled();
    finish({
      data: cardMessageJson("SAMPLE_APPROVAL", samplePayload({ status: "APPROVED" }), {
        state: "ACTED",
      }),
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "In lại mẫu" })).toBeEnabled());
  });

  it("REQUEST_REPRINT needs a note and posts it", async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: cardMessageJson("SAMPLE_APPROVAL", samplePayload({ status: "REPRINT_REQUESTED" }), {
        state: "ACTED",
      }),
    });
    renderMessage(waiting());
    await user.click(screen.getByRole("button", { name: "In lại mẫu" }));
    await user.click(screen.getByRole("button", { name: "Gửi yêu cầu in lại" }));
    expect(await screen.findByText("Vui lòng ghi rõ điểm cần in lại.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Điểm cần in lại/), "Màu logo nhạt hơn mẫu duyệt");
    await user.click(screen.getByRole("button", { name: "Gửi yêu cầu in lại" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[1]).toEqual({
      action: "REQUEST_REPRINT",
      note: "Màu logo nhạt hơn mẫu duyệt",
    });
  });

  it("a CLOSED card whose payload still says WAITING shows no waiting badge and no buttons", () => {
    renderMessage(
      cardMessageJson("SAMPLE_APPROVAL", samplePayload({ status: "WAITING" }), {
        state: "CLOSED",
      }),
    );
    expect(screen.getByText("Đã đóng")).toBeInTheDocument();
    expect(screen.queryByText("Chờ bạn duyệt")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duyệt mẫu" })).not.toBeInTheDocument();
  });

  it("shows the answered round without buttons", () => {
    renderMessage(
      cardMessageJson("SAMPLE_APPROVAL", samplePayload({ status: "APPROVED" }), {
        state: "ACTED",
      }),
    );
    expect(screen.getAllByText("Đã duyệt").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Duyệt mẫu" })).not.toBeInTheDocument();
  });
});

describe("image attachments (WF-02 item 52)", () => {
  it("draws a thumbnail from the 10-minute link, while a PDF stays a download button", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({
      data: { url: "https://files.example.vn/logo.png", expiresAt: "2026-11-20T04:00:00Z" },
    });
    renderMessage(
      messageJson({
        senderType: "CUSTOMER",
        attachments: [
          { id: "img-1", fileName: "logo.png", contentType: "image/png", sizeBytes: 2048 },
          { id: "pdf-1", fileName: "hop-dong.pdf", contentType: "application/pdf" },
        ],
      }),
    );
    const image = await screen.findByRole("img", { name: "logo.png" });
    expect(image).toHaveAttribute("src", "https://files.example.vn/logo.png");
    expect(screen.getByRole("button", { name: "Tải hop-dong.pdf" })).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0]).toBe(
      `/chat/me/conversations/${CONVERSATION_ID}/attachments/img-1/link`,
    );
  });

  it("fetches a fresh link when the image is opened, since the thumbnail's may have expired", async () => {
    const user = userEvent.setup();
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({
        data: { url: "https://files.example.vn/old.png", expiresAt: "2026-11-20T04:00:00Z" },
      })
      .mockResolvedValue({
        data: { url: "https://files.example.vn/new.png", expiresAt: "2026-11-20T05:00:00Z" },
      });
    renderMessage(
      messageJson({
        senderType: "CUSTOMER",
        attachments: [{ id: "img-1", fileName: "logo.png", contentType: "image/png" }],
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Xem ảnh logo.png" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(within(dialog).getByRole("link", { name: "Tải ảnh" })).toHaveAttribute(
        "href",
        "https://files.example.vn/new.png",
      ),
    );
    expect(get).toHaveBeenCalledTimes(2);
  });
});
