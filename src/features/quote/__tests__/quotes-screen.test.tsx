import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { QuotesScreen } from "../components/quotes-screen";
import { bePage, beQuoteRow, quoteId } from "./fixtures";

beforeEach(() => signIn());
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

describe("QuotesScreen", () => {
  it("lists the quotes with the Vietnamese status, revision, validity and a link", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({
      data: bePage([
        beQuoteRow,
        {
          ...beQuoteRow,
          id: "5a1e0000-0000-4000-8000-000000000004",
          quoteNumber: "QT-2",
          status: "CONVERTED",
          revision: 2,
        },
      ]),
    });
    renderWithProviders(<QuotesScreen />);

    const card = (await screen.findByText("QT-20261120-9001")).closest("article")!;
    expect(within(card).getByText("Chờ bạn phản hồi")).toBeInTheDocument();
    expect(within(card).getByText("Số 1")).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: "Xem báo giá QT-20261120-9001" }),
    ).toHaveAttribute("href", `/account/quotes/${quoteId}`);
    expect(screen.getByText("Đã tạo đơn")).toBeInTheDocument();
    expect(screen.queryByText("SENT")).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/quotes",
      expect.objectContaining({ params: { page: 0, size: 10 } }),
    );
  });

  it("tells rows apart: what is quoted, its total with VAT, and a SENT quote about to expire", async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    vi.spyOn(api, "get").mockResolvedValue({
      data: bePage([
        {
          ...beQuoteRow,
          validUntil: soon,
          total: 76140000,
          lineCount: 3,
          firstItemName: "Ly cà phê Nhà Mình",
        },
      ]),
    });
    renderWithProviders(<QuotesScreen />);

    const card = (await screen.findByText("QT-20261120-9001")).closest("article")!;
    expect(within(card).getByText("Ly cà phê Nhà Mình · 3 dòng")).toBeInTheDocument();
    expect(within(card).getByText(/76\.140\.000/)).toBeInTheDocument();
    expect(within(card).getByText(/^Còn [12] ngày$/)).toBeInTheDocument();
  });

  it("leaves the expiry chip off a quote far from its deadline or not waiting on the customer", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: bePage([beQuoteRow]) });
    renderWithProviders(<QuotesScreen />);
    const card = (await screen.findByText("QT-20261120-9001")).closest("article")!;
    expect(within(card).queryByText(/^Còn \d+ ngày$/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/Tổng có VAT/)).not.toBeInTheDocument();
  });

  it("sends the status filter of the URL, 0-based page, and says when nothing matches", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: bePage([]) });
    const user = userEvent.setup();
    renderWithProviders(<QuotesScreen />, { searchParams: "?status=EXPIRED&page=2" });

    expect(await screen.findByText("Không có báo giá nào ở trạng thái này")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/quotes",
      expect.objectContaining({ params: { page: 1, size: 10, status: "EXPIRED" } }),
    );
    await user.click(screen.getByRole("button", { name: "Xem tất cả báo giá" }));
    expect(get).toHaveBeenLastCalledWith(
      "/quotes",
      expect.objectContaining({ params: { page: 0, size: 10 } }),
    );
  });

  it("says there is no quote yet when the customer has none", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: bePage([]) });
    renderWithProviders(<QuotesScreen />);
    expect(await screen.findByText("Bạn chưa có báo giá nào")).toBeInTheDocument();
  });

  it("shows a load error with a retry", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new ApiError(400, "UNSUPPORTED_PARAMETER", "bad page"));
    renderWithProviders(<QuotesScreen />);
    expect(await screen.findByText("Không tải được danh sách báo giá")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
  });
});
