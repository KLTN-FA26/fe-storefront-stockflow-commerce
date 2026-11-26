import { screen, waitFor, within } from "@testing-library/react";
import { AxiosError } from "axios";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/shared/Toast";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { PERM } from "@/lib/auth/permission-codes";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { QuoteDetailScreen } from "../components/quote-detail-screen";
import { beSentQuote, beTwoLineQuote, cupLineId, quoteId } from "./fixtures";

const notFound = vi.fn();
vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

let permissions: string[];

function backend(quote: Record<string, unknown> | (() => Record<string, unknown>)) {
  return vi.spyOn(api, "get").mockImplementation(async (url: string) => {
    if (url === "/identity/me/permissions") {
      return { data: { roles: ["CUSTOMER"], permissions, dataScope: "OWN" } };
    }
    if (url === `/quotes/${quoteId}`)
      return { data: typeof quote === "function" ? quote() : quote };
    throw new ApiError(404, "NOT_FOUND", `No fake route for ${url}`);
  });
}

const belowMoq = () =>
  new ApiError(
    409,
    "QUOTE_BELOW_MOQ",
    "Dòng 2 (NAP-LY-DEMO-90-TRANG): 5 thùng thấp hơn số lượng đặt tối thiểu (MOQ) là 10 thùng.",
    undefined,
    "corr-1",
    { lineNo: 2, sku: "NAP-LY-DEMO-90-TRANG", cartons: 5, moq: 10 },
  );

const cartonsOf = (lineNo: number) =>
  screen
    .getAllByRole("spinbutton", { name: /^Số thùng – dòng \d+ \(/ })
    .find((input) => input.closest("li")?.getAttribute("data-line-no") === String(lineNo))!;

beforeEach(() => {
  signIn();
  permissions = [PERM.quotesRead, PERM.quotesApprove];
});
afterEach(() => {
  vi.restoreAllMocks();
  notFound.mockReset();
  signOut();
});

describe("QuoteDetailScreen — what the customer decides on (SF-UX-16..20)", () => {
  it("names each carton input by its line and SKU", async () => {
    backend(beTwoLineQuote);
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);
    expect(
      await screen.findByRole("spinbutton", { name: "Số thùng – dòng 1 (LY-GIAY-DEMO-12OZ-XANH)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "Số thùng – dòng 2 (NAP-LY-DEMO-90-TRANG)" }),
    ).toBeInTheDocument();
  });

  it("announces the live total and says nothing is paid when accepting", async () => {
    backend(beSentQuote);
    const user = userEvent.setup();
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    const total = (await screen.findByText("Tổng có VAT (tạm tính)")).parentElement!;
    expect(total).toHaveAttribute("aria-live", "polite");
    await user.click(screen.getByRole("button", { name: "Chấp nhận báo giá" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/Bạn chưa phải thanh toán ở bước này/);
  });

  it("puts the validity and the days left in the header of a SENT quote", async () => {
    backend({ ...beSentQuote, validUntil: "2099-12-04T02:00:00Z" });
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);
    expect(await screen.findByText(/^Hiệu lực đến 04\/12\/2099 09:00/)).toBeInTheDocument();
  });

  it("shows the design's name, a thumbnail opening its preview, and pieces per carton", async () => {
    const [line] = beSentQuote.lines;
    backend({
      ...beSentQuote,
      lines: [
        { ...line, designName: "Ly cà phê Nhà Mình", previewUrl: "https://media.test/p.png" },
      ],
    });
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);
    expect(await screen.findByText("Ly cà phê Nhà Mình")).toBeInTheDocument();
    expect(screen.getByText(/1\.000 cái\/thùng/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Xem ảnh thiết kế Ly cà phê Nhà Mình (mở tab mới)" }),
    ).toHaveAttribute("href", "https://media.test/p.png");
  });
});

describe("QuoteDetailScreen — accepting (TC-F03-01)", () => {
  it("shows the lines with pieces, MOQ, the tier that applies and the total with tax", async () => {
    backend(beSentQuote);
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    const line = (await screen.findByText("LY-GIAY-DEMO-12OZ-XANH", { selector: "span" })).closest(
      "li",
    )!;
    expect(within(line).getByText("= 60.000 cái")).toBeInTheDocument();
    expect(within(line).getByText("Số thùng tối thiểu: 20 thùng")).toBeInTheDocument();
    expect(
      within(line)
        .getByText(/Từ 50 thùng/)
        .closest("li"),
    ).toHaveAttribute("aria-current", "true");
    expect(within(line).getByText(/69\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText("Tổng có VAT (tạm tính)").nextElementSibling).toHaveTextContent(
      /76\.140\.000/,
    );
  });

  it("blocks cartons below the MOQ in the form: no request reaches the BE", async () => {
    backend(beSentQuote);
    const post = vi.spyOn(api, "post");
    const user = userEvent.setup();
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    const input = await screen.findByRole("spinbutton", { name: /^Số thùng – dòng \d+ \(/ });
    await user.clear(input);
    await user.type(input, "10");
    await user.click(screen.getByRole("button", { name: "Chấp nhận báo giá" }));

    expect(await screen.findByText("Dòng 1: tối thiểu 20 thùng (MOQ).")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("sends { version, lines } after confirming, at the cartons chosen", async () => {
    let current: Record<string, unknown> = beSentQuote;
    backend(() => current);
    const post = vi.spyOn(api, "post").mockImplementation(async () => {
      current = { ...beSentQuote, status: "ACCEPTED", version: 4 };
      return { data: current };
    });
    const user = userEvent.setup();
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    const input = await screen.findByRole("spinbutton", { name: /^Số thùng – dòng \d+ \(/ });
    await user.clear(input);
    await user.type(input, "100");
    expect(screen.getByText("= 100.000 cái")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Chấp nhận báo giá" }));
    await user.click(await screen.findByRole("button", { name: "Chấp nhận" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/quotes/${quoteId}/acceptance`, {
        version: 3,
        lines: [{ lineId: cupLineId, cartons: 100 }],
      }),
    );
    expect(await screen.findByText("Đã chấp nhận")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chấp nhận báo giá" })).not.toBeInTheDocument();
  });

  it("shows the BE's QUOTE_BELOW_MOQ message and marks line details.lineNo", async () => {
    backend(beTwoLineQuote);
    vi.spyOn(api, "post").mockRejectedValue(belowMoq());
    const user = userEvent.setup();
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    await screen.findAllByRole("spinbutton", { name: /^Số thùng – dòng \d+ \(/ });
    await user.click(screen.getByRole("button", { name: "Chấp nhận báo giá" }));
    await user.click(await screen.findByRole("button", { name: "Chấp nhận" }));

    expect(
      await screen.findByText(/Dòng 2 \(NAP-LY-DEMO-90-TRANG\): 5 thùng thấp hơn/),
    ).toBeInTheDocument();
    expect(cartonsOf(2).closest("li")).toHaveAttribute("data-refused", "true");
    expect(cartonsOf(2)).toHaveAttribute("aria-invalid", "true");
    expect(cartonsOf(1).closest("li")).not.toHaveAttribute("data-refused");
  });

  it("on OPTIMISTIC_LOCK re-reads the quote and never sends the answer again", async () => {
    const get = backend(beSentQuote);
    const post = vi
      .spyOn(api, "post")
      .mockRejectedValue(
        new ApiError(
          409,
          "OPTIMISTIC_LOCK",
          "Báo giá QT-20261120-9001 vừa được người khác thay đổi.",
        ),
      );
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ToastProvider />
        <QuoteDetailScreen quoteId={quoteId} />
      </>,
    );

    await screen.findByRole("spinbutton", { name: /^Số thùng – dòng \d+ \(/ });
    const reads = () => get.mock.calls.filter(([url]) => url === `/quotes/${quoteId}`).length;
    const before = reads();
    await user.click(screen.getByRole("button", { name: "Chấp nhận báo giá" }));
    await user.click(await screen.findByRole("button", { name: "Chấp nhận" }));

    // Said once, in the toast: the form repeats nothing (C8).
    expect(await screen.findByText(/Dữ liệu vừa thay đổi, đã tải lại/)).toBeInTheDocument();
    expect(screen.getAllByText(/Dữ liệu vừa thay đổi/)).toHaveLength(1);
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe("QuoteDetailScreen — read only (TC-F03-03)", () => {
  it("offers no answer on an EXPIRED quote", async () => {
    backend({ ...beSentQuote, status: "EXPIRED" });
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    expect(await screen.findByText("Hết hiệu lực")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chấp nhận báo giá" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yêu cầu sửa" })).not.toBeInTheDocument();
  });

  it("offers no answer on a SENT quote whose validity has passed", async () => {
    backend({ ...beSentQuote, validUntil: "2020-01-01T00:00:00Z" });
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    expect(await screen.findByText("Hết hiệu lực")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chấp nhận báo giá" })).not.toBeInTheDocument();
  });

  it("hides the answers when the BE answers QUOTE_EXPIRED", async () => {
    backend(beSentQuote);
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError(409, "QUOTE_EXPIRED", "Báo giá QT-20261120-9001 đã hết hiệu lực."),
    );
    const user = userEvent.setup();
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    await screen.findByRole("spinbutton", { name: /^Số thùng – dòng \d+ \(/ });
    await user.click(screen.getByRole("button", { name: "Chấp nhận báo giá" }));
    await user.click(await screen.findByRole("button", { name: "Chấp nhận" }));

    expect(await screen.findByText("Báo giá đã hết hiệu lực")).toBeInTheDocument();
    expect(screen.getByText("Hết hiệu lực")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chấp nhận báo giá" })).not.toBeInTheDocument();
  });

  it("offers nothing to an account without sales-quotes:APPROVE", async () => {
    permissions = [PERM.quotesRead];
    backend(beSentQuote);
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    await screen.findAllByText("LY-GIAY-DEMO-12OZ-XANH");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Chấp nhận báo giá" })).not.toBeInTheDocument(),
    );
  });

  it("links a converted quote to its order, and the chat about the quote", async () => {
    backend({
      ...beSentQuote,
      status: "CONVERTED",
      convertedOrder: {
        orderId: "0c0e0000-0000-4000-8000-000000000001",
        orderNumber: "SO-20260910-900001",
        status: "PENDING_CONTRACT",
        total: 76140000,
      },
    });
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    expect(
      await screen.findByRole("link", { name: "Xem đơn hàng SO-20260910-900001" }),
    ).toHaveAttribute("href", "/account/orders/0c0e0000-0000-4000-8000-000000000001");
    expect(screen.getByRole("link", { name: "Chat với Sale" })).toHaveAttribute(
      "href",
      `/chat/new?kind=QUOTE&id=${quoteId}`,
    );
  });

  it("renders not-found for a quote the BE hides (404)", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new ApiError(404, "NOT_FOUND", "Không tìm thấy"));
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);
    await waitFor(() => expect(notFound).toHaveBeenCalled());
  });
});

describe("QuoteDetailScreen — a line that can no longer be bought (WF-02 FE-1)", () => {
  const NOTICE = "Báo giá có sản phẩm đã ngừng bán. Bạn có thể yêu cầu Sale sửa báo giá.";
  const withVerdict = (purchasability: string | null) => ({
    ...beSentQuote,
    lines: beSentQuote.lines.map((line) => ({ ...line, purchasability })),
  });

  it("blocks accepting, tags the line and keeps 'Yêu cầu sửa' open", async () => {
    backend(withVerdict("PRODUCT_DISCONTINUED"));
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: { ...beSentQuote, status: "CHANGES_REQUESTED", version: 4 } });
    const user = userEvent.setup();
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByText("Đã ngừng bán")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chấp nhận báo giá" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yêu cầu sửa" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Nội dung cần sửa/), "Đổi sang mã khác");
    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu sửa" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/quotes/${quoteId}/change-request`, {
        version: 3,
        feedback: "Đổi sang mã khác",
      }),
    );
  });

  it.each([
    ["carries no verdict", null],
    ["carries a verdict this FE does not know yet (owner decision 13)", "SOMETHING_NEW"],
  ])("accepts as before when every line %s", async (_, verdict) => {
    backend(withVerdict(verdict));
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);
    expect(await screen.findByRole("button", { name: "Chấp nhận báo giá" })).toBeEnabled();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(screen.queryByText("Đã ngừng bán")).not.toBeInTheDocument();
  });

  it("explains without a button to an account that may not answer", async () => {
    permissions = [PERM.quotesRead];
    backend(withVerdict("PRODUCT_INACTIVE"));
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);
    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yêu cầu sửa" })).not.toBeInTheDocument();
  });

  it("shows the BE's SKU_NOT_SELLABLE message once the re-read quote blocks accepting", async () => {
    let current: Record<string, unknown> = beSentQuote;
    backend(() => current);
    const message =
      "Dòng 1 (LY-GIAY-DEMO-12OZ-XANH) đã ngừng bán nên chưa chấp nhận được báo giá. Hãy yêu cầu Sale sửa báo giá.";
    vi.spyOn(api, "post").mockImplementation(async () => {
      current = withVerdict("PRODUCT_DISCONTINUED");
      throw new ApiError(409, "SKU_NOT_SELLABLE", message);
    });
    const user = userEvent.setup();
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    await user.click(await screen.findByRole("button", { name: "Chấp nhận báo giá" }));
    await user.click(await screen.findByRole("button", { name: "Chấp nhận" }));

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("button", { name: "Chấp nhận báo giá" })).not.toBeInTheDocument();
  });
});

describe("QuoteDetailScreen — asking for changes", () => {
  it("requires the feedback, then sends { version, feedback }", async () => {
    backend(beSentQuote);
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValue({ data: { ...beSentQuote, status: "CHANGES_REQUESTED", version: 4 } });
    const user = userEvent.setup();
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    await user.click(await screen.findByRole("button", { name: "Yêu cầu sửa" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu sửa" }));
    expect(
      await within(dialog).findByText("Hãy ghi rõ bạn muốn sửa gì trong báo giá."),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/Nội dung cần sửa/), "Giảm giá bậc 50 thùng");
    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu sửa" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/quotes/${quoteId}/change-request`, {
        version: 3,
        feedback: "Giảm giá bậc 50 thùng",
      }),
    );
  });

  it.each([
    ["INVALID_QUOTE_TRANSITION", 409, "Báo giá đang được Sale sửa: chưa thể trả lời.", 1],
    ["VALIDATION_FAILED", 400, "Nội dung yêu cầu sửa quá dài.", 2],
  ])(
    "a %s refusal: said once when the toast says it, inline otherwise",
    async (code, status, text, times) => {
      backend(beSentQuote);
      vi.spyOn(api, "post").mockRejectedValue(new ApiError(status, code, text));
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <ToastProvider />
          <QuoteDetailScreen quoteId={quoteId} />
        </>,
      );
      await user.click(await screen.findByRole("button", { name: "Yêu cầu sửa" }));
      const dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByLabelText(/Nội dung cần sửa/), "Giảm giá");
      await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu sửa" }));
      if (times === 1) {
        expect(await screen.findByText(text)).toBeInTheDocument();
        expect(screen.getAllByText(text)).toHaveLength(1);
        expect(within(dialog).queryByText(text)).not.toBeInTheDocument();
      } else {
        // Not a toasted code: the dialog says it itself.
        expect(await within(dialog).findByText(text)).toBeInTheDocument();
      }
    },
  );
});

const revising = {
  ...beSentQuote,
  status: "CHANGES_REQUESTED",
  validUntil: "2020-01-01T00:00:00Z",
  customerFeedback: "Xin thêm mốc giá",
  history: [
    { revision: 1, toStatus: "DRAFT", changedAt: "2099-11-19T02:00:00Z" },
    { revision: 1, fromStatus: "DRAFT", toStatus: "SENT", changedAt: "2099-11-20T02:00:00Z" },
    {
      revision: 1,
      fromStatus: "SENT",
      toStatus: "CHANGES_REQUESTED",
      changedAt: "2099-11-21T02:00:00Z",
    },
    {
      revision: 2,
      fromStatus: "CHANGES_REQUESTED",
      toStatus: "DRAFT",
      changedAt: "2099-11-22T02:00:00Z",
    },
  ],
};

describe("QuoteDetailScreen — a quote Sale is revising (PR #388)", () => {
  it("báo giá đang sửa không hiện Hiệu lực đến và không có nút", async () => {
    backend(revising);
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    expect(
      await screen.findByText(/Sale đang soạn bản sửa theo yêu cầu của bạn/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Hiệu lực đến")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chấp nhận báo giá" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yêu cầu sửa" })).not.toBeInTheDocument();
  });

  it("hides the Nháp rows of the history", async () => {
    backend(revising);
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    const history = (await screen.findByRole("heading", { name: "Lịch sử" })).closest("section")!;
    expect(within(history).queryByText(/^Nháp/)).not.toBeInTheDocument();
    expect(within(history).getAllByRole("listitem")).toHaveLength(2);
  });

  it("hiện câu beingRevised của BE sau khi form biến mất", async () => {
    let current: Record<string, unknown> = beSentQuote;
    backend(() => current);
    const beingRevised = "Báo giá QT-20261120-9001 đang được Sale sửa: chưa thể trả lời.";
    vi.spyOn(api, "post").mockImplementation(async () => {
      current = revising;
      throw new ApiError(409, "INVALID_QUOTE_TRANSITION", beingRevised);
    });
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ToastProvider />
        <QuoteDetailScreen quoteId={quoteId} />
      </>,
    );

    await screen.findByRole("spinbutton", { name: /^Số thùng – dòng \d+ \(/ });
    await user.click(screen.getByRole("button", { name: "Chấp nhận báo giá" }));
    await user.click(await screen.findByRole("button", { name: "Chấp nhận" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Chấp nhận báo giá" })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText(beingRevised)).toBeInTheDocument();
  });

  it("INVALID_QUOTE_TRANSITION is said once (the toast), not again inside the form", async () => {
    backend(beSentQuote);
    const refusal = "Báo giá QT-20261120-9001 đã thay đổi: chưa thể trả lời.";
    vi.spyOn(api, "post").mockRejectedValue(new ApiError(409, "INVALID_QUOTE_TRANSITION", refusal));
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ToastProvider />
        <QuoteDetailScreen quoteId={quoteId} />
      </>,
    );

    await screen.findByRole("spinbutton", { name: /^Số thùng – dòng \d+ \(/ });
    await user.click(screen.getByRole("button", { name: "Chấp nhận báo giá" }));
    await user.click(await screen.findByRole("button", { name: "Chấp nhận" }));

    expect(await screen.findByText(refusal)).toBeInTheDocument();
    expect(screen.getAllByText(refusal)).toHaveLength(1);
    expect(screen.queryByText("Chưa chấp nhận được báo giá.")).not.toBeInTheDocument();
  });

  it("CONVERTED without an order yet says Sale is drawing up the contract", async () => {
    backend({ ...beSentQuote, status: "CONVERTED" });
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);
    expect(
      await screen.findByText(/Sale đang lập hợp đồng; bạn sẽ nhận hợp đồng để ký/),
    ).toBeInTheDocument();
  });
});

describe("QuoteDetailScreen — the PDF", () => {
  let pdfAccept = "";
  const originalAdapter = api.defaults.adapter;
  afterEach(() => {
    if (originalAdapter) api.defaults.adapter = originalAdapter;
    pdfAccept = "";
  });

  const pdfFailure = (status: number, errorCode: string, message: string) => {
    vi.spyOn(window, "open").mockReturnValue({ close: vi.fn() } as unknown as Window);
    api.defaults.adapter = async (config) => {
      const ok = (data: unknown) => ({ data, status: 200, statusText: "OK", headers: {}, config });
      if (config.url === "/identity/me/permissions") {
        return ok({ roles: ["CUSTOMER"], permissions, dataScope: "OWN" });
      }
      if (config.url === `/quotes/${quoteId}`) return ok(beSentQuote);
      pdfAccept = String(config.headers.get("Accept"));
      throw new AxiosError("failed", undefined, config, undefined, {
        data: new Blob([JSON.stringify({ success: false, errorCode, message })], {
          type: "application/json",
        }),
        status,
        statusText: "",
        headers: {},
        config,
      });
    };
  };

  it("PDF lỗi 503 JSON → hiện câu BE", async () => {
    pdfFailure(503, "SELLER_PROFILE_UNAVAILABLE", "Seller profile is not configured");
    const user = userEvent.setup();
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    await user.click(await screen.findByRole("button", { name: /Tải PDF báo giá/ }));
    expect(
      await screen.findByText("Chưa tạo được file PDF lúc này. Vui lòng thử lại sau."),
    ).toBeInTheDocument();
    expect(pdfAccept).toBe("application/pdf, application/json");
  });

  it("PDF lỗi 404 NOT_FOUND hiện câu không tìm thấy", async () => {
    pdfFailure(404, "NOT_FOUND", "Không tìm thấy báo giá");
    const user = userEvent.setup();
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    await user.click(await screen.findByRole("button", { name: /Tải PDF báo giá/ }));
    expect(
      await screen.findByText(
        "Không tìm thấy báo giá, hoặc báo giá không thuộc tài khoản của bạn.",
      ),
    ).toBeInTheDocument();
  });
});
