import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import type { DesignMockStore } from "@/lib/api/mock-fixtures/design-store";
import { formatDateTime } from "@/lib/format";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import type { StudioServices } from "../components/studio/studio-context";
import { unsavedDraftKey } from "../components/studio/unsaved-draft";
import { emptyDocument, setBackground, type DesignDocument } from "../engine";
import { cup12oz } from "../engine/__tests__/fixtures";
import { designKeys } from "../queries";
import type { Design } from "../types";
import {
  cupWithText,
  designBackend,
  draftIn,
  STUDIO_PRODUCTS,
  submitElsewhere,
} from "./design-backend";
import { TEST_FONTS } from "./fixtures";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));

// The whole studio over the design mock (~0.2 s a request), and autosave's real 1.5 s wait.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  env.push.mockReset();
  signIn();
  // jsdom has no canvas: `getContext` logs "not implemented" before answering null (no 2D, no WebGL).
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

type Seen = { current?: StudioServices; client: QueryClient; unmount: () => void };

/** Renders the studio of `designId`; resolves once it is laid out, with its latest services. */
async function openStudio(designId: string): Promise<Seen> {
  const seen: { current?: StudioServices } = {};
  const { client, unmount } = renderWithProviders(
    <DesignStudio
      designId={designId}
      fonts={TEST_FONTS}
      onServices={(services) => {
        seen.current = services;
      }}
    />,
  );
  await waitFor(() => expect(seen.current).toBeDefined(), { timeout: 4000 });
  return Object.assign(seen, { client, unmount });
}

const designIn = async (store: DesignMockStore, id: string) =>
  settle(await store.get(id)).data as Design;

const paintBody = (services: StudioServices, color: `#${string}`) =>
  act(() => services.editor.apply((doc) => setBackground(doc, "BODY", { kind: "color", color })));

const storedDraft = (id: string) => {
  const raw = window.localStorage.getItem(unsavedDraftKey(id));
  return raw === null ? null : (JSON.parse(raw) as { document: unknown });
};

const SAVED = /^Đã lưu lúc \d{2}:\d{2}$/;
const RED = { surfaces: { BODY: { background: { kind: "color", color: "#FF0000" } } } };

/** Every way an unsaved edit would otherwise be sent again: the tab hidden, the network back. */
async function nudgeAutosave() {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
}

/** Whether leaving the page would ask first (jsdom has no BeforeUnloadEvent). */
function asksBeforeLeaving() {
  const leave = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  Object.defineProperty(leave, "returnValue", { value: undefined, writable: true });
  window.dispatchEvent(leave);
  return leave.defaultPrevented;
}
/** The editing tools of the rail (a read-only design keeps only its lists). */
const tools = () => screen.queryByRole("button", { name: "Chữ (T)" });
const toolOptions = () => screen.queryByRole("region", { name: "Tùy chọn công cụ" });
const contextBar = () => screen.queryByRole("region", { name: "Thuộc tính phần tử" });

describe("the studio per status", () => {
  it("edits a draft: the tool rail, Lưu and Gửi duyệt", async () => {
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.draft);

    expect(tools()).toBeInTheDocument();
    expect(contextBar()).toBeInTheDocument();
    // The panel opens from the rail; it is closed until then.
    expect(toolOptions()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đổi tên thiết kế" })).toBeInTheDocument();
    expect(screen.getByText("Bản nháp")).toBeInTheDocument();
    expect(screen.queryByText("Bị trả lại")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Chỉ xem/)).not.toBeInTheDocument();
  });

  it("shows a returned draft's reason and when it came back, and keeps it editable", async () => {
    const { store } = await designBackend();
    const returned = await designIn(store, MOCK_DESIGN_IDS.returned);
    await openStudio(MOCK_DESIGN_IDS.returned);

    expect(
      screen.getByText(
        `Bị trả lại lúc ${formatDateTime(returned.lastReturn!.returnedAt)}: ${returned.lastReturn!.reason}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Bị trả lại")).toBeInTheDocument();
    expect(tools()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeInTheDocument();
  });

  it("lets the keyboard reach a returned draft's reason, which scrolls when it is long", async () => {
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.returned);

    const strip = screen.getByRole("region", { name: "Trạng thái thiết kế" });
    expect(strip).toHaveAttribute("tabindex", "0");
    act(() => strip.focus());
    expect(strip).toHaveFocus();
    expect(strip).toHaveClass("focus-visible:ring-3");
  });

  it("only shows a design waiting for review: no tools, the waiting banner, still viewable", async () => {
    const user = userEvent.setup();
    const { store, put } = await designBackend();
    const pending = await designIn(store, MOCK_DESIGN_IDS.pending);
    const seen = await openStudio(MOCK_DESIGN_IDS.pending);

    expect(
      screen.getByText(
        `Đang chờ Quản lý kinh doanh duyệt — gửi lúc ${formatDateTime(pending.submittedAt!)}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Chờ duyệt")).toBeInTheDocument();
    expect(tools()).not.toBeInTheDocument();
    expect(toolOptions()).not.toBeInTheDocument();
    expect(contextBar()).not.toBeInTheDocument();
    for (const name of ["Lưu", "Gửi duyệt", "Tạo bản sửa", "Đổi tên thiết kế"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }

    // Viewing still works: the layers select, the stage zooms; nothing changes the design.
    await user.click(screen.getByRole("button", { name: "Lớp" }));
    await user.click(screen.getByRole("option", { name: "Chữ: Trà sữa Mây" }));
    expect(seen.current!.editor.store.getState().selectedId).toBe("el-may-1");
    await user.click(screen.getByRole("button", { name: "Phóng to" }));
    expect(seen.current!.editor.store.getState().zoom).toBeGreaterThan(1);
    const before = seen.current!.editor.store.getState().document;
    paintBody(seen.current!, "#FF0000");
    expect(seen.current!.editor.store.getState().document).toBe(before);
    await act(() => new Promise((resolve) => setTimeout(resolve, 1700))); // past autosave's wait
    expect(put).not.toHaveBeenCalled();
  });

  it("lists the three files a submitted design was sent with; a link is asked for, and opened beside the studio, when one is clicked", async () => {
    const user = userEvent.setup();
    const replace = vi.fn();
    const open = vi.fn(() => ({ opener: window, location: { replace }, close: vi.fn() }));
    vi.stubGlobal("open", open);
    const { get } = await designBackend();
    await openStudio(MOCK_DESIGN_IDS.pending);
    const linksAsked = () =>
      get.mock.calls.filter(([url]) => String(url).endsWith("/download-url")).length;

    await user.click(await screen.findByRole("button", { name: "File đã gửi" }));
    expect(linksAsked()).toBe(0); // none until a file is asked for

    // What the client got back: the file list (newest first) and each link it was handed.
    const answer = async <T,>(index: number) =>
      ((await get.mock.results[index]!.value) as { data: T }).data;
    const listIndex = get.mock.calls.findLastIndex(
      ([url]) => url === `/designs/${MOCK_DESIGN_IDS.pending}/artifacts`,
    );
    const listed = await answer<Array<{ artifactId: string; role: string }>>(listIndex);

    for (const [index, [label, role]] of (
      [
        [/Ảnh xem trước/, "CUSTOMER_PREVIEW"],
        [/File in \(PDF\)/, "PRINT_READY"],
        [/Đặc tả kỹ thuật \(PDF\)/, "TECHNICAL_SPEC"],
      ] as const
    ).entries()) {
      await user.click(await screen.findByRole("button", { name: label }));
      // A signed link on another origin ignores `download`: it opens in a new tab, opened in the
      // click itself (no popup blocked), its opener cut, then sent to the link.
      expect(open).toHaveBeenCalledTimes(index + 1);
      expect(open.mock.calls[index]).toEqual(["", "_blank"]);
      await waitFor(() => expect(replace).toHaveBeenCalledTimes(index + 1));
      // The link asked for is the clicked file's, and the tab goes to exactly that link.
      const file = listed.find((artifact) => artifact.role === role)!;
      const linkIndex = get.mock.calls.findLastIndex(([url]) =>
        String(url).endsWith("/download-url"),
      );
      expect(get.mock.calls[linkIndex]![0]).toBe(
        `/designs/${MOCK_DESIGN_IDS.pending}/artifacts/${file.artifactId}/download-url`,
      );
      const link = await answer<{ url: string }>(linkIndex);
      expect(replace.mock.calls[index]).toEqual([link.url]);
    }
    expect(linksAsked()).toBe(3);
  });

  it("reads the files again each time File đã gửi opens, so their short-lived links are fresh", async () => {
    const user = userEvent.setup();
    const { get } = await designBackend();
    const id = MOCK_DESIGN_IDS.pending;
    await openStudio(id);
    const trigger = await screen.findByRole("button", { name: "File đã gửi" });
    const reads = () => get.mock.calls.filter(([url]) => url === `/designs/${id}/artifacts`).length;
    const before = reads();

    await user.click(trigger);
    await waitFor(() => expect(reads()).toBe(before + 1));
    await user.keyboard("{Escape}");
    await user.click(trigger);
    await waitFor(() => expect(reads()).toBe(before + 2));
  });

  it("offers no files on a draft that was never sent", async () => {
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.draft);

    expect(screen.queryByRole("button", { name: "File đã gửi" })).not.toBeInTheDocument();
  });

  it("only shows an approved design: when it was approved, its preview, and Tạo bản sửa", async () => {
    const { store } = await designBackend();
    const approved = await designIn(store, MOCK_DESIGN_IDS.approved);
    await openStudio(MOCK_DESIGN_IDS.approved);

    expect(
      screen.getByText(`Đã duyệt lúc ${formatDateTime(approved.approvedAt!)}`),
    ).toBeInTheDocument();
    expect(screen.getByText("Đã duyệt")).toBeInTheDocument();
    const replace = vi.fn();
    const open = vi.fn(() => ({ opener: window, location: { replace }, close: vi.fn() }));
    vi.stubGlobal("open", open);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "File đã gửi" }));
    await user.click(await screen.findByRole("button", { name: /Ảnh xem trước/ }));
    expect(open).toHaveBeenCalledWith("", "_blank");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/logo.png"));
    expect(screen.getByRole("button", { name: "Tạo bản sửa" })).toBeInTheDocument();
    expect(tools()).not.toBeInTheDocument();
    expect(toolOptions()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi duyệt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
  });

  it("Tạo bản sửa makes a new draft from the approved design and opens it", async () => {
    const user = userEvent.setup();
    const { store, post } = await designBackend();
    await openStudio(MOCK_DESIGN_IDS.approved);

    await user.click(screen.getByRole("button", { name: "Tạo bản sửa" }));

    await waitFor(() =>
      expect(env.push).toHaveBeenCalledWith(expect.stringMatching(/^\/design\/[0-9a-f-]{36}$/)),
    );
    expect(post).toHaveBeenCalledWith(`/designs/${MOCK_DESIGN_IDS.approved}/revisions`);
    const revisionId = String(env.push.mock.lastCall![0]).replace("/design/", "");
    expect(await designIn(store, revisionId)).toMatchObject({
      status: "DRAFT",
      sourceSnapshotId: MOCK_DESIGN_IDS.approvedSnapshot,
    });
  });

  it.each([
    ["a deleted (ARCHIVED) design", MOCK_DESIGN_IDS.archived],
    ["an id no design has", "7d51f000-0000-4000-8000-0000000000ff"],
  ])("says Không tìm thấy thiết kế for %s", async (_, id) => {
    await designBackend();
    renderWithProviders(<DesignStudio designId={id} fonts={TEST_FONTS} />);

    expect(
      await screen.findByText("Không tìm thấy thiết kế", undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(tools()).not.toBeInTheDocument();
  });
});

describe("saving and renaming in the header", () => {
  it("saves at once on Ctrl+S, once, instead of waiting for autosave", async () => {
    const { store, put } = await designBackend();
    const seen = await openStudio(await draftIn(store, STUDIO_PRODUCTS.cup));

    paintBody(seen.current!, "#FF0000");
    // The browser's own "save page" is kept out of the way.
    expect(fireEvent.keyDown(document.body, { key: "s", ctrlKey: true })).toBe(false);

    // Well before autosave's 1.5 s wait is over.
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(await screen.findByText(SAVED, undefined, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "s", ctrlKey: true }); // nothing left to save
    await act(() => new Promise((resolve) => setTimeout(resolve, 1700)));
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("saves at once on Lưu", async () => {
    const user = userEvent.setup();
    const { store, put } = await designBackend();
    const seen = await openStudio(await draftIn(store, STUDIO_PRODUCTS.cup));

    paintBody(seen.current!, "#00FF00");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(await screen.findByText(SAVED, undefined, { timeout: 3000 })).toBeInTheDocument();
  });

  it("refuses a name over 200 characters, renames on Enter, and saves on with the new version", async () => {
    const user = userEvent.setup();
    const { store, put } = await designBackend();
    // The rename and the layout save are both PUTs now: told apart by their path.
    const renames = () => put.mock.calls.filter(([url]) => String(url).endsWith("/name"));
    const saves = () => put.mock.calls.filter(([url]) => String(url).endsWith("/document"));
    const id = await draftIn(store, STUDIO_PRODUCTS.cup);
    const seen = await openStudio(id);

    await user.click(screen.getByRole("button", { name: "Đổi tên thiết kế" }));
    const field = screen.getByRole("textbox", { name: "Tên thiết kế" });
    await user.clear(field);
    await user.paste("a".repeat(201));
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Tên tối đa 200 ký tự")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(renames()).toHaveLength(0);

    await user.clear(field);
    await user.type(field, "  Ly mới  {Enter}");
    expect(await screen.findByRole("heading", { name: "Ly mới" })).toBeInTheDocument();
    expect(renames()).toHaveLength(1);
    expect(put).toHaveBeenCalledWith(`/designs/${id}/name`, { version: 0, name: "Ly mới" });
    expect(await designIn(store, id)).toMatchObject({ name: "Ly mới", version: 1 });

    // The rename moved the version on: the next save sends it, without a conflict.
    paintBody(seen.current!, "#FF0000");
    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(saves()).toHaveLength(1);
    expect(saves()[0]?.[1]).toMatchObject({ version: 1 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renames when the field is left, and Escape keeps the old name", async () => {
    const user = userEvent.setup();
    const { store, put } = await designBackend();
    const id = await draftIn(store, STUDIO_PRODUCTS.cup, undefined, "Ly cũ");
    await openStudio(id);

    await user.click(screen.getByRole("button", { name: "Đổi tên thiết kế" }));
    await user.type(screen.getByRole("textbox", { name: "Tên thiết kế" }), " nữa{Escape}");
    expect(screen.getByRole("heading", { name: "Ly cũ" })).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Đổi tên thiết kế" }));
    await user.clear(screen.getByRole("textbox", { name: "Tên thiết kế" }));
    await user.type(screen.getByRole("textbox", { name: "Tên thiết kế" }), "Ly mới");
    await user.tab();

    expect(await screen.findByRole("heading", { name: "Ly mới" })).toBeInTheDocument();
    expect(put).toHaveBeenCalledWith(`/designs/${id}/name`, { version: 0, name: "Ly mới" });
  });
});

describe("a design that moves on elsewhere", () => {
  it("re-reads a design whose save is refused with the BE's 409 CONFLICT (version first), finds it moved on, turns read-only on the stored document, sends nothing more and keeps the edit in the browser (Review Focus 3)", async () => {
    const { store, put } = await designBackend();
    const id = await cupWithText(store);
    const { document: stored } = settle(await store.getDocument(id)).data as {
      document: DesignDocument;
    };
    const seen = await openStudio(id);
    expect(tools()).toBeInTheDocument();

    // Tab A submits while this tab (B) edits.
    await submitElsewhere(store, id);
    paintBody(seen.current!, "#FF0000");

    expect(
      await screen.findByText(/^Đang chờ Quản lý kinh doanh duyệt — gửi lúc /, undefined, {
        timeout: 5000,
      }),
    ).toBeInTheDocument();
    expect(put).toHaveBeenCalledTimes(1);
    // The BE checks the version before the status: the submit moved it, so this is a plain CONFLICT,
    // and the studio reads the design to tell a status that moved on from a document saved elsewhere.
    await expect(put.mock.results[0]!.value).rejects.toMatchObject({ code: "CONFLICT" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); // not the reload dialog
    expect(tools()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi duyệt" })).not.toBeInTheDocument();
    expect(seen.current!.readOnly).toBe(true);
    // The studio shows what was submitted, not the refused edit, and offers no save.
    await waitFor(() => expect(seen.current!.editor.store.getState().document).toEqual(stored));
    expect(screen.queryByRole("button", { name: "Lưu lỗi – Thử lại" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // B's unsaved edit is not lost: this browser keeps it.
    expect(storedDraft(id)).toMatchObject({ document: RED });
    expect(await designIn(store, id)).toMatchObject({ status: "PENDING_REVIEW" });

    // Nothing sends it again, and nothing asks before leaving a design that cannot be saved.
    await nudgeAutosave();
    expect(asksBeforeLeaving()).toBe(false);
    seen.unmount();
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(put).toHaveBeenCalledTimes(1);
    expect(storedDraft(id)).toMatchObject({ document: RED });
  });

  it("on Lưu lỗi – Thử lại after a refusal, reads the design again: a draft still, the edit is saved", async () => {
    const user = userEvent.setup();
    const { store, get, put } = await designBackend();
    const id = await cupWithText(store);
    const seen = await openStudio(id);
    // The save is refused as if the design had left DRAFT; read again, it is a draft still.
    put.mockRejectedValueOnce(new ApiError(409, "DESIGN_NOT_DRAFT", "Design is not a draft"));
    paintBody(seen.current!, "#FF0000");
    const retry = await screen.findByRole(
      "button",
      { name: "Lưu lỗi – Thử lại" },
      { timeout: 5000 },
    );
    // The refusal's own re-read (still a draft) has landed.
    await waitFor(() => expect(seen.client.isFetching()).toBe(0));
    const designReads = () => get.mock.calls.filter(([url]) => url === `/designs/${id}`).length;
    const before = designReads();

    await user.click(retry);

    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(designReads()).toBeGreaterThan(before);
    expect(put).toHaveBeenCalledTimes(2);
    expect(settle(await store.getDocument(id)).data).toMatchObject({ document: RED });
    expect(tools()).toBeInTheDocument();
  });

  it("on Lưu lỗi – Thử lại after a refusal, follows a design that did leave DRAFT: read-only, nothing sent", async () => {
    const user = userEvent.setup();
    const { store, put } = await designBackend();
    const id = await cupWithText(store);
    const seen = await openStudio(id);
    put.mockRejectedValueOnce(new ApiError(409, "DESIGN_NOT_DRAFT", "Design is not a draft"));
    paintBody(seen.current!, "#FF0000");
    const retry = await screen.findByRole(
      "button",
      { name: "Lưu lỗi – Thử lại" },
      { timeout: 5000 },
    );
    await submitElsewhere(store, id); // by now it really is waiting for review

    await user.click(retry);

    expect(
      await screen.findByText(/^Đang chờ Quản lý kinh doanh duyệt — gửi lúc /, undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
    expect(tools()).not.toBeInTheDocument();
    expect(put).toHaveBeenCalledTimes(1);
    expect(storedDraft(id)).toMatchObject({ document: RED });
  });

  it("follows a design deleted in another tab: the next save finds it gone, the studio says so and sends nothing more", async () => {
    const { store, put } = await designBackend();
    const id = await cupWithText(store);
    const seen = await openStudio(id);

    // Tab A deletes the draft while this tab (B) edits.
    settle(await store.remove(id, { version: 1 }));
    paintBody(seen.current!, "#FF0000");

    expect(
      await screen.findByText("Không tìm thấy thiết kế", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(put).toHaveBeenCalledTimes(1);
    await expect(put.mock.results[0]!.value).rejects.toMatchObject({ status: 404 });
    expect(tools()).not.toBeInTheDocument();
    await nudgeAutosave();
    expect(asksBeforeLeaving()).toBe(false);
    expect(put).toHaveBeenCalledTimes(1);
    // B's unsaved edit stays in this browser.
    expect(storedDraft(id)).toMatchObject({ document: RED });
  });

  it("still opens the conflict dialog for a save refused with 409 CONFLICT, and reloads", async () => {
    const user = userEvent.setup();
    const { store, put } = await designBackend();
    const id = await cupWithText(store);
    const seen = await openStudio(id);
    // Another tab saved the document first: the stored design moved on to version 2.
    const elsewhere = emptyDocument(cup12oz);
    elsewhere.surfaces.BODY = { background: { kind: "color", color: "#00FF00" }, elements: [] };
    settle(await store.putDocument(id, { version: 1, document: elsewhere }));

    paintBody(seen.current!, "#FF0000");
    const dialog = await screen.findByRole(
      "dialog",
      { name: "Thiết kế đã thay đổi ở nơi khác" },
      { timeout: 5000 },
    );
    await expect(put.mock.results[0]!.value).rejects.toMatchObject({ code: "CONFLICT" });

    await user.click(within(dialog).getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(seen.current!.editor.store.getState().document.surfaces.BODY?.background).toEqual({
      kind: "color",
      color: "#00FF00",
    });
    // Saving goes on from the reloaded version.
    paintBody(seen.current!, "#0000FF");
    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(put.mock.lastCall?.[1]).toMatchObject({ version: 2 });
  });

  it("offers the edit this browser kept while the design was read-only again once it comes back as a draft", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    const id = await cupWithText(store);
    const seen = await openStudio(id);
    // Tab A submits while this tab (B) edits: B's edit is refused and kept in the browser.
    await submitElsewhere(store, id);
    paintBody(seen.current!, "#FF0000");
    await screen.findByText(/^Đang chờ Quản lý kinh doanh duyệt — gửi lúc /, undefined, {
      timeout: 5000,
    });
    await waitFor(() => expect(storedDraft(id)).toMatchObject({ document: RED }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // The review returns it, and the studio is editable again.
    settle(await store.simulateReturn(id, { reason: "Logo quá nhỏ" }));
    await act(() => seen.client.refetchQueries({ queryKey: designKeys.detail(id), exact: true }));

    const offer = await screen.findByRole(
      "dialog",
      { name: "Có thay đổi chưa được lưu" },
      { timeout: 4000 },
    );
    // The customer never left: the offer says why the edit was kept instead.
    expect(within(offer).getByText(/^Thiết kế đã trở lại để chỉnh sửa\./)).toBeInTheDocument();
    expect(within(offer).queryByText(/rời trang/)).not.toBeInTheDocument();
    await user.click(within(offer).getByRole("button", { name: "Khôi phục bản chưa lưu" }));
    expect(seen.current!.editor.store.getState().document).toMatchObject(RED);
    expect(await screen.findByText(SAVED, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(settle(await store.getDocument(id)).data).toMatchObject({ document: RED });
    expect(storedDraft(id)).toBeNull();
  });

  it("follows a review answered while the studio is open: the returned draft is editable again, and what goes with its status is re-read", async () => {
    const id = MOCK_DESIGN_IDS.pending;
    const { store } = await designBackend();
    const seen = await openStudio(id);
    expect(tools()).not.toBeInTheDocument();
    const invalidate = vi.spyOn(seen.client, "invalidateQueries");

    settle(await store.simulateReturn(id, { reason: "Logo quá nhỏ" }));
    // What the 5 s poll of a design under review does, at once.
    await act(() => seen.client.refetchQueries({ queryKey: designKeys.detail(id), exact: true }));

    expect(
      await screen.findByText(/: Logo quá nhỏ$/, undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(tools()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeInTheDocument();
    // The history, the files, the lists and the draft count follow the new status.
    await waitFor(() =>
      expect(invalidate.mock.calls.map(([filters]) => filters)).toEqual(
        expect.arrayContaining([
          { queryKey: designKeys.history(id) },
          { queryKey: designKeys.files(id) },
          { queryKey: designKeys.lists() },
          { queryKey: designKeys.draftCount() },
        ]),
      ),
    );
  });
});
