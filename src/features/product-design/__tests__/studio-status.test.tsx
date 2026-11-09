import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import type { DesignMockStore } from "@/lib/api/mock-fixtures/design-store";
import { formatDateTime } from "@/lib/format";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import type { StudioServices } from "../components/studio/studio-context";
import { unsavedDraftKey } from "../components/studio/unsaved-draft";
import { emptyDocument, setBackground, sha256Hex, type DesignDocument } from "../engine";
import { cup12oz, PNG_1x1, textEl } from "../engine/__tests__/fixtures";
import { designKeys } from "../queries";
import type { Design } from "../types";
import { designBackend, draftIn, STUDIO_PRODUCTS } from "./design-backend";
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

type Seen = { current?: StudioServices; client: QueryClient };

/** Renders the studio of `designId`; resolves once it is laid out, with its latest services. */
async function openStudio(designId: string): Promise<Seen> {
  const seen: { current?: StudioServices } = {};
  const { client } = renderWithProviders(
    <DesignStudio
      designId={designId}
      fonts={TEST_FONTS}
      onServices={(services) => {
        seen.current = services;
      }}
    />,
  );
  await waitFor(() => expect(seen.current).toBeDefined(), { timeout: 4000 });
  return Object.assign(seen, { client });
}

/** A cup draft whose body holds the text "Cà phê" (version 1): one that passes the preflight. */
function cupWithText(store: DesignMockStore) {
  const document: DesignDocument = emptyDocument(cup12oz);
  document.surfaces.BODY = {
    background: { kind: "none" },
    elements: [
      textEl("text", {
        content: "Cà phê",
        placement: { u: 170, v: 55, rotationDeg: 0, scale: 1 },
      }),
    ],
  };
  return draftIn(store, STUDIO_PRODUCTS.cup, document);
}

const designIn = async (store: DesignMockStore, id: string) =>
  settle(await store.get(id)).data as Design;

/** Another tab submits the design: a complete bundle with matching checksums. */
async function submitElsewhere(store: DesignMockStore, id: string) {
  const { version } = await designIn(store, id);
  const files = {
    CUSTOMER_PREVIEW: new File([PNG_1x1.slice()], "preview.png", { type: "image/png" }),
    PRINT_READY: new File([new Uint8Array([1, 2])], "print-ready.pdf", {
      type: "application/pdf",
    }),
    TECHNICAL_SPEC: new File([new Uint8Array([3, 4])], "technical-spec.pdf", {
      type: "application/pdf",
    }),
  };
  const checksums: Record<string, string> = {};
  for (const [role, file] of Object.entries(files)) {
    checksums[role] = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
  }
  settle(
    await store.submit(id, {
      version,
      preflight: { result: "Pass", issues: [] },
      checksums,
      files,
    }),
  );
}

const paintBody = (services: StudioServices, color: `#${string}`) =>
  act(() => services.editor.apply((doc) => setBackground(doc, "BODY", { kind: "color", color })));

const storedDraft = (id: string) => {
  const raw = window.localStorage.getItem(unsavedDraftKey(id));
  return raw === null ? null : (JSON.parse(raw) as { document: unknown });
};

const SAVED = /^Đã lưu lúc \d{2}:\d{2}$/;
const tools = () => screen.queryByRole("group", { name: "Công cụ" });
const toolOptions = () => screen.queryByRole("region", { name: "Tùy chọn công cụ" });

describe("the studio per status", () => {
  it("edits a draft: the tool rail, Lưu and Gửi duyệt", async () => {
    await designBackend();
    await openStudio(MOCK_DESIGN_IDS.draft);

    expect(tools()).toBeInTheDocument();
    expect(toolOptions()).toBeInTheDocument();
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
    for (const name of ["Lưu", "Gửi duyệt", "Tạo bản sửa", "Đổi tên thiết kế"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }

    // Viewing still works: the layers select, the stage zooms; nothing changes the design.
    await user.click(screen.getByRole("tab", { name: "Lớp" }));
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

  it("only shows an approved design: when it was approved, its preview, and Tạo bản sửa", async () => {
    const { store } = await designBackend();
    const approved = await designIn(store, MOCK_DESIGN_IDS.approved);
    await openStudio(MOCK_DESIGN_IDS.approved);

    expect(
      screen.getByText(`Đã duyệt lúc ${formatDateTime(approved.approvedAt!)}`),
    ).toBeInTheDocument();
    expect(screen.getByText("Đã duyệt")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Tải ảnh xem trước" })).toHaveAttribute(
      "href",
      "/logo.png",
    );
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
    const { store, patch, put } = await designBackend();
    const id = await draftIn(store, STUDIO_PRODUCTS.cup);
    const seen = await openStudio(id);

    await user.click(screen.getByRole("button", { name: "Đổi tên thiết kế" }));
    const field = screen.getByRole("textbox", { name: "Tên thiết kế" });
    await user.clear(field);
    await user.paste("a".repeat(201));
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Tên tối đa 200 ký tự")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(patch).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, "  Ly mới  {Enter}");
    expect(await screen.findByRole("heading", { name: "Ly mới" })).toBeInTheDocument();
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith(`/designs/${id}`, { name: "Ly mới", version: 0 });
    expect(await designIn(store, id)).toMatchObject({ name: "Ly mới", version: 1 });

    // The rename moved the version on: the next save sends it, without a conflict.
    paintBody(seen.current!, "#FF0000");
    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.lastCall?.[1]).toMatchObject({ version: 1 });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renames when the field is left, and Escape keeps the old name", async () => {
    const user = userEvent.setup();
    const { store, patch } = await designBackend();
    const id = await draftIn(store, STUDIO_PRODUCTS.cup, undefined, "Ly cũ");
    await openStudio(id);

    await user.click(screen.getByRole("button", { name: "Đổi tên thiết kế" }));
    await user.type(screen.getByRole("textbox", { name: "Tên thiết kế" }), " nữa{Escape}");
    expect(screen.getByRole("heading", { name: "Ly cũ" })).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Đổi tên thiết kế" }));
    await user.clear(screen.getByRole("textbox", { name: "Tên thiết kế" }));
    await user.type(screen.getByRole("textbox", { name: "Tên thiết kế" }), "Ly mới");
    await user.tab();

    expect(await screen.findByRole("heading", { name: "Ly mới" })).toBeInTheDocument();
    expect(patch).toHaveBeenCalledWith(`/designs/${id}`, { name: "Ly mới", version: 0 });
  });
});

describe("a design that moves on elsewhere", () => {
  it("re-reads a design whose save is refused with 409 INVALID_STATE, turns read-only and keeps the edit in the browser (Review Focus 3)", async () => {
    const { store, put } = await designBackend();
    const id = await cupWithText(store);
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
    await expect(put.mock.results[0]!.value).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(tools()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi duyệt" })).not.toBeInTheDocument();
    expect(seen.current!.readOnly).toBe(true);
    // B's unsaved edit is not lost: this browser keeps it.
    expect(storedDraft(id)).toMatchObject({
      document: { surfaces: { BODY: { background: { kind: "color", color: "#FF0000" } } } },
    });
    expect(await designIn(store, id)).toMatchObject({ status: "PENDING_REVIEW" });
  });

  it("still opens the conflict dialog for a save refused with 409 VERSION_CONFLICT, and reloads", async () => {
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
    await expect(put.mock.results[0]!.value).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

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
