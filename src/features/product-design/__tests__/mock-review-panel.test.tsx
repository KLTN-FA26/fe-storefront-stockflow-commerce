import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { formatDateTime } from "@/lib/format";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { MockReviewPanel } from "../components/mock-review-panel";
import { DesignStudio } from "../components/studio/design-studio";
import type { Design } from "../types";
import { designBackend, draftIn, roundIn, STUDIO_PRODUCTS } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

const env = vi.hoisted(() => ({
  pathname: "/design",
  params: {} as Record<string, string>,
  mocked: true,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => env.pathname,
  useParams: () => env.params,
}));
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return {
    ...actual,
    get DESIGN_API_MOCKED() {
      return env.mocked;
    },
  };
});

vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  env.pathname = "/design";
  env.params = {};
  env.mocked = true;
  signIn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 404 })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  signOut();
});

const OPEN = { name: "Giả lập Quản lý kinh doanh" } as const;

/** The studio of a design with the panel beside it, as the studio layout mounts it. */
function renderStudio(designId: string) {
  env.pathname = `/design/${designId}`;
  env.params = { id: designId };
  return renderWithProviders(
    <>
      <DesignStudio designId={designId} fonts={TEST_FONTS} />
      <MockReviewPanel placement="studio" />
    </>,
  );
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", OPEN));
  return await screen.findByRole("dialog");
}

type Store = Awaited<ReturnType<typeof designBackend>>["store"];
const designIn = async (store: Store, id: string) => settle(await store.get(id)).data as Design;

describe("MockReviewPanel in the studio", () => {
  it("Duyệt turns the open design to Đã duyệt, with the banner", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    renderStudio(MOCK_DESIGN_IDS.pending);
    expect(
      await screen.findByText(/Đang chờ Quản lý kinh doanh duyệt/, undefined, { timeout: 4000 }),
    ).toBeInTheDocument();

    const panel = await openPanel(user);
    await user.click(await within(panel).findByRole("button", { name: "Duyệt" }));

    await waitFor(async () =>
      expect((await designIn(store, MOCK_DESIGN_IDS.pending)).status).toBe("APPROVED"),
    );
    const approved = await designIn(store, MOCK_DESIGN_IDS.pending);
    expect(
      await screen.findByText(`Đã duyệt lúc ${formatDateTime(approved.approvedAt!)}`, undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
  });

  it("Trả lại with an empty reason says Hãy nhập lý do and does not return the design", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    renderStudio(MOCK_DESIGN_IDS.pending);
    const panel = await openPanel(user);

    await user.click(await within(panel).findByRole("button", { name: "Trả lại" }));

    expect(await within(panel).findByText("Hãy nhập lý do")).toBeInTheDocument();
    expect((await designIn(store, MOCK_DESIGN_IDS.pending)).status).toBe("PENDING_REVIEW");
  });

  it("Trả lại with 2001 characters says Lý do tối đa 2000 ký tự", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    renderStudio(MOCK_DESIGN_IDS.pending);
    const panel = await openPanel(user);

    await user.click(await within(panel).findByRole("textbox", { name: "Lý do trả lại" }));
    await user.paste("a".repeat(2001));
    await user.click(within(panel).getByRole("button", { name: "Trả lại" }));

    expect(await within(panel).findByText("Lý do tối đa 2000 ký tự")).toBeInTheDocument();
    expect((await designIn(store, MOCK_DESIGN_IDS.pending)).status).toBe("PENDING_REVIEW");
  });

  it("Trả lại with a reason turns the design to a returned draft, with the reason", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    renderStudio(MOCK_DESIGN_IDS.pending);
    const panel = await openPanel(user);

    await user.type(
      await within(panel).findByRole("textbox", { name: "Lý do trả lại" }),
      "Logo bị mờ",
    );
    await user.click(within(panel).getByRole("button", { name: "Trả lại" }));

    await waitFor(async () =>
      expect(await designIn(store, MOCK_DESIGN_IDS.pending)).toMatchObject({
        status: "DRAFT",
        lastReturn: { reason: "Logo bị mờ" },
      }),
    );
    expect(
      await screen.findByText(/Bị trả lại lúc .*: Logo bị mờ/, undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it("offers no Duyệt or Trả lại for a design that is not waiting for review", async () => {
    const user = userEvent.setup();
    await designBackend();
    renderStudio(MOCK_DESIGN_IDS.approved);
    const panel = await openPanel(user);

    expect(await within(panel).findByText(/không ở trạng thái chờ duyệt/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Duyệt" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Trả lại" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Xoá dữ liệu mock" })).toBeInTheDocument();
  });
});

describe("where the trigger floats", () => {
  const trigger = async () => (await screen.findByRole("button", OPEN)).parentElement!;

  it("in the studio on a draft: left of the 3D card, so neither bottom corner is covered", async () => {
    const { store } = await designBackend();
    renderStudio(await draftIn(store, STUDIO_PRODUCTS.cup));
    await screen.findByRole("group", { name: "Công cụ" }, { timeout: 4000 });

    // The card is 300 px wide, 12 px in from the stage area's right edge (itself 12 px in): the
    // trigger's right edge is 352 px in, 28 px left of the card and of its pill.
    expect(await trigger()).toHaveClass("fixed", "bottom-4", "right-88");
    expect(await trigger()).not.toHaveClass("left-4");
  });

  it("in the studio on a read-only design: the bottom-right corner, where no card is", async () => {
    await designBackend();
    renderStudio(MOCK_DESIGN_IDS.approved);
    await screen.findByRole("group", { name: "Bảng" }, { timeout: 4000 });

    expect(await trigger()).toHaveClass("fixed", "bottom-4", "right-4");
  });

  it("on the design list: the bottom-left corner", async () => {
    await designBackend();
    renderWithProviders(<MockReviewPanel />);

    expect(await trigger()).toHaveClass("fixed", "bottom-4", "left-4");
  });
});

describe("MockReviewPanel on the design list", () => {
  it("lists the designs waiting for review, and Duyệt approves one", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    renderWithProviders(<MockReviewPanel />);
    const panel = await openPanel(user);

    const row = (await within(panel).findByText("Trà sữa Mây", { exact: false })).closest("li");
    expect(row).not.toBeNull();
    await user.click(
      within(row as HTMLElement).getByRole("button", { name: /^Duyệt: .*trà sữa Mây/ }),
    );

    await waitFor(async () =>
      expect((await designIn(store, MOCK_DESIGN_IDS.pending)).status).toBe("APPROVED"),
    );
    expect(await within(panel).findByText("Không có thiết kế nào chờ duyệt")).toBeInTheDocument();
  });
});

describe("MockReviewPanel on the launcher", () => {
  it("offers only the reset", async () => {
    const user = userEvent.setup();
    await designBackend();
    env.pathname = "/design/new";
    renderWithProviders(<MockReviewPanel />);
    const panel = await openPanel(user);

    expect(within(panel).getByRole("button", { name: "Xoá dữ liệu mock" })).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Duyệt" })).not.toBeInTheDocument();
    expect(within(panel).queryByText("Không có thiết kế nào chờ duyệt")).not.toBeInTheDocument();
  });
});

describe("MockReviewPanel reset and storage", () => {
  it("Xoá dữ liệu mock asks first, then reseeds the store and the list", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    renderWithProviders(<MockReviewPanel />);
    const panel = await openPanel(user);
    const row = (await within(panel).findByText("Trà sữa Mây", { exact: false })).closest("li");
    await user.click(
      within(row as HTMLElement).getByRole("button", { name: /^Duyệt: .*trà sữa Mây/ }),
    );
    await waitFor(async () =>
      expect((await designIn(store, MOCK_DESIGN_IDS.pending)).status).toBe("APPROVED"),
    );

    await user.click(within(panel).getByRole("button", { name: "Xoá dữ liệu mock" }));
    // Asked, nothing cleared yet.
    expect((await designIn(store, MOCK_DESIGN_IDS.pending)).status).toBe("APPROVED");
    await user.click(await within(panel).findByRole("button", { name: "Xoá hết" }));

    await waitFor(async () =>
      expect((await designIn(store, MOCK_DESIGN_IDS.pending)).status).toBe("PENDING_REVIEW"),
    );
    expect(await within(panel).findByText("Trà sữa Mây", { exact: false })).toBeInTheDocument();
  });

  it("Huỷ leaves the data alone", async () => {
    const user = userEvent.setup();
    const { post } = await designBackend();
    renderWithProviders(<MockReviewPanel />);
    const panel = await openPanel(user);

    await user.click(within(panel).getByRole("button", { name: "Xoá dữ liệu mock" }));
    await user.click(await within(panel).findByRole("button", { name: "Huỷ" }));

    expect(post.mock.calls.some(([url]) => url === "/__mock/reset")).toBe(false);
    expect(within(panel).getByRole("button", { name: "Xoá dữ liệu mock" })).toBeInTheDocument();
  });

  it("says the data is lost on reload while the store is memory-only", async () => {
    const user = userEvent.setup();
    await designBackend();
    renderWithProviders(<MockReviewPanel />);
    const panel = await openPanel(user);

    expect(
      await within(panel).findByText("Dữ liệu giả lập sẽ mất khi tải lại trang."),
    ).toBeInTheDocument();
  });
});

describe("MockReviewPanel visibility", () => {
  it("renders nothing when neither the design mock nor the full mock is on", async () => {
    env.mocked = false;
    await designBackend();
    renderWithProviders(<MockReviewPanel />);

    expect(screen.queryByRole("button", OPEN)).not.toBeInTheDocument();
  });

  it("renders nothing and reads nothing for a signed-out visitor (R18)", async () => {
    signOut();
    const { get } = await designBackend();
    renderWithProviders(<MockReviewPanel />);

    expect(screen.queryByRole("button", OPEN)).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("MockReviewPanel: Lượt duyệt dự án", () => {
  type ListedRound = { id: string; openedAt: string };
  const roundBox = (panel: HTMLElement, project = "Quán Hoa") =>
    within(panel).findByRole("region", { name: `Lượt duyệt ${project}` });
  const rowOf = (box: HTMLElement, name: string) =>
    within(box).getByText(name).closest("li") as HTMLElement;
  const FAIL_SWITCH = { name: /Lần duyệt kế tiếp sẽ lỗi/ } as const;

  function renderOnProjectPage(projectId: string, path = `/design/projects/${projectId}/submit`) {
    env.pathname = path;
    env.params = { id: projectId };
    return renderWithProviders(<MockReviewPanel placement="studio" />);
  }

  it("lists the open rounds with the project name, the opened time and the designs", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    const { projectId, roundId } = await roundIn(store);
    renderOnProjectPage(projectId);
    const panel = await openPanel(user);

    const box = await roundBox(panel);
    expect(within(box).getByText("Quán Hoa")).toBeInTheDocument();
    const listed = (settle(await store.simulateRounds()).data as { rounds: ListedRound[] }).rounds;
    const opened = listed.find((round) => round.id === roundId)!;
    expect(within(box).getByText(`Mở lúc ${formatDateTime(opened.openedAt)}`)).toBeInTheDocument();
    for (const name of ["Ly A", "Ly B"]) {
      const row = rowOf(box, name);
      expect(within(row).getByText("Chờ duyệt")).toBeInTheDocument();
      expect(within(row).getByRole("button", { name: `Duyệt: ${name}` })).toBeInTheDocument();
      expect(within(row).getByRole("button", { name: `Trả lại: ${name}` })).toBeInTheDocument();
      expect(within(row).getByRole("switch", FAIL_SWITCH)).toBeInTheDocument();
    }
    expect(within(box).getByRole("button", { name: "Duyệt tất cả" })).toBeInTheDocument();
  });

  it("does not read the project id as a design on /design/projects routes", async () => {
    const user = userEvent.setup();
    const { store, get } = await designBackend();
    const { projectId } = await roundIn(store);
    renderOnProjectPage(projectId);
    const panel = await openPanel(user);
    await roundBox(panel);

    expect(get.mock.calls.some(([url]) => url === `/designs/${projectId}`)).toBe(false);
    expect(within(panel).queryByText(/không ở trạng thái chờ duyệt/)).not.toBeInTheDocument();
    expect(within(panel).queryByText("Không có thiết kế nào chờ duyệt")).not.toBeInTheDocument();
  });

  it("Duyệt and Trả lại call the ops on one design of the round", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    const { projectId, designIds } = await roundIn(store);
    renderOnProjectPage(projectId, `/design/projects/${projectId}`);
    const panel = await openPanel(user);
    const box = await roundBox(panel);

    await user.click(within(rowOf(box, "Ly A")).getByRole("button", { name: "Duyệt: Ly A" }));
    await waitFor(async () =>
      expect((await designIn(store, designIds[0]!)).status).toBe("APPROVED"),
    );
    await user.type(
      within(rowOf(box, "Ly B")).getByRole("textbox", { name: "Lý do trả lại: Ly B" }),
      "Logo bị mờ",
    );
    await user.click(within(rowOf(box, "Ly B")).getByRole("button", { name: "Trả lại: Ly B" }));

    await waitFor(async () =>
      expect(await designIn(store, designIds[1]!)).toMatchObject({
        status: "DRAFT",
        lastReturn: { reason: "Logo bị mờ" },
      }),
    );
    // The last decision closed the round: it leaves the list.
    expect(await within(panel).findByText("Không có lượt duyệt nào đang mở")).toBeInTheDocument();
  });

  it("the switch fails the next approval, and Duyệt tất cả says who was approved and who failed", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    const { projectId, designIds } = await roundIn(store, ["Ly A", "Ly B", "Ly C"]);
    renderOnProjectPage(projectId);
    const panel = await openPanel(user);
    const box = await roundBox(panel);

    await user.click(within(rowOf(box, "Ly B")).getByRole("switch", FAIL_SWITCH));
    await waitFor(() => expect(within(rowOf(box, "Ly B")).getByRole("switch")).toBeChecked());
    await user.click(within(box).getByRole("button", { name: "Duyệt tất cả" }));

    const summary = await within(panel).findByRole("group", {
      name: "Kết quả duyệt tất cả Quán Hoa",
    });
    expect(within(summary).getByText(/đã duyệt 2 bản, 1 bản lỗi/)).toBeInTheDocument();
    expect(within(summary).getByText("Đã duyệt: Ly A, Ly C")).toBeInTheDocument();
    expect(within(summary).getByText(/^Ly B: Không xuất được bộ tệp đã duyệt/)).toBeInTheDocument();
    expect(within(summary).getByText("Lượt duyệt vẫn mở.")).toBeInTheDocument();
    expect((await designIn(store, designIds[1]!)).status).toBe("PENDING_REVIEW");
    expect((await designIn(store, designIds[0]!)).status).toBe("APPROVED");
    // The failed design is still listed, its switch spent.
    await waitFor(() => expect(within(rowOf(box, "Ly B")).getByRole("switch")).not.toBeChecked());
  });

  it("words a simulated approval failure as such, and the design stays waiting", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    const { projectId, designIds } = await roundIn(store);
    renderOnProjectPage(projectId, `/design/projects/${projectId}`);
    const panel = await openPanel(user);
    const box = await roundBox(panel);

    await user.click(within(rowOf(box, "Ly A")).getByRole("switch", FAIL_SWITCH));
    await waitFor(() => expect(within(rowOf(box, "Ly A")).getByRole("switch")).toBeChecked());
    await user.click(within(rowOf(box, "Ly A")).getByRole("button", { name: "Duyệt: Ly A" }));

    expect(
      await within(rowOf(box, "Ly A")).findByText(
        /^Duyệt chưa thành công, bản vẫn đang chờ duyệt./,
      ),
    ).toBeInTheDocument();
    expect((await designIn(store, designIds[0]!)).status).toBe("PENDING_REVIEW");
  });

  it("lists a design sent on its own on a project page too, to decide it", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    const { projectId } = await roundIn(store);
    renderOnProjectPage(projectId, `/design/projects/${projectId}`);
    const panel = await openPanel(user);

    expect(await within(panel).findByText("Ly trà sữa Mây 500ml")).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Duyệt: Ly trà sữa Mây 500ml" }),
    ).toBeInTheDocument();
  });

  it("is not offered on the launcher", async () => {
    const user = userEvent.setup();
    await designBackend();
    env.pathname = "/design/new";
    renderWithProviders(<MockReviewPanel />);
    const panel = await openPanel(user);

    expect(within(panel).queryByText("Lượt duyệt dự án")).not.toBeInTheDocument();
  });
});
