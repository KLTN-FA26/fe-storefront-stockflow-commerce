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
import { designBackend, draftIn, STUDIO_PRODUCTS } from "./design-backend";
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
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Duyệt" }));

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
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Duyệt" }));
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
