import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignListScreen } from "../components/design-list-screen";
import type { DesignableCatalogue } from "../components/new-design-dialog";
import { designBackend } from "./design-backend";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: env.push }) }));

beforeEach(async () => {
  env.push.mockReset();
  signIn();
  await designBackend();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const LIST = { name: "Danh sách thiết kế" } as const;
/**
 * The first read of the list: the design mock answers each request after ~0.2 s, and on a loaded
 * parallel run that went past `findBy`'s default 1 s.
 */
const FIRST_READ = { timeout: 3000 } as const;

/** The card of a design, found by its name. */
async function cardOf(name: string) {
  const list = await screen.findByRole("list", LIST, FIRST_READ);
  const heading = await within(list).findByRole("heading", { name });
  return within(heading.closest("li") as HTMLElement);
}

/** Opens a card's "⋯" menu (everything but its main button lives there) and returns the open menu. */
async function menuOf(card: ReturnType<typeof within>) {
  await userEvent.click(card.getByRole("button", { name: /Thao tác khác/ }));
  return within(await screen.findByRole("menu"));
}
const closeMenu = () => userEvent.keyboard("{Escape}");

/** The catalogue as "Thiết kế mới" gets it: these tests do not open the dialog. */
const catalogue: DesignableCatalogue = {
  status: "ready",
  products: [],
  stale: false,
  more: null,
  onSearch: () => undefined,
};

const render = (searchParams = "", onUrlUpdate?: OnUrlUpdateFunction) =>
  renderWithProviders(<DesignListScreen catalogue={catalogue} />, {
    searchParams,
    ...(onUrlUpdate ? { onUrlUpdate } : {}),
  });

describe("DesignListScreen", () => {
  // Ruling R18: the design mock never answers 401, so the list itself asks for a session.
  it("asks a signed-out visitor to sign in, brings them back, and reads nothing", async () => {
    signOut();
    const get = vi.spyOn(api, "get"); // the client the backend of `beforeEach` serves
    render();

    expect(await screen.findByText("Đăng nhập để bắt đầu thiết kế")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent("/design")}`,
    );
    expect(screen.queryByRole("button", { name: /Thiết kế mới/ })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows a card per listed status, never an archived design", async () => {
    render();

    const list = await screen.findByRole("list", LIST, FIRST_READ);
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
    expect(card.queryByText("Bị trả lại")).not.toBeInTheDocument();
    expect((await menuOf(card)).getByRole("menuitem", { name: /Xoá/ })).toBeInTheDocument();
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
    expect(card.queryByRole("link", { name: /Tiếp tục thiết kế/ })).not.toBeInTheDocument();
    const menu = await menuOf(card);
    expect(menu.queryByRole("menuitem", { name: /Xoá/ })).not.toBeInTheDocument();
    expect(menu.queryByRole("menuitem", { name: /Tạo bản sửa/ })).not.toBeInTheDocument();
  });

  it("an approved design can be viewed or revised, and a revision opens its new draft", async () => {
    render();
    const card = await cardOf("Ly cà phê Nhà Mình 12oz");

    expect(card.getByText("Đã duyệt")).toBeInTheDocument();
    const menu = await menuOf(card);
    expect(menu.getByRole("menuitem", { name: /^Xem/ })).toBeInTheDocument();
    await userEvent.click(menu.getByRole("menuitem", { name: /Tạo bản sửa/ }));

    await waitFor(() => expect(env.push).toHaveBeenCalledTimes(1));
    expect(env.push.mock.calls[0]?.[0]).toMatch(/^\/design\/[0-9a-f-]{36}$/);
    expect(env.push.mock.calls[0]?.[0]).not.toContain("7d51f000-0000-4000-8000-000000000004");
  });

  it("deletes a draft after confirmation: the card goes", async () => {
    render();
    const card = await cardOf("Túi kraft tiệm bánh Hoa");
    await userEvent.click((await menuOf(card)).getByRole("menuitem", { name: /Xoá/ }));

    const dialog = await screen.findByRole("dialog", { name: "Xoá bản nháp này?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Xoá bản nháp" }));

    await waitFor(() =>
      expect(screen.queryByText("Túi kraft tiệm bánh Hoa")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog and says why when the draft was submitted in another tab", async () => {
    const backend = await designBackend();
    render();
    const card = await cardOf("Túi kraft tiệm bánh Hoa");
    await userEvent.click((await menuOf(card)).getByRole("menuitem", { name: /Xoá/ }));
    const dialog = await screen.findByRole("dialog", { name: "Xoá bản nháp này?" });

    // Another tab submits it first, so the version and status the card holds are stale.
    backend.post.mockRejectedValueOnce(new ApiError(409, "DESIGN_NOT_DRAFT", "x"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Xoá bản nháp" }));

    expect(
      await within(dialog).findByText("Thiết kế đã chuyển trạng thái, hãy tải lại."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Xoá bản nháp này?" })).toBeInTheDocument();
  });

  it("after a 409 it disables 'Xoá', re-reads the list and offers 'Đóng' (L3)", async () => {
    const backend = await designBackend();
    render();
    const card = await cardOf("Túi kraft tiệm bánh Hoa");
    await userEvent.click((await menuOf(card)).getByRole("menuitem", { name: /Xoá/ }));
    const dialog = await screen.findByRole("dialog", { name: "Xoá bản nháp này?" });
    const listReads = () => backend.get.mock.calls.filter(([url]) => url === "/designs").length;
    const readsBefore = listReads();

    backend.post.mockRejectedValueOnce(new ApiError(409, "DESIGN_NOT_DRAFT", "x"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Xoá bản nháp" }));

    expect(
      await within(dialog).findByText("Thiết kế đã chuyển trạng thái, hãy tải lại."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Xoá bản nháp" })).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Giữ lại" })).not.toBeInTheDocument();
    await waitFor(() => expect(listReads()).toBeGreaterThan(readsBefore));

    await userEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // The delete is a POST to /archive: it was sent once (refused).
    expect(
      backend.post.mock.calls.filter(([url]) => String(url).endsWith("/archive")),
    ).toHaveLength(1);
  });

  it("disables every 'Tạo bản sửa' while one revision is being created (L4)", async () => {
    const backend = await designBackend();
    // A second approved design: the reviewer approves the one waiting for review.
    settle(await backend.store.simulateApprove(MOCK_DESIGN_IDS.pending));
    // The first revision is never answered: it stays pending for the rest of the test.
    backend.post.mockImplementationOnce(() => new Promise(() => undefined));
    render();
    const first = await cardOf("Ly cà phê Nhà Mình 12oz");
    const second = await cardOf("Ly trà sữa Mây 500ml");

    await userEvent.click((await menuOf(first)).getByRole("menuitem", { name: /Tạo bản sửa/ }));

    let menu = await menuOf(first);
    expect(menu.getByRole("menuitem", { name: /Tạo bản sửa/ })).toHaveAttribute("data-disabled");
    expect(menu.getByText("Đang tạo...")).toBeInTheDocument();
    await closeMenu();
    menu = await menuOf(second);
    expect(menu.getByRole("menuitem", { name: /Tạo bản sửa/ })).toHaveAttribute("data-disabled");
    expect(menu.queryByText("Đang tạo...")).not.toBeInTheDocument();
  });

  describe("a revision that fails (L4)", () => {
    const failRevision = async () => {
      const backend = await designBackend();
      backend.post.mockRejectedValueOnce(new ApiError(409, "DESIGN_NOT_DRAFT", "x"));
      render();
      const card = await cardOf("Ly cà phê Nhà Mình 12oz");
      await userEvent.click((await menuOf(card)).getByRole("menuitem", { name: /Tạo bản sửa/ }));
      expect(
        await screen.findByText("Thiết kế đã chuyển trạng thái, hãy tải lại."),
      ).toBeInTheDocument();
    };

    it("says why, and the customer can dismiss it", async () => {
      await failRevision();
      await userEvent.click(screen.getByRole("button", { name: "Đóng thông báo" }));
      expect(
        screen.queryByText("Thiết kế đã chuyển trạng thái, hãy tải lại."),
      ).not.toBeInTheDocument();
    });

    it("clears the message on the next action", async () => {
      await failRevision();
      await userEvent.click(screen.getByRole("tab", { name: "Bản nháp" }));
      expect(
        screen.queryByText("Thiết kế đã chuyển trạng thái, hãy tải lại."),
      ).not.toBeInTheDocument();
    });

    it("lets the customer try again: 'Tạo bản sửa' is on again", async () => {
      await failRevision();
      const card = await cardOf("Ly cà phê Nhà Mình 12oz");
      expect(
        (await menuOf(card)).getByRole("menuitem", { name: /Tạo bản sửa/ }),
      ).not.toHaveAttribute("data-disabled");
    });
  });

  it("keeps every 'Tạo bản sửa' off once the revision is made, until its studio opens", async () => {
    const backend = await designBackend();
    settle(await backend.store.simulateApprove(MOCK_DESIGN_IDS.pending));
    render();
    const first = await cardOf("Ly cà phê Nhà Mình 12oz");
    const second = await cardOf("Ly trà sữa Mây 500ml");

    const before = within(screen.getByRole("list", LIST)).getAllByRole("listitem").length;
    await userEvent.click((await menuOf(first)).getByRole("menuitem", { name: /Tạo bản sửa/ }));
    // The navigation is asked for; the test router never takes the list away.
    await waitFor(() => expect(env.push).toHaveBeenCalledTimes(1));
    // The list re-reads after the revision: wait for the new draft's card, then look again.
    await waitFor(() =>
      expect(within(screen.getByRole("list", LIST)).getAllByRole("listitem")).toHaveLength(
        before + 1,
      ),
    );

    let menu = await menuOf(first);
    expect(menu.getByRole("menuitem", { name: /Tạo bản sửa/ })).toHaveAttribute("data-disabled");
    await closeMenu();
    menu = await menuOf(second);
    expect(menu.getByRole("menuitem", { name: /Tạo bản sửa/ })).toHaveAttribute("data-disabled");
  });

  it("puts the tab in the URL and resets the page when it changes", async () => {
    const onUrlUpdate = vi.fn();
    render("?page=2", onUrlUpdate);
    // Page 2 is past the end: the list comes back to page 1 and shows its cards.
    const list = await screen.findByRole("list", LIST);
    expect(await within(list).findAllByRole("listitem")).toHaveLength(4);

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
