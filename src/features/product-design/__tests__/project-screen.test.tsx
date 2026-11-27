import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { addDesignToProject, archiveProject, createProject } from "../api";
import { OpenRoundBanner } from "../components/open-round-banner";
import { ProjectScreen } from "../components/project-screen";
import type { DesignableCatalogue } from "../components/new-design-dialog";
import type { Design } from "../types";
import { designBackend, draftIn, STUDIO_PRODUCTS, type DesignBackend } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

const env = vi.hoisted(() => ({
  push: vi.fn(),
  loadDesignSession: vi.fn(),
  events: [] as string[],
  signals: [] as (AbortSignal | undefined)[],
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push }),
  usePathname: () => "/design/projects/x",
  useParams: () => ({}),
}));
// The design API is on the mock (the server flag, threaded by context): the panel shows.
vi.mock("@/providers/app-providers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/providers/app-providers")>();
  return { ...actual, useIsDesignMock: () => true };
});
// The session is the heavy part (canvases, fonts, WebGL): faked, so the render step runs for real.
vi.mock("../components/studio/load-design-session", () => ({
  loadDesignSession: env.loadDesignSession,
}));

const WAIT = { timeout: 4000 };
vi.setConfig({ testTimeout: 30_000 });
const { draft, returned, pending, approved } = MOCK_DESIGN_IDS;

let backend: DesignBackend;
beforeEach(async () => {
  env.push.mockReset();
  env.loadDesignSession.mockReset();
  env.events.length = 0;
  env.signals.length = 0;
  signIn();
  backend = await designBackend();
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

const catalogue: DesignableCatalogue = {
  status: "ready",
  products: [
    { slug: "ly-giay-2-lop-12oz", title: "Ly giấy 2 lớp 12oz", skus: ["CUP-PAPER-12OZ-WHT"] },
  ],
  stale: false,
  more: null,
  onSearch: vi.fn(),
  skusOf: async () => ["CUP-PAPER-12OZ-WHT"],
};

const show = (projectId: string) =>
  renderWithProviders(
    <ProjectScreen
      projectId={projectId}
      catalogue={catalogue}
      loadFonts={async () => TEST_FONTS}
    />,
  );

/** A project holding the given designs. */
async function projectWith(...designIds: string[]) {
  const project = await createProject({ name: "Bộ ly quán Hoa", description: "Ba cỡ ly" });
  for (const id of designIds) await addDesignToProject(project.id, id);
  return project;
}

const cardOf = async (name: string) =>
  (
    await within(await screen.findByRole("list", { name: "Các bản trong dự án" }, WAIT)).findByRole(
      "heading",
      { name },
    )
  ).closest("li") as HTMLElement;

/** The seeded designs' names, read once. */
const nameOf = async (id: string) =>
  ((await backend.get(`/designs/${id}`)) as { data: { name: string } }).data.name;
const names = async () => ({
  draft: await nameOf(draft),
  returned: await nameOf(returned),
  pending: await nameOf(pending),
  approved: await nameOf(approved),
});

describe("ProjectScreen", () => {
  it("shows the designs side by side, each with its status", async () => {
    const project = await projectWith(draft, pending);
    const n = await names();
    show(project.id);

    expect(
      await screen.findByRole("heading", { name: "Bộ ly quán Hoa", level: 1 }, WAIT),
    ).toBeInTheDocument();
    expect(screen.getByText("Ba cỡ ly")).toBeInTheDocument();
    expect(screen.getByText("2/20 bản")).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Các bản trong dự án" }, WAIT);
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(await cardOf(n.draft)).getByText("Bản nháp")).toBeInTheDocument();
    expect(within(await cardOf(n.pending)).getByText("Chờ duyệt")).toBeInTheDocument();
  });

  it("locks 'Gỡ khỏi dự án' for a design under review, with the reason, and removes a draft", async () => {
    const project = await projectWith(draft, pending);
    const n = await names();
    show(project.id);

    const pendingCard = within(await cardOf(n.pending));
    expect(pendingCard.getByRole("button", { name: /Gỡ .* khỏi dự án/ })).toBeDisabled();
    expect(pendingCard.getByText("Bản đang chờ duyệt, chưa thể gỡ")).toBeInTheDocument();

    const draftCard = within(await cardOf(n.draft));
    await userEvent.click(draftCard.getByRole("button", { name: /Gỡ .* khỏi dự án/ }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: n.draft })).toBeNull(), WAIT);
    expect(await screen.findByText("1/20 bản", undefined, WAIT)).toBeInTheDocument();
  });

  it("leaves 'Đóng dự án' out while a design is under review, at the Duyệt step (sf-12)", async () => {
    const project = await projectWith(draft, pending);
    show(project.id);
    const steps = await screen.findByRole("region", { name: "Các bước của dự án" }, WAIT);
    expect(within(steps).getByRole("listitem", { current: "step" })).toHaveTextContent("Duyệt");
    expect(screen.queryByRole("button", { name: "Đóng dự án" })).toBeNull();
    // Creating is still offered, no longer the page's primary action.
    expect(screen.getByRole("button", { name: "Tạo bản mới trong dự án" })).toBeInTheDocument();
  });

  it("reaches Báo giá with an approved design: one ask, from the steps, opening its dialog", async () => {
    const project = await projectWith(draft, approved);
    show(project.id);
    const steps = await screen.findByRole("region", { name: "Các bước của dự án" }, WAIT);
    expect(await within(steps).findByRole("listitem", { current: "step" }, WAIT)).toHaveTextContent(
      "Báo giá",
    );
    const ask = await within(steps).findByRole(
      "button",
      { name: "Yêu cầu báo giá cả dự án" },
      WAIT,
    );
    expect(screen.getAllByRole("button", { name: "Yêu cầu báo giá cả dự án" })).toHaveLength(1);
    await userEvent.click(ask);
    expect(await screen.findByRole("dialog", undefined, WAIT)).toBeInTheDocument();
  });

  it("offers 'Đóng dự án' when no design is under review", async () => {
    const project = await projectWith(draft);
    show(project.id);
    expect(await screen.findByRole("button", { name: "Đóng dự án" }, WAIT)).toBeEnabled();
  });

  it("closes the project after a confirmation, and the page turns read-only", async () => {
    const project = await projectWith(draft);
    show(project.id);
    await userEvent.click(await screen.findByRole("button", { name: "Đóng dự án" }, WAIT));
    const dialog = await screen.findByRole("dialog", { name: "Đóng dự án này?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Đóng dự án" }));
    expect(
      await screen.findByText("Dự án đã đóng, chỉ để xem", undefined, WAIT),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đóng dự án" })).toBeNull();
  });

  it("adds an existing design: only those outside every project and not archived are offered", async () => {
    const other = await createProject({ name: "Dự án khác" });
    await addDesignToProject(other.id, returned);
    const project = await projectWith(draft);
    const n = await names();
    show(project.id);

    await userEvent.click(await screen.findByRole("button", { name: "Thêm bản sẵn có" }, WAIT));
    const dialog = await screen.findByRole("dialog", { name: "Thêm bản sẵn có" });
    expect(await within(dialog).findByText(n.approved, undefined, WAIT)).toBeInTheDocument();
    expect(within(dialog).queryByText(n.returned)).toBeNull(); // in another project
    expect(within(dialog).queryByText(n.draft)).toBeNull(); // already here

    await userEvent.click(within(dialog).getByRole("button", { name: `Thêm ${n.approved}` }));
    // The added design leaves the offer; the dialog stays for the next one, then closes.
    await waitFor(() => expect(within(dialog).queryByText(n.approved)).toBeNull(), WAIT);
    await userEvent.keyboard("{Escape}");
    expect(await cardOf(n.approved)).toBeInTheDocument();
    expect(await screen.findByText("2/20 bản", undefined, WAIT)).toBeInTheDocument();
  });

  it("asks the BE for designs in no project (BE-15) and shows what it answers, with no page counter", async () => {
    const full = await createProject({ name: "Đầy" });
    for (let i = 0; i < 20; i += 1) {
      await addDesignToProject(
        full.id,
        await draftIn(backend.store, STUDIO_PRODUCTS.cup, undefined, `Bản ${i}`),
      );
    }
    const project = await createProject({ name: "Trống" });
    const n = await names();
    const get = vi.spyOn(api, "get");
    show(project.id);

    await userEvent.click(await screen.findByRole("button", { name: "Thêm bản sẵn có" }, WAIT));
    const dialog = await screen.findByRole("dialog", { name: "Thêm bản sẵn có" });
    // The 20 designs of the other project are filtered out by the BE: page 1 already has the free one.
    expect(await within(dialog).findByText(n.approved, undefined, WAIT)).toBeInTheDocument();
    expect(within(dialog).queryByText("Không có bản nào để thêm")).toBeNull();
    const asked = get.mock.calls.filter(([url]) => url === "/designs");
    expect(asked).toHaveLength(1);
    expect(asked[0]![1]).toMatchObject({ params: { inProject: false, page: 0 } });
    expect(within(dialog).queryByRole("button", { name: "Trang sau" })).toBeNull();
  });

  it("reads another page only on 'Xem thêm', one request each, nothing hidden between them", async () => {
    const { store } = backend;
    const taken = await createProject({ name: "Đã có chỗ" });
    const target = await createProject({ name: "Trống" });
    const n = await names();
    for (let i = 0; i < 20; i += 1) {
      settle(
        await store.create({ ...STUDIO_PRODUCTS.cup, name: `Đã có ${i}`, projectId: taken.id }),
      );
    }
    for (let i = 0; i < 20; i += 1) {
      settle(await store.create({ ...STUDIO_PRODUCTS.cup, name: `Tự do ${i}` }));
    }
    const get = vi.spyOn(api, "get");
    show(target.id);

    await userEvent.click(await screen.findByRole("button", { name: "Thêm bản sẵn có" }, WAIT));
    const dialog = await screen.findByRole("dialog", { name: "Thêm bản sẵn có" });
    expect(
      await within(dialog).findAllByRole("button", { name: /^Thêm Tự do/ }, WAIT),
    ).toHaveLength(20);
    expect(within(dialog).queryByText(n.approved)).toBeNull(); // on the next page
    expect(within(dialog).queryByText(/^Đã có /)).toBeNull(); // never offered

    await userEvent.click(within(dialog).getByRole("button", { name: "Xem thêm" }));
    expect(await within(dialog).findByText(n.approved, undefined, WAIT)).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).queryByRole("button", { name: "Xem thêm" })).toBeNull(),
    );
    expect(within(dialog).getAllByRole("button", { name: /^Thêm Tự do/ })).toHaveLength(20);
    const pages = get.mock.calls
      .filter(([url]) => url === "/designs")
      .map(([, config]) => (config as { params: { page: number; inProject: boolean } }).params);
    expect(pages).toEqual([
      { page: 0, size: 20, inProject: false },
      { page: 1, size: 20, inProject: false },
    ]);
  });

  it("starts a new design in the project: the new-design flow carries the project id", async () => {
    const project = await projectWith();
    show(project.id);
    await userEvent.click(
      await screen.findByRole("button", { name: "Tạo bản mới trong dự án" }, WAIT),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Ly giấy 2 lớp 12oz" }));
    const sku = await screen.findByRole("radio", { name: "CUP-PAPER-12OZ-WHT" }, WAIT);
    await waitFor(() => expect(sku).toBeEnabled(), WAIT);
    await userEvent.click(sku);
    const start = screen.getByRole("button", { name: "Bắt đầu" });
    await waitFor(() => expect(start).toBeEnabled(), WAIT);
    await userEvent.click(start);
    expect(env.push).toHaveBeenCalledWith(
      `/design/new?product=ly-giay-2-lop-12oz&sku=CUP-PAPER-12OZ-WHT&project=${project.id}`,
    );
  });

  it("locks creating and adding at 20 designs", async () => {
    const project = await createProject({ name: "Đầy" });
    for (let i = 0; i < 20; i += 1) {
      await addDesignToProject(
        project.id,
        await draftIn(backend.store, STUDIO_PRODUCTS.cup, undefined, `Bản ${i}`),
      );
    }
    show(project.id);
    // Left out with the reason said once, not two locked buttons (sf-12).
    expect(await screen.findByText("Dự án đã đủ 20 bản.", undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tạo bản mới trong dự án" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Thêm bản sẵn có" })).toBeNull();
  }, 60000);

  it("hides every add, create and submit control in a closed project", async () => {
    const project = await projectWith(draft, returned);
    await archiveProject(project.id, { version: 0 });
    const n = await names();
    show(project.id);

    expect(
      await screen.findByText("Dự án đã đóng, chỉ để xem", undefined, WAIT),
    ).toBeInTheDocument();
    expect(await cardOf(n.draft)).toBeInTheDocument();
    for (const name of [
      "Tạo bản mới trong dự án",
      "Thêm bản sẵn có",
      "Đóng dự án",
      "Gửi duyệt cả bộ",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
      expect(screen.queryByRole("link", { name })).toBeNull();
    }
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/Đã chọn/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Gỡ .* khỏi dự án/ })).toBeNull();
    // The designs inside still open on their own.
    expect(
      within(await cardOf(n.draft)).getByRole("link", { name: /Tiếp tục thiết kế/ }),
    ).toBeInTheDocument();
  });

  it("shows the selection bar once a draft is chosen, locked with its reason below 2", async () => {
    const project = await projectWith(draft, returned);
    const n = await names();
    show(project.id);

    // Nothing chosen: no bar over the designs, the steps say how to send the set (sf-12).
    expect(
      await screen.findByText(/bấm “Gửi duyệt cả bộ” ở cuối trang/, undefined, WAIT),
    ).toBeInTheDocument();
    expect(screen.queryByText("Đã chọn 0 bản nháp")).toBeNull();
    expect(screen.queryByRole("button", { name: "Gửi duyệt cả bộ" })).toBeNull();

    await userEvent.click(within(await cardOf(n.draft)).getByRole("checkbox"));
    expect(screen.getByText("Đã chọn 1 bản nháp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi duyệt cả bộ" })).toBeDisabled();
    expect(screen.getByText("Chọn ít nhất 2 bản nháp để gửi cả bộ")).toBeInTheDocument();

    await userEvent.click(within(await cardOf(n.returned)).getByRole("checkbox"));
    expect(screen.getByText("Đã chọn 2 bản nháp")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Gửi duyệt cả bộ" });
    // Adding a design to the project moves its version and time (the BE saves the draft), so the
    // page lists them in the order of those times: the set is what counts, not its order.
    const href = new URL(link.getAttribute("href")!, "http://localhost");
    expect(href.pathname).toBe(`/design/projects/${project.id}/submit`);
    expect(href.searchParams.get("ids")?.split(",").toSorted()).toEqual(
      [draft, returned].toSorted(),
    );
    // A device the studio takes (the test DOM is one) is not told; a tablet is, whatever its width.
    expect(screen.queryByText("Cần máy tính để gửi duyệt cả bộ")).not.toBeInTheDocument();
  });

  it("offers a check box on drafts only", async () => {
    const project = await projectWith(draft, pending, approved);
    const n = await names();
    show(project.id);
    expect(within(await cardOf(n.draft)).getByRole("checkbox")).toBeInTheDocument();
    expect(within(await cardOf(n.pending)).queryByRole("checkbox")).toBeNull();
    expect(within(await cardOf(n.approved)).queryByRole("checkbox")).toBeNull();
  });

  it("renames the project in place", async () => {
    const project = await projectWith();
    show(project.id);
    await userEvent.click(
      await screen.findByRole("button", { name: "Sửa tên và mô tả dự án" }, WAIT),
    );
    const box = screen.getByRole("textbox", { name: "Tên dự án" });
    await userEvent.clear(box);
    await userEvent.type(box, "Bộ mới");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(
      await screen.findByRole("heading", { name: "Bộ mới", level: 1 }, WAIT),
    ).toBeInTheDocument();
  });

  it("changes the description in place, and clears it when emptied", async () => {
    const user = userEvent.setup();
    const project = await projectWith();
    show(project.id);
    await user.click(await screen.findByRole("button", { name: "Sửa tên và mô tả dự án" }, WAIT));
    const box = screen.getByRole("textbox", { name: "Mô tả dự án" });
    await user.clear(box);
    await user.type(box, "Mô tả đã sửa");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Mô tả đã sửa", undefined, WAIT)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sửa tên và mô tả dự án" }));
    await user.clear(screen.getByRole("textbox", { name: "Mô tả dự án" }));
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(screen.queryByText("Mô tả đã sửa")).not.toBeInTheDocument(), WAIT);
  });

  it("refuses an empty name when renaming", async () => {
    const project = await projectWith();
    show(project.id);
    await userEvent.click(
      await screen.findByRole("button", { name: "Sửa tên và mô tả dự án" }, WAIT),
    );
    await userEvent.clear(screen.getByRole("textbox", { name: "Tên dự án" }));
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/tên/i);
    expect(screen.getByRole("textbox", { name: "Tên dự án" })).toBeInTheDocument();
  });

  /** One fake session per `loadDesignSession` call; `preview` is the test's to settle. */
  const fakeSessions = (preview: () => Promise<Uint8Array>) => {
    env.loadDesignSession.mockImplementation(async (...args: unknown[]) => {
      env.events.push("load");
      env.signals.push((args[3] as { signal?: AbortSignal } | undefined)?.signal);
      return {
        exportRenderer: { preview },
        release: vi.fn(() => void env.events.push("release")),
      };
    });
  };
  const stubUrl = () =>
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: vi.fn(() => "blob:3d"), revokeObjectURL: vi.fn() }),
    );
  const open3D = async () => {
    const project = await projectWith(draft);
    const n = await names();
    show(project.id);
    await userEvent.click(
      within(await cardOf(n.draft)).getByRole("button", { name: `Xem 3D ${n.draft}` }),
    );
    return { n, dialog: await screen.findByRole("dialog", { name: /Xem 3D/ }) };
  };

  it("loads the 3D view only when 'Xem 3D' is pressed, then lets the session go", async () => {
    fakeSessions(async () => new Uint8Array([1, 2, 3]));
    stubUrl();
    const project = await projectWith(draft);
    const n = await names();
    show(project.id);

    const card = within(await cardOf(n.draft));
    expect(env.loadDesignSession).not.toHaveBeenCalled();
    await userEvent.click(card.getByRole("button", { name: `Xem 3D ${n.draft}` }));
    const dialog = await screen.findByRole("dialog", { name: /Xem 3D/ });
    expect(
      await within(dialog).findByRole("img", { name: `Bản xem trước 3D ${n.draft}` }, WAIT),
    ).toHaveAttribute("src", "blob:3d");
    expect(
      within(dialog).getByText("Màu sắc hiển thị có thể sai lệch so với thành phẩm in thật"),
    ).toBeInTheDocument();
    expect(env.events).toEqual(["load", "release"]);

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:3d"));
    vi.unstubAllGlobals();
  });

  it("says when the 3D view cannot be drawn, lets the session go, and a retry starts after it", async () => {
    let calls = 0;
    fakeSessions(async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return new Uint8Array([1]);
    });
    stubUrl();
    const { dialog } = await open3D();
    expect(
      await within(dialog).findByText("Không dựng được bản xem trước 3D", undefined, WAIT),
    ).toBeInTheDocument();
    expect(env.events).toEqual(["load", "release"]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Thử lại" }));
    expect(await within(dialog).findByRole("img", undefined, WAIT)).toBeInTheDocument();
    // One session at a time: the first let go before the second loaded.
    expect(env.events).toEqual(["load", "release", "load", "release"]);
    vi.unstubAllGlobals();
  });

  it("aborts a 3D view still drawing when the dialog closes, and still lets the session go", async () => {
    fakeSessions(() => new Promise<Uint8Array>(() => undefined));
    stubUrl();
    await open3D();
    await waitFor(() => expect(env.events).toEqual(["load"]), WAIT);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(env.events).toEqual(["load", "release"]), WAIT);
    expect(env.signals[0]?.aborted).toBe(true);
    vi.unstubAllGlobals();
  });

  it("offers the clone button on each design", async () => {
    const project = await projectWith(draft);
    const n = await names();
    show(project.id);
    await userEvent.click(
      within(await cardOf(n.draft)).getByRole("button", { name: /Thao tác khác/ }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: `Nhân bản ${n.draft} sang cỡ khác` }),
    );
    expect(await screen.findByRole("dialog", { name: /Nhân bản/ })).toBeInTheDocument();
  });

  it("shows an empty state for a project with no design", async () => {
    const project = await projectWith();
    show(project.id);
    expect(
      await screen.findByText("Dự án chưa có bản thiết kế nào", undefined, WAIT),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Đã chọn/)).toBeNull();
  });

  it("says 'Không tìm thấy dự án' for a project that does not exist", async () => {
    show("7d51f000-0000-4000-8000-00000000ffff");
    expect(await screen.findByText("Không tìm thấy dự án", undefined, WAIT)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về danh sách dự án" })).toHaveAttribute(
      "href",
      "/design/projects",
    );
  });

  it("asks a visitor to sign in", async () => {
    signOut();
    show("7d51f000-0000-4000-8000-00000000ffff");
    expect(await screen.findByText("Đăng nhập để bắt đầu thiết kế")).toBeInTheDocument();
  });

  it("shows a skeleton before the first read", () => {
    show("7d51f000-0000-4000-8000-00000000ffff");
    expect(screen.getByRole("status", { name: "Đang tải dự án" })).toBeInTheDocument();
  });
});

describe("OpenRoundBanner", () => {
  const round = {
    id: "7d51f000-0000-4000-8000-0000000000a1",
    designIds: [draft, returned, pending],
    openedAt: "2026-11-11T08:30:00Z",
  };
  const designsWith = (...statuses: Design["status"][]) =>
    [draft, returned, pending].map((id, i) => ({ id, status: statuses[i]! }) as Design);

  it("says how many designs still wait, and since when, while the designs are not read", () => {
    renderWithProviders(<OpenRoundBanner round={round} designs={undefined} />);
    expect(
      screen.getByText(/^Lượt duyệt cả bộ gửi lúc .+: còn 3 bản đang chờ\.$/),
    ).toBeInTheDocument();
  });

  it("counts only the round's designs that are still PENDING_REVIEW", () => {
    renderWithProviders(
      <OpenRoundBanner
        round={round}
        designs={designsWith("APPROVED", "PENDING_REVIEW", "DRAFT")}
      />,
    );
    expect(screen.getByText(/: còn 1 bản đang chờ\.$/)).toBeInTheDocument();
  });

  it("does not count a design of the project outside the round", () => {
    const extra = { id: "other", status: "PENDING_REVIEW" } as Design;
    renderWithProviders(
      <OpenRoundBanner
        round={round}
        designs={[...designsWith("APPROVED", "APPROVED", "PENDING_REVIEW"), extra]}
      />,
    );
    expect(screen.getByText(/: còn 1 bản đang chờ\.$/)).toBeInTheDocument();
  });

  it("renders nothing without an open round", () => {
    const { container } = renderWithProviders(<OpenRoundBanner round={null} designs={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("MockReviewPanel on the project page", () => {
  it("keeps clear of the sticky bar while it shows (top on a phone)", async () => {
    const project = await createProject({ name: "Bộ" });
    await addDesignToProject(project.id, draft);
    renderWithProviders(
      <ProjectScreen
        projectId={project.id}
        catalogue={catalogue}
        loadFonts={async () => TEST_FONTS}
      />,
    );
    await userEvent.click(
      within(await cardOf(await nameOf(draft))).getByRole("checkbox", undefined),
    );
    await screen.findByText("Đã chọn 1 bản nháp", undefined, WAIT);
    const trigger = await screen.findByRole(
      "button",
      { name: "Giả lập người duyệt thiết kế" },
      WAIT,
    );
    expect(trigger.parentElement).toHaveClass("top-[calc(var(--header-h)+0.75rem)]");
  });
  it("Xoá dữ liệu mock empties the page it stands on: the project is gone, not kept cached", async () => {
    const user = userEvent.setup();
    const project = await createProject({ name: "Bộ sắp mất" });
    await addDesignToProject(project.id, draft);
    show(project.id);
    await screen.findByRole("heading", { name: "Bộ sắp mất" }, WAIT);

    await user.click(
      await screen.findByRole("button", { name: "Giả lập người duyệt thiết kế" }, WAIT),
    );
    await user.click(await screen.findByRole("button", { name: "Xoá dữ liệu mock" }));
    await user.click(await screen.findByRole("button", { name: "Xoá hết" }));

    expect(await screen.findByText("Không tìm thấy dự án", undefined, WAIT)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bộ sắp mất" })).not.toBeInTheDocument();
  });
});
