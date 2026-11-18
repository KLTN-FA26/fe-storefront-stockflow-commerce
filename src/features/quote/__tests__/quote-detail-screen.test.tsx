import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    .getAllByRole("spinbutton", { name: "Số thùng" })
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

describe("QuoteDetailScreen — accepting (TC-F03-01)", () => {
  it("shows the lines with pieces, MOQ, the tier that applies and the total with tax", async () => {
    backend(beSentQuote);
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    const line = (await screen.findByText("LY-GIAY-DEMO-12OZ-XANH", { selector: "span" })).closest(
      "li",
    )!;
    expect(within(line).getByText("= 60.000 cái")).toBeInTheDocument();
    expect(within(line).getByText("MOQ: 20 thùng")).toBeInTheDocument();
    expect(
      within(line)
        .getByText(/Từ 50 thùng/)
        .closest("li"),
    ).toHaveAttribute("aria-current", "true");
    expect(within(line).getByText(/69\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText("Tổng có thuế (tạm tính)").nextElementSibling).toHaveTextContent(
      /76\.140\.000/,
    );
  });

  it("blocks cartons below the MOQ in the form: no request reaches the BE", async () => {
    backend(beSentQuote);
    const post = vi.spyOn(api, "post");
    const user = userEvent.setup();
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    const input = await screen.findByRole("spinbutton", { name: "Số thùng" });
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

    const input = await screen.findByRole("spinbutton", { name: "Số thùng" });
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

    await screen.findAllByRole("spinbutton", { name: "Số thùng" });
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
    renderWithProviders(<QuoteDetailScreen quoteId={quoteId} />);

    await screen.findByRole("spinbutton", { name: "Số thùng" });
    const reads = () => get.mock.calls.filter(([url]) => url === `/quotes/${quoteId}`).length;
    const before = reads();
    await user.click(screen.getByRole("button", { name: "Chấp nhận báo giá" }));
    await user.click(await screen.findByRole("button", { name: "Chấp nhận" }));

    expect(await screen.findByText(/Dữ liệu vừa thay đổi, đã tải lại/)).toBeInTheDocument();
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

    await screen.findByRole("spinbutton", { name: "Số thùng" });
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
});
