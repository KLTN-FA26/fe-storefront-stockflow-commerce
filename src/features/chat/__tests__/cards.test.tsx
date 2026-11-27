import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  QUOTE_ID,
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

  it("BE-17: a QUOTE card with convertedOrderId links to the order page", () => {
    renderCard(
      cardMessageJson(
        "QUOTE",
        quotePayload({
          status: "CONVERTED",
          convertedOrderId: "0c0e0000-0000-4000-8000-000000000001",
          convertedOrderNumber: "SO-20260910-900001",
        }),
        { state: "ACTED" },
      ),
    );
    const link = screen.getByRole("link", { name: /Đã tạo đơn\s+SO-20260910-900001/ });
    expect(link).toHaveAttribute("href", "/account/orders/0c0e0000-0000-4000-8000-000000000001");
  });

  it("BE-17: a QUOTE card without convertedOrderId has no order link", () => {
    renderCard(cardMessageJson("QUOTE", quotePayload(), { state: "OPEN" }));
    expect(screen.queryByRole("link", { name: /Đã tạo đơn/ })).not.toBeInTheDocument();
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

/** GET /quotes/{id} as the BE answers it for the DS-02a quote: MOQ 20, tiers 20/50/100, VAT 8 %, plate fee. */
const quotePricingJson = () => ({
  id: QUOTE_ID,
  lines: [
    {
      id: LINE_ID,
      lineNo: 1,
      sku: "LY-GIAY-DEMO-12OZ-XANH",
      cartons: 60,
      unitsPerCarton: 1000,
      moq: 20,
      tiers: [
        { minQuantity: 20, unitPrice: 1250 },
        { minQuantity: 50, unitPrice: 1150 },
        { minQuantity: 100, unitPrice: 1050 },
      ],
      taxRate: 8,
    },
  ],
  fees: [{ amount: 1_500_000, tax: 120_000, taxRate: 8 }],
});

/** SF-UX-21: accepting waits for the pricing; once it failed, the dialog says so and lets the customer accept. */
const pricingFailed = async () => {
  expect(
    await screen.findByText(
      /Chưa tải được số thùng tối thiểu và giá tạm tính/,
      {},
      { timeout: 4000 },
    ),
  ).toBeInTheDocument();
};

describe("accepting a quote on its card (C10)", () => {
  // Without the quote's pricing the dialog still works: the BE checks the MOQ.
  beforeEach(() => {
    vi.spyOn(api, "get").mockRejectedValue(new ApiError(503, "SERVICE_UNAVAILABLE", "offline"));
  });
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
    await pricingFailed();
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
    await pricingFailed();
    await user.clear(input);
    await user.type(input, "10");
    await user.click(screen.getByRole("button", { name: "Chấp nhận báo giá" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.closest("[data-refused]")).not.toBeNull();
  });

  it("WF-02 audit item 4: shows the MOQ, tier price, line total and total with tax from the quote", async () => {
    const user = userEvent.setup();
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: quotePricingJson() });
    open();
    await user.click(screen.getByRole("button", { name: "Chấp nhận" }));
    const dialog = await screen.findByRole("dialog");
    expect(get.mock.calls[0]?.[0]).toBe(`/quotes/${QUOTE_ID}`);
    expect(await within(dialog).findByText("20 thùng")).toBeInTheDocument();
    // The minimum is named in words, never the bare "MOQ" (S04-8).
    expect(within(dialog).getByText("Số thùng tối thiểu")).toBeInTheDocument();
    expect(within(dialog).queryByText("MOQ")).not.toBeInTheDocument();
    // 60 cartons × 1.000 × 1.150 = 69.000.000; + plate fee 1.500.000; VAT 5.520.000 + 120.000 → 76.140.000.
    // Line total and goods subtotal.
    expect(within(dialog).getAllByText(/69\.000\.000/)).toHaveLength(2);
    expect(within(dialog).getByText(/76\.140\.000/)).toBeInTheDocument();
  });

  it("names each line by its design, with the picture, once the quote is read (SF#67), the SKU until then", async () => {
    const user = userEvent.setup();
    const pricing = quotePricingJson();
    vi.spyOn(api, "get").mockResolvedValue({
      data: {
        ...pricing,
        lines: [
          {
            ...pricing.lines[0],
            designName: "Ly giấy Lẩu Thái Siam",
            previewUrl: "https://media.example.test/preview.png",
          },
        ],
      },
    });
    open();
    await user.click(screen.getByRole("button", { name: "Chấp nhận" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Ly giấy Lẩu Thái Siam")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: /Xem ảnh thiết kế Ly giấy Lẩu Thái Siam/ }),
    ).toBeInTheDocument();
    // The SKU stays beside the name, small.
    expect(within(dialog).getByText("LY-GIAY-DEMO-12OZ-XANH")).toBeInTheDocument();
  });

  it("WF-02 audit item 4: below the MOQ is refused in the dialog before anything is sent", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockResolvedValue({ data: quotePricingJson() });
    const post = vi.spyOn(api, "post");
    open();
    await user.click(screen.getByRole("button", { name: "Chấp nhận" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("20 thùng");
    const input = within(dialog).getByLabelText(/Dòng 1/);
    await user.clear(input);
    await user.type(input, "10");
    await user.click(within(dialog).getByRole("button", { name: "Chấp nhận báo giá" }));
    expect(
      await within(dialog).findByText("Dòng 1: số thùng tối thiểu là 20 thùng."),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("SF-UX-21: shows each line's price tiers, the applying one marked, as the quote page does", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockResolvedValue({ data: quotePricingJson() });
    open();
    await user.click(screen.getByRole("button", { name: "Chấp nhận" }));
    const dialog = await screen.findByRole("dialog");
    const tiers = await within(dialog).findByRole("list", { name: "Bậc giá" });
    expect(within(tiers).getAllByRole("listitem")).toHaveLength(3);
    // 60 cartons: the 50-carton break applies.
    expect(
      within(tiers)
        .getByText(/Từ 50 thùng/)
        .closest("li"),
    ).toHaveAttribute("aria-current", "true");
  });

  it("SF-UX-21: 'Chấp nhận báo giá' waits while the pricing loads", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "get").mockReturnValue(new Promise(() => undefined) as never);
    open();
    await user.click(screen.getByRole("button", { name: "Chấp nhận" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Đang tải số thùng tối thiểu và giá tạm tính…"),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Chấp nhận báo giá" })).toBeDisabled();
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
      pricing: undefined,
      pricingFailed: false,
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

  describe("WF-02 FE-1: a line no longer for sale", () => {
    const NOTICE = "Báo giá có sản phẩm đã ngừng bán. Bạn có thể yêu cầu Sale sửa báo giá.";
    const pricingWith = (purchasability: string | null) => {
      const json = quotePricingJson();
      return { ...json, lines: json.lines.map((line) => ({ ...line, purchasability })) };
    };

    it("disables ACCEPT and says why, while 'Yêu cầu sửa' stays", async () => {
      vi.spyOn(api, "get").mockResolvedValue({ data: pricingWith("PRODUCT_DISCONTINUED") });
      open();
      expect(await screen.findByText(NOTICE)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Chấp nhận" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Yêu cầu sửa" })).toBeEnabled();
    });

    it.each([
      ["no verdict (a legacy line)", null],
      ["a verdict this FE does not know yet (owner decision 13)", "SOMETHING_NEW"],
    ])("keeps ACCEPT for a line with %s", async (_, verdict) => {
      const get = vi.spyOn(api, "get").mockResolvedValue({ data: pricingWith(verdict) });
      open();
      await waitFor(() =>
        expect(get).toHaveBeenCalledWith(`/quotes/${QUOTE_ID}`, expect.anything()),
      );
      expect(screen.getByRole("button", { name: "Chấp nhận" })).toBeEnabled();
      expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    });

    it("on SKU_NOT_SELLABLE shows the BE message, re-reads the quote and blocks accepting", async () => {
      const user = userEvent.setup();
      let verdict = "PURCHASABLE";
      vi.spyOn(api, "get").mockImplementation(async () => ({ data: pricingWith(verdict) }));
      const message =
        "Dòng 1 (LY-GIAY-DEMO-12OZ-XANH) đã ngừng bán nên chưa chấp nhận được báo giá. Hãy yêu cầu Sale sửa báo giá.";
      vi.spyOn(api, "post").mockImplementation(async () => {
        verdict = "PRODUCT_INACTIVE";
        throw new ApiError(409, "SKU_NOT_SELLABLE", message);
      });
      open();
      await user.click(screen.getByRole("button", { name: "Chấp nhận" }));
      const dialog = await screen.findByRole("dialog");
      await within(dialog).findByText("20 thùng");
      await user.click(within(dialog).getByRole("button", { name: "Chấp nhận báo giá" }));

      expect(await within(dialog).findByText(message)).toBeInTheDocument();
      expect(await within(dialog).findByText(NOTICE)).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Chấp nhận báo giá" })).toBeDisabled();
    });
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

describe("PAYMENT_INFO: the VietQR code (plan E1)", () => {
  const transferPayload = (overrides: Record<string, unknown> = {}) => ({
    installmentId: "77777777-7777-4777-8777-777777777777",
    contractNumber: "HD-20261120-000001-1",
    orderId: "88888888-8888-4888-8888-888888888888",
    orderNumber: "SO-20261120-000001",
    seq: 1,
    name: "Đặt cọc khi ký",
    amount: 22_842_000,
    installmentAmount: 22_842_000,
    currency: "VND",
    status: "DUE",
    transferContent: "HD20261120000001 DOT1",
    bank: {
      bankName: "DEMO BANK",
      bankBin: "970000",
      accountNumber: "0000000000",
      accountName: "DEMO STOCKFLOW CO LTD",
    },
    vietQr:
      "00020101021238530010A0000007270123000697000001090000000000208QRIBFTTA53037045408228420005802VN6304ABCD",
    ...overrides,
  });

  it("titles a fee item by its name, not by its number (WF-02 FE-7)", () => {
    renderCard(
      cardMessageJson("PAYMENT_INFO", transferPayload({ seq: 21, name: "Cancellation fee" })),
    );

    expect(screen.getByText("Phí huỷ đơn")).toBeInTheDocument();
    expect(screen.queryByText(/Đợt 21/)).not.toBeInTheDocument();
  });

  it("draws the code the BE sent above the transfer details", () => {
    renderCard(cardMessageJson("PAYMENT_INFO", transferPayload()));

    expect(screen.getByRole("img", { name: "Mã VietQR chuyển khoản" })).toBeInTheDocument();
    expect(
      screen.getByText(/tài khoản, số tiền và nội dung chuyển khoản được điền sẵn/),
    ).toBeInTheDocument();
  });

  it("SF-UX-38: the caption on the white plate has a dark colour that does not flip with the theme", () => {
    renderCard(cardMessageJson("PAYMENT_INFO", transferPayload()));
    expect(screen.getByText(/được điền sẵn/)).toHaveClass("text-ink-on-light");
  });

  it("draws no code when the BE sent none (no BIN configured)", () => {
    renderCard(cardMessageJson("PAYMENT_INFO", transferPayload({ vietQr: null })));

    expect(screen.queryByRole("img", { name: "Mã VietQR chuyển khoản" })).not.toBeInTheDocument();
  });

  it("draws no code for an installment already paid", () => {
    renderCard(cardMessageJson("PAYMENT_INFO", transferPayload({ status: "PAID", amount: 0 })));

    expect(screen.queryByRole("img", { name: "Mã VietQR chuyển khoản" })).not.toBeInTheDocument();
  });
});
