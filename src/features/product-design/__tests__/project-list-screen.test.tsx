import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OnUrlUpdateFunction } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders, signIn, signOut } from "@/test/render";

import { ApiError } from "@/lib/api/error";
import { DesignListScreen } from "../components/design-list-screen";
import type { DesignableCatalogue } from "../components/new-design-dialog";
import { describeDesignError } from "../errors";
import { DesignCard } from "../components/design-card";
import { ProjectListScreen } from "../components/project-list-screen";
import { designBackend, type DesignBackend } from "./design-backend";
import { design } from "./fixtures";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push }),
  usePathname: () => "/design/projects",
}));

let backend: DesignBackend;
beforeEach(async () => {
  env.push.mockReset();
  signIn();
  backend = await designBackend();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const FIRST_READ = { timeout: 3000 } as const;

const render = (searchParams = "", onUrlUpdate?: OnUrlUpdateFunction) =>
  renderWithProviders(<ProjectListScreen />, {
    searchParams,
    ...(onUrlUpdate ? { onUrlUpdate } : {}),
  });

const makeProjects = (count: number) =>
  Promise.all(
    Array.from({ length: count }, (_, i) =>
      backend.post("/design-projects", { name: `Dự án ${i + 1}`, description: "Bộ ly" }),
    ),
  );

describe("ProjectListScreen", () => {
  it("asks a signed-out visitor to sign in", async () => {
    signOut();
    render();
    expect(await screen.findByText("Đăng nhập để bắt đầu thiết kế")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent("/design/projects")}`,
    );
  });

  it("switches between the designs and the projects", async () => {
    render();
    const nav = screen.getByRole("navigation", { name: "Chuyển mục thiết kế" });
    expect(within(nav).getByRole("link", { name: "Thiết kế của tôi" })).toHaveAttribute(
      "href",
      "/design",
    );
    expect(within(nav).getByRole("link", { name: "Dự án" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows a card with its name, count, creation time, status and link", async () => {
    const [created] = await makeProjects(1);
    render();
    const list = await screen.findByRole("list", { name: "Danh sách dự án" }, FIRST_READ);
    const item = within(within(list).getByRole("listitem"));
    expect(item.getByRole("heading", { name: "Dự án 1" })).toBeInTheDocument();
    expect(item.getByText("Bộ ly")).toBeInTheDocument();
    expect(item.getByText("0 bản thiết kế (tối đa 20)")).toBeInTheDocument();
    expect(item.getByText("Đang dùng")).toBeInTheDocument();
    expect(item.getByText(/^Tạo lúc \d/)).toBeInTheDocument();
    const id = (created as { data: { id: string } }).data.id;
    expect(item.getByRole("link", { name: "Mở dự án Dự án 1" })).toHaveAttribute(
      "href",
      `/design/projects/${id}`,
    );
  });

  it("shows the skeleton before the first read", () => {
    render();
    expect(screen.getByRole("status", { name: "Đang tải danh sách dự án" })).toBeInTheDocument();
  });

  it("shows an alert and Thử lại on a server error, and the retry recovers", async () => {
    await makeProjects(1);
    // A 5xx is retried twice (retryTransient, 1 s then 2 s) before the error shows.
    for (let i = 0; i < 3; i += 1) {
      backend.get.mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "boom"));
    }
    render();
    expect(
      await screen.findByText("Không tải được danh sách dự án", {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("heading", { name: "Dự án 1" }, FIRST_READ)).toBeInTheDocument();
    expect(screen.queryByText("Không tải được danh sách dự án")).not.toBeInTheDocument();
  }, 20000);

  it("does not show the cards of the other tab while a tab loads", async () => {
    const [first] = await makeProjects(2);
    const id = (first as { data: { id: string } }).data.id;
    await backend.post(`/design-projects/${id}/archive`, { version: 0 });
    render();
    await screen.findByRole("list", { name: "Danh sách dự án" }, FIRST_READ);
    await userEvent.click(screen.getByRole("tab", { name: "Đã đóng" }));
    expect(screen.queryByRole("list", { name: "Danh sách dự án" })).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Đang tải danh sách dự án" })).toBeInTheDocument();
    expect(
      await screen.findByText("Đã đóng", { selector: "span" }, FIRST_READ),
    ).toBeInTheDocument();
  });

  it("goes back to page 1 when the tab changes", async () => {
    await makeProjects(13);
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    render("?page=2", onUrlUpdate);
    await screen.findByRole("list", { name: "Danh sách dự án" }, FIRST_READ);
    await userEvent.click(screen.getByRole("tab", { name: "Đã đóng" }));
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const last = onUrlUpdate.mock.calls.at(-1)![0];
    expect(last.searchParams.get("tab")).toBe("archived");
    expect(last.searchParams.has("page")).toBe(false);
  });

  it("keeps the tab and the page in the URL", async () => {
    await makeProjects(13);
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    render("", onUrlUpdate);
    await screen.findByRole("list", { name: "Danh sách dự án" }, FIRST_READ);
    await userEvent.click(await screen.findByRole("button", { name: "Trang sau" }));
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.get("page")).toBe("2");
  });

  it("explains what a project is for when there is none", async () => {
    render();
    expect(await screen.findByText("Bạn chưa có dự án nào", {}, FIRST_READ)).toBeInTheDocument();
    expect(screen.getByText(/gom các bản thiết kế/)).toBeInTheDocument();
  });

  it("tells an empty Đã đóng tab apart from having no project", async () => {
    await makeProjects(1);
    render("?tab=archived");
    expect(
      await screen.findByText("Chưa có dự án nào đã đóng", {}, FIRST_READ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Bạn chưa có dự án nào")).not.toBeInTheDocument();
  });

  describe("Tạo dự án", () => {
    async function openDialog() {
      render();
      await userEvent.click(await screen.findByRole("button", { name: /Tạo dự án/ }));
      return screen.findByRole("dialog");
    }

    it("marks the name as required with a red asterisk and the optional description in words (S01-14)", async () => {
      const dialog = await openDialog();
      const name = within(dialog).getByLabelText("Tên dự án");
      expect(name).toHaveAttribute("aria-required", "true");
      expect(document.querySelector(`label[for="${name.id}"]`)).toHaveClass(
        "after:content-['*']",
        "after:text-danger",
      );
      expect(within(dialog).getByLabelText("Mô tả (không bắt buộc)")).not.toHaveAttribute(
        "aria-required",
      );
    });

    it("refuses an empty name", async () => {
      const dialog = await openDialog();
      await userEvent.click(within(dialog).getByRole("button", { name: "Tạo dự án" }));
      expect(await within(dialog).findByText("Hãy đặt tên cho dự án")).toBeInTheDocument();
      expect(env.push).not.toHaveBeenCalled();
    });

    it("refuses a name of more than 200 characters", async () => {
      const dialog = await openDialog();
      await userEvent.click(within(dialog).getByLabelText("Tên dự án"));
      await userEvent.paste("a".repeat(201));
      await userEvent.click(within(dialog).getByRole("button", { name: "Tạo dự án" }));
      expect(await within(dialog).findByText("Tên tối đa 200 ký tự")).toBeInTheDocument();
      expect(env.push).not.toHaveBeenCalled();
    });

    it("keeps the button disabled while the project is being made", async () => {
      const dialog = await openDialog();
      backend.post.mockImplementationOnce(() => new Promise(() => undefined));
      await userEvent.type(within(dialog).getByLabelText("Tên dự án"), "Bộ ly quán Hoa");
      await userEvent.click(within(dialog).getByRole("button", { name: "Tạo dự án" }));
      const busy = await within(dialog).findByRole("button", { name: "Đang tạo..." });
      expect(busy).toBeDisabled();
      await userEvent.click(busy);
      expect(backend.post).toHaveBeenCalledTimes(1);
      expect(env.push).not.toHaveBeenCalled();
    });

    it("shows why a refused create failed and does not open anything", async () => {
      const dialog = await openDialog();
      const error = new ApiError(422, "PROJECT_ARCHIVED", "x");
      backend.post.mockRejectedValueOnce(error);
      await userEvent.type(within(dialog).getByLabelText("Tên dự án"), "Bộ ly quán Hoa");
      await userEvent.click(within(dialog).getByRole("button", { name: "Tạo dự án" }));
      expect(await within(dialog).findByText(describeDesignError(error))).toBeInTheDocument();
      expect(env.push).not.toHaveBeenCalled();
      expect(within(dialog).getByRole("button", { name: "Tạo dự án" })).toBeEnabled();
    });

    it("puts a field error of the server on the name", async () => {
      const dialog = await openDialog();
      backend.post.mockRejectedValueOnce(
        new ApiError(422, "VALIDATION_FAILED", "x", { name: "Tên đã được dùng" }),
      );
      await userEvent.type(within(dialog).getByLabelText("Tên dự án"), "Bộ ly quán Hoa");
      await userEvent.click(within(dialog).getByRole("button", { name: "Tạo dự án" }));
      expect(await within(dialog).findByText("Tên đã được dùng")).toBeInTheDocument();
    });

    it("creates the project and opens it", async () => {
      const dialog = await openDialog();
      await userEvent.type(within(dialog).getByLabelText("Tên dự án"), "Bộ ly quán Hoa");
      await userEvent.click(within(dialog).getByRole("button", { name: "Tạo dự án" }));
      await waitFor(() => expect(env.push).toHaveBeenCalledTimes(1), FIRST_READ);
      expect(env.push).toHaveBeenCalledWith(expect.stringMatching(/^\/design\/projects\/.+/));
    });
  });
});

describe("DesignCard project label", () => {
  const props = { onDelete: vi.fn(), onRevise: vi.fn() };
  const project = {
    id: "7a1b0000-0000-4000-8000-0000000000b1",
    name: "Bộ ly quán Hoa",
    status: "ACTIVE" as const,
  };

  it("names the project of a design", () => {
    renderWithProviders(<DesignCard {...props} design={design({ project })} />);
    expect(screen.getByText("Dự án: Bộ ly quán Hoa")).toBeInTheDocument();
  });

  it("shows no label for a design outside any project", () => {
    renderWithProviders(<DesignCard {...props} design={design({ project: null })} />);
    expect(screen.queryByText(/^Dự án:/)).not.toBeInTheDocument();
  });
});

describe("DesignListScreen section switch", () => {
  const catalogue: DesignableCatalogue = {
    status: "ready",
    products: [],
    stale: false,
    more: null,
    onSearch: () => undefined,
  };
  const check = () => {
    const nav = screen.getByRole("navigation", { name: "Chuyển mục thiết kế" });
    expect(within(nav).getByRole("link", { name: "Dự án" })).toHaveAttribute(
      "href",
      "/design/projects",
    );
    expect(within(nav).getByRole("link", { name: "Thiết kế của tôi" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  };

  it("is shown signed in", () => {
    renderWithProviders(<DesignListScreen catalogue={catalogue} />);
    check();
  });

  it("is shown signed out", () => {
    signOut();
    renderWithProviders(<DesignListScreen catalogue={catalogue} />);
    check();
  });
});
