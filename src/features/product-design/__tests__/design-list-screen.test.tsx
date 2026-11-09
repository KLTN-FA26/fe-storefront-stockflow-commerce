import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import { renderWithProviders } from "@/test/render";

import { DesignListScreen } from "../components/design-list-screen";
import { designBackend } from "./design-backend";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: env.push }) }));

beforeEach(async () => {
  env.push.mockReset();
  await designBackend();
});
afterEach(() => vi.restoreAllMocks());

const LIST = { name: "Danh sách thiết kế" } as const;

/** The card of a design, found by its name. */
async function cardOf(name: string) {
  const list = await screen.findByRole("list", LIST);
  const heading = await within(list).findByRole("heading", { name });
  return within(heading.closest("li") as HTMLElement);
}

const render = (searchParams = "", onUrlUpdate?: OnUrlUpdateFunction) =>
  renderWithProviders(<DesignListScreen products={[]} />, {
    searchParams,
    ...(onUrlUpdate ? { onUrlUpdate } : {}),
  });

describe("DesignListScreen", () => {
  it("shows the draft count and a card per listed status, never an archived design", async () => {
    render();

    expect(await screen.findByText("2/50 bản nháp")).toBeInTheDocument();
    const list = screen.getByRole("list", LIST);
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByText("Bản nháp cũ")).not.toBeInTheDocument();
  });

  it("a draft can be continued or deleted", async () => {
    render();
    const card = await cardOf("Túi kraft tiệm bánh Hoa");

    expect(card.getByText("Bản nháp")).toBeInTheDocument();
    expect(card.getByRole("link", { name: /Tiếp tục thiết kế/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/design\/7d51f000-/),
    );
    expect(card.getByRole("button", { name: /Xoá/ })).toBeInTheDocument();
    expect(card.queryByText("Bị trả lại")).not.toBeInTheDocument();
  });

  it("a returned draft shows the Bị trả lại badge and the reason", async () => {
    render();
    const card = await cardOf("Ly cà phê Sáng 8oz");

    expect(card.getByText("Bản nháp")).toBeInTheDocument();
    expect(card.getByText("Bị trả lại")).toBeInTheDocument();
    expect(card.getByText(/Chữ quá sát mép trên của thân ly/)).toBeInTheDocument();
  });

  it("a design waiting for review can only be viewed", async () => {
    render();
    const card = await cardOf("Ly trà sữa Mây 500ml");

    expect(card.getByText("Chờ duyệt")).toBeInTheDocument();
    expect(card.getByRole("link", { name: /^Xem/ })).toBeInTheDocument();
    expect(card.queryByRole("button", { name: /Xoá/ })).not.toBeInTheDocument();
    expect(card.queryByRole("link", { name: /Tiếp tục thiết kế/ })).not.toBeInTheDocument();
    expect(card.queryByRole("button", { name: /Tạo bản sửa/ })).not.toBeInTheDocument();
  });

  it("an approved design can be viewed or revised, and a revision opens its new draft", async () => {
    render();
    const card = await cardOf("Ly cà phê Nhà Mình 12oz");

    expect(card.getByText("Đã duyệt")).toBeInTheDocument();
    expect(card.getByRole("link", { name: /^Xem/ })).toBeInTheDocument();
    await userEvent.click(card.getByRole("button", { name: /Tạo bản sửa/ }));

    await waitFor(() => expect(env.push).toHaveBeenCalledTimes(1));
    expect(env.push.mock.calls[0]?.[0]).toMatch(/^\/design\/[0-9a-f-]{36}$/);
    expect(env.push.mock.calls[0]?.[0]).not.toContain("7d51f000-0000-4000-8000-000000000004");
  });

  it("deletes a draft after confirmation: the card goes and the count drops", async () => {
    render();
    const card = await cardOf("Túi kraft tiệm bánh Hoa");
    await userEvent.click(card.getByRole("button", { name: /Xoá/ }));

    const dialog = await screen.findByRole("dialog", { name: "Xoá bản nháp này?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Xoá bản nháp" }));

    await waitFor(() =>
      expect(screen.queryByText("Túi kraft tiệm bánh Hoa")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("1/50 bản nháp")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog and says why when the draft was submitted in another tab", async () => {
    const backend = await designBackend();
    render();
    const card = await cardOf("Túi kraft tiệm bánh Hoa");
    await userEvent.click(card.getByRole("button", { name: /Xoá/ }));
    const dialog = await screen.findByRole("dialog", { name: "Xoá bản nháp này?" });

    // Another tab submits it first, so the version and status the card holds are stale.
    backend.delete.mockRejectedValueOnce(new ApiError(409, "INVALID_STATE", "x"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Xoá bản nháp" }));

    expect(
      await within(dialog).findByText("Thiết kế đã chuyển trạng thái, hãy tải lại."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Xoá bản nháp này?" })).toBeInTheDocument();
  });

  it("puts the tab in the URL and resets the page when it changes", async () => {
    const onUrlUpdate = vi.fn();
    render("?page=2", onUrlUpdate);
    await screen.findByRole("list", LIST).catch(() => undefined);

    await userEvent.click(await screen.findByRole("tab", { name: "Chờ duyệt" }));

    await waitFor(() =>
      expect(onUrlUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ queryString: expect.stringContaining("tab=pending") }),
      ),
    );
    expect(onUrlUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ queryString: expect.not.stringContaining("page=") }),
    );
  });

  it("filters by the tab in the URL", async () => {
    render("?tab=drafts");
    const list = await screen.findByRole("list", LIST);

    expect(screen.getByRole("tab", { name: "Bản nháp" })).toHaveAttribute("aria-selected", "true");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("Ly trà sữa Mây 500ml")).not.toBeInTheDocument();
  });

  it("offers the four tabs", async () => {
    render();
    await screen.findByRole("list", LIST);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Tất cả",
      "Bản nháp",
      "Chờ duyệt",
      "Đã duyệt",
    ]);
  });

  it("shows a skeleton while the first page loads", () => {
    render();
    expect(screen.getByRole("status", { name: "Đang tải danh sách thiết kế" })).toBeInTheDocument();
  });

  describe("empty states", () => {
    /** The account has no design: the list and the draft count answer empty. */
    const emptyAccount = async () => {
      const backend = await designBackend();
      backend.get.mockImplementation(async (url) => {
        if (url === "/designs/draft-count") return { data: { drafts: 0, limit: 50 } };
        return {
          data: {
            items: [],
            page: 0,
            size: 12,
            totalElements: 0,
            totalPages: 0,
            hasNext: false,
            hasPrevious: false,
          },
        };
      });
    };

    it("tells a customer with no designs where to start", async () => {
      await emptyAccount();
      render();

      expect(await screen.findByText("Bạn chưa có thiết kế nào")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Xem sản phẩm" })).toHaveAttribute(
        "href",
        "/catalog",
      );
      expect(screen.getByText("0/50 bản nháp")).toBeInTheDocument();
    });

    it("tells a customer that the tab is empty and lets them leave it", async () => {
      await emptyAccount();
      const onUrlUpdate = vi.fn();
      render("?tab=approved", onUrlUpdate);

      expect(await screen.findByText("Không có thiết kế ở mục này")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Xem tất cả" }));
      expect(onUrlUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ queryString: expect.not.stringContaining("tab=") }),
      );
    });
  });
});
