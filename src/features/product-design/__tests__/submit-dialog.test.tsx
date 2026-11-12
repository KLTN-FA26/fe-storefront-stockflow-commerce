import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import {
  MOCK_PRINT_CONFIGS,
  MOCK_SKU_WITHOUT_CARTON_SPEC,
} from "@/lib/api/mock-fixtures/design-print-configs";
import type { DesignMockStore } from "@/lib/api/mock-fixtures/design-store";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import type { ExportRenderer } from "../components/studio/export-renderer";
import type { StudioServices } from "../components/studio/studio-context";
import { COLOR_DISCLAIMER } from "../components/studio/viewer-host";
import { emptyDocument, setBackground, type DesignDocument, type DesignElement } from "../engine";
import { cup12oz, PNG_1x1, textEl } from "../engine/__tests__/fixtures";
import { designKeys } from "../queries";
import type { Design, DesignEvent } from "../types";
import { designBackend, draftIn, STUDIO_PRODUCTS } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// What these tests prove is the dialog: its steps, what it sends and how it answers the server.
// The bundle builder still runs every step and calls the renderer, but the two PDFs are stand-in
// bytes: loading pdf-lib cold and building them is CPU work (0.3 s idle, 1.7 s and more under a
// loaded parallel run) that fell inside the first drawing test's 5 s wait. The real PDFs are
// built by `submission-bundle.test.ts` and the engine's export tests; the mock reads no PDF.
vi.mock("../engine", async (importOriginal) => {
  const engine = await importOriginal<typeof import("../engine")>();
  const pdf = async () => new TextEncoder().encode("%PDF-1.7 stand-in");
  return { ...engine, buildPrintPdf: pdf, buildSheetPdf: pdf };
});

// The whole studio over the design mock (~0.2 s a request), then a submission's steps.
vi.setConfig({ testTimeout: 20_000 });
const SUBMISSION = { timeout: 5000 };

beforeEach(() => {
  signIn();
  // jsdom has no canvas: `getContext` logs "not implemented" before answering null (no 2D, no WebGL).
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 404 })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  signOut();
});

/** Export rendering stands in for the canvases jsdom lacks: every picture is a 1 × 1 PNG. */
const fakeRenderer = () => ({
  preview: vi.fn<ExportRenderer["preview"]>(async () => PNG_1x1),
  printSurface: vi.fn<ExportRenderer["printSurface"]>(async () => [{ png: PNG_1x1, heightPx: 1 }]),
  specSheet: vi.fn<ExportRenderer["specSheet"]>(async () => PNG_1x1),
  release: vi.fn<ExportRenderer["release"]>(),
});

/** On the 12oz cup body: `u` across the band, half-way down it. */
const textAt = (id: string, u: number, content = "Cà phê") =>
  textEl(id, { content, placement: { u, v: 55, rotationDeg: 0, scale: 1 } });

/** A 12oz cup draft whose body holds `elements` (version 1). */
function draftWith(store: DesignMockStore, elements: DesignElement[]) {
  const document: DesignDocument = emptyDocument(cup12oz);
  document.surfaces.BODY = { background: { kind: "none" }, elements };
  return draftIn(store, STUDIO_PRODUCTS.cup, document);
}

/** Renders the studio of `designId` with `renderer`; resolves once it is laid out. */
async function openStudio(designId: string, renderer: ExportRenderer) {
  const seen: { current?: StudioServices } = {};
  const { client } = renderWithProviders(
    <DesignStudio
      designId={designId}
      fonts={TEST_FONTS}
      exportRenderer={renderer}
      onServices={(services) => {
        seen.current = services;
      }}
    />,
  );
  await waitFor(() => expect(seen.current).toBeDefined(), { timeout: 4000 });
  // The preflight report settles 300 ms after the studio opens on its document.
  await act(() => new Promise((resolve) => setTimeout(resolve, 350)));
  return Object.assign(seen, { client });
}

/** A promise the test lets go of when it wants. */
function gate() {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

/** "Gửi duyệt" in the header: the dialog it opens. */
async function openSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Gửi duyệt" }));
  return screen.findByRole("dialog", { name: "Gửi duyệt" });
}

const urlsOf = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([url]) => url);
const historyOf = async (store: DesignMockStore, id: string) =>
  (settle(await store.history(id)).data as DesignEvent[]).map((event) => event.type);
const designIn = async (store: DesignMockStore, id: string) =>
  settle(await store.get(id)).data as Design;
const stepOf = (dialog: HTMLElement, name: string) =>
  within(dialog).getByText(name).closest("li") as HTMLElement;

describe("SubmitDialog on a preflight Fail", () => {
  it("lists what fails, records the failure, draws and sends nothing; an issue selects its element", async () => {
    const user = userEvent.setup();
    const renderer = fakeRenderer();
    const { store, post } = await designBackend();
    const id = await draftWith(store, [textAt("edge", 4, "Sát mép")]);
    const seen = await openStudio(id, renderer);

    const dialog = await openSubmit(user);

    expect(
      await within(dialog).findByText("Thiết kế chưa đạt kiểm tra tự động."),
    ).toBeInTheDocument();
    await waitFor(() => expect(urlsOf(post)).toEqual([`/designs/${id}/preflight-failures`]), {
      timeout: 3000,
    });
    expect(post.mock.calls[0]![1]).toMatchObject({ version: 1 });
    await waitFor(async () => expect(await historyOf(store, id)).toContain("PREFLIGHT_FAILED"));
    expect(renderer.preview).not.toHaveBeenCalled();
    expect(within(dialog).queryByText("Bản sẽ bị khoá đến khi có kết quả duyệt.")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Gửi duyệt" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /Phần tử/ }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(seen.current!.editor.store.getState()).toMatchObject({
      activeSurface: "BODY",
      selectedId: "edge",
    });
    expect(await designIn(store, id)).toMatchObject({ status: "DRAFT" });
  });

  it("fails a variant whose print configuration has no carton spec (NO_CARTON_SPEC)", async () => {
    const user = userEvent.setup();
    const { store, post } = await designBackend();
    const { product } = MOCK_PRINT_CONFIGS[MOCK_SKU_WITHOUT_CARTON_SPEC]!;
    const id = await draftIn(store, {
      productSlug: product.slug,
      sku: MOCK_SKU_WITHOUT_CARTON_SPEC,
    });
    await openStudio(id, fakeRenderer());

    const dialog = await openSubmit(user);

    expect(
      await within(dialog).findByText("Quy cách chưa có quy cách thùng, chưa gửi duyệt được."),
    ).toBeInTheDocument();
    await waitFor(() => expect(urlsOf(post)).toEqual([`/designs/${id}/preflight-failures`]));
  });

  it("lists the issues the server found (422 PREFLIGHT_FAILED); the design stays a draft", async () => {
    const user = userEvent.setup();
    const { store, post } = await designBackend();
    const id = await draftWith(store, [textAt("text", 170)]);
    await openStudio(id, fakeRenderer());
    post.mockRejectedValueOnce(
      new ApiError(422, "PREFLIGHT_FAILED", "Preflight failed", undefined, undefined, {
        issues: [
          {
            ruleId: "ASSET_INVALID",
            level: "fail",
            message: "Ảnh không hợp lệ hoặc không tải được.",
          },
        ],
      }),
    );

    const dialog = await openSubmit(user);
    await user.click(within(dialog).getByRole("button", { name: "Gửi duyệt" }));

    expect(
      await within(dialog).findByText(
        "Ảnh không hợp lệ hoặc không tải được.",
        undefined,
        SUBMISSION,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Thiết kế chưa đạt kiểm tra tự động.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    expect(await designIn(store, id)).toMatchObject({ status: "DRAFT" });
  });
});

describe("SubmitDialog on a preflight Pass", () => {
  it("confirms with the preview, the lock and the colour notice, walks the steps and leaves the studio read-only", async () => {
    const user = userEvent.setup();
    const renderer = fakeRenderer();
    let release!: () => void;
    const printing = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderer.printSurface.mockImplementation(async () => {
      await printing;
      return [{ png: PNG_1x1, heightPx: 1 }];
    });
    const { store, post } = await designBackend();
    const id = await draftWith(store, [textAt("text", 170)]);
    await openStudio(id, renderer);

    const dialog = await openSubmit(user);
    expect(
      await within(dialog).findByRole("img", { name: "Ảnh xem trước thiết kế" }),
    ).toHaveAttribute("src", expect.stringMatching(/^data:image\/png;base64,/));
    expect(
      within(dialog).getByText("Bản sẽ bị khoá đến khi có kết quả duyệt."),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(COLOR_DISCLAIMER)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Gửi duyệt" }));

    // Printing: the preview is made, the print file is under way, the rest to come.
    await waitFor(
      () => expect(stepOf(dialog, "File in")).toHaveAttribute("aria-current", "step"),
      SUBMISSION,
    );
    expect(stepOf(dialog, "Ảnh xem trước")).toHaveAttribute("data-state", "done");
    expect(stepOf(dialog, "Đặc tả")).toHaveAttribute("data-state", "todo");
    expect(stepOf(dialog, "Tải lên")).toHaveAttribute("data-state", "todo");
    expect(within(dialog).getByRole("progressbar")).toBeInTheDocument();
    // Modal while it runs: it cannot be closed, and the studio behind it is out of reach.
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Gửi duyệt" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hoàn tác (Ctrl+Z)" })).not.toBeInTheDocument();

    act(() => release());

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), SUBMISSION);
    expect(urlsOf(post)).toEqual([`/designs/${id}/submissions`]);
    expect(await designIn(store, id)).toMatchObject({ status: "PENDING_REVIEW" });
    expect(await historyOf(store, id)).toContain("SUBMITTED_FOR_REVIEW");
    expect(
      await screen.findByText(/^Đang chờ Quản lý kinh doanh duyệt — gửi lúc /),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chữ (T)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gửi duyệt" })).not.toBeInTheDocument();
    expect(screen.getByText("Đã gửi duyệt")).toBeInTheDocument(); // the polite live region
  });

  it("offers Thử lại after a failed upload, and sends the files already made", async () => {
    const user = userEvent.setup();
    const renderer = fakeRenderer();
    const { store, post } = await designBackend();
    const id = await draftWith(store, [textAt("text", 170)]);
    await openStudio(id, renderer);
    post.mockRejectedValueOnce(new ApiError(503, "SERVICE_UNAVAILABLE", "Upload failed"));

    const dialog = await openSubmit(user);
    await user.click(within(dialog).getByRole("button", { name: "Gửi duyệt" }));

    const retry = await within(dialog).findByRole("button", { name: "Thử lại" }, SUBMISSION);
    expect(within(dialog).getByText("Chưa gửi được.")).toBeInTheDocument();
    expect(stepOf(dialog, "Tải lên")).toHaveAttribute("data-state", "failed");
    expect(await designIn(store, id)).toMatchObject({ status: "DRAFT" });

    await user.click(retry);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), SUBMISSION);
    expect(urlsOf(post)).toEqual([`/designs/${id}/submissions`, `/designs/${id}/submissions`]);
    expect(renderer.printSurface).toHaveBeenCalledTimes(1);
    expect(renderer.specSheet).toHaveBeenCalledTimes(1);
    expect(await designIn(store, id)).toMatchObject({ status: "PENDING_REVIEW" });
  });

  it("gives way to the conflict dialog when the stored document changed elsewhere, sending nothing; reloaded, it is sent anew", async () => {
    const user = userEvent.setup();
    const renderer = fakeRenderer();
    const { store, post } = await designBackend();
    const id = await draftWith(store, [textAt("text", 170)]);
    const seen = await openStudio(id, renderer);
    // Another tab saves the document (it passes the preflight too) after this one opened it.
    const elsewhere: DesignDocument = emptyDocument(cup12oz);
    elsewhere.surfaces.BODY = {
      background: { kind: "color", color: "#00FF00" },
      elements: [textAt("text", 170, "Trà")],
    };
    settle(await store.putDocument(id, { version: 1, document: elsewhere }));

    const dialog = await openSubmit(user);
    await user.click(await within(dialog).findByRole("button", { name: "Gửi duyệt" }));

    const conflict = await screen.findByRole(
      "dialog",
      { name: "Thiết kế đã thay đổi ở nơi khác" },
      SUBMISSION,
    );
    expect(screen.queryByRole("dialog", { name: "Gửi duyệt" })).not.toBeInTheDocument();
    expect(urlsOf(post)).toEqual([]);
    expect(renderer.printSurface).not.toHaveBeenCalled();

    await user.click(within(conflict).getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), SUBMISSION);
    expect(seen.current!.editor.store.getState().document.surfaces.BODY).toEqual(
      elsewhere.surfaces.BODY,
    );

    // Sent again, the reloaded document is drawn anew and submitted.
    const again = await openSubmit(user);
    await user.click(await within(again).findByRole("button", { name: "Gửi duyệt" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), SUBMISSION);
    expect(urlsOf(post)).toEqual([`/designs/${id}/submissions`]);
    expect(renderer.printSurface).toHaveBeenCalledTimes(1);
    expect(await designIn(store, id)).toMatchObject({ status: "PENDING_REVIEW" });
  });

  it("says Đang kiểm tra… while the design is checked, and Đang gửi… while it is sent", async () => {
    const user = userEvent.setup();
    const renderer = fakeRenderer();
    const printing = gate();
    renderer.printSurface.mockImplementation(async () => {
      await printing.held;
      return [{ png: PNG_1x1, heightPx: 1 }];
    });
    const realPut = api.put.bind(api);
    const { store, put } = await designBackend();
    const id = await draftWith(store, [textAt("text", 170)]);
    const seen = await openStudio(id, renderer);
    // An edit waits for autosave: the check saves it first, and that save is held.
    const saving = gate();
    put.mockImplementationOnce(async (...args: Parameters<typeof api.put>) => {
      await saving.held;
      return realPut(...args);
    });
    act(() =>
      seen.current!.editor.apply((doc) =>
        setBackground(doc, "BODY", { kind: "color", color: "#FF0000" }),
      ),
    );

    const dialog = await openSubmit(user);

    const checking = await within(dialog).findByRole("button", { name: "Đang kiểm tra…" });
    expect(checking).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Đang gửi…" })).not.toBeInTheDocument();

    act(() => saving.release());
    await user.click(await within(dialog).findByRole("button", { name: "Gửi duyệt" }, SUBMISSION));

    expect(
      await within(dialog).findByRole("button", { name: "Đang gửi…" }, SUBMISSION),
    ).toBeDisabled();
    expect(
      within(dialog).queryByRole("button", { name: "Đang kiểm tra…" }),
    ).not.toBeInTheDocument();
    act(() => printing.release());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), SUBMISSION);
  });

  it("says why, and offers Đóng instead of Thử lại, once the design is no longer a draft (409 INVALID_STATE); the design is read again", async () => {
    const user = userEvent.setup();
    const { store, post } = await designBackend();
    const id = await draftWith(store, [textAt("text", 170)]);
    const seen = await openStudio(id, fakeRenderer());
    const invalidate = vi.spyOn(seen.client, "invalidateQueries");
    post.mockRejectedValueOnce(new ApiError(409, "INVALID_STATE", "Design is not a draft"));

    const dialog = await openSubmit(user);
    await user.click(within(dialog).getByRole("button", { name: "Gửi duyệt" }));

    expect(
      await within(dialog).findByText(
        "Thiết kế không còn là bản nháp (đã được gửi duyệt hoặc đã có kết quả) nên không gửi được nữa.",
        undefined,
        SUBMISSION,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: designKeys.detail(id), exact: true });

    await user.click(within(dialog).getByRole("button", { name: "Đóng" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(urlsOf(post)).toEqual([`/designs/${id}/submissions`]);
  });

  it("says why, and offers only Đóng, once the design is gone (404: deleted in another tab)", async () => {
    const user = userEvent.setup();
    const { store, post } = await designBackend();
    const id = await draftWith(store, [textAt("text", 170)]);
    await openStudio(id, fakeRenderer());
    post.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "No such design"));

    const dialog = await openSubmit(user);
    await user.click(within(dialog).getByRole("button", { name: "Gửi duyệt" }));

    expect(
      await within(dialog).findByText(
        "Không tìm thấy thiết kế hoặc sản phẩm này.",
        undefined,
        SUBMISSION,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Gửi lại" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Đóng" })).toBeEnabled();
  });

  it("stops before sending, without the conflict dialog, when this tab's design changed while it was sent; Gửi lại sends the latest", async () => {
    const user = userEvent.setup();
    const renderer = fakeRenderer();
    const { store, post } = await designBackend();
    const id = await draftWith(store, [textAt("text", 170)]);
    const seen = await openStudio(id, renderer);
    renderer.printSurface.mockImplementationOnce(async () => {
      // This tab's editor changes the design while its files are drawn.
      seen.current!.editor.apply((doc) =>
        setBackground(doc, "BODY", { kind: "color", color: "#FF0000" }),
      );
      return [{ png: PNG_1x1, heightPx: 1 }];
    });

    const dialog = await openSubmit(user);
    await user.click(within(dialog).getByRole("button", { name: "Gửi duyệt" }));

    const again = await within(dialog).findByRole("button", { name: "Gửi lại" }, SUBMISSION);
    expect(
      within(dialog).getByText(
        "Thiết kế vừa được sửa trong lúc gửi nên chưa gửi đi. Hãy gửi lại để gửi bản mới nhất.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Thiết kế đã thay đổi ở nơi khác" }),
    ).not.toBeInTheDocument();
    expect(urlsOf(post)).toEqual([]);

    await user.click(again);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), SUBMISSION);
    expect(urlsOf(post)).toEqual([`/designs/${id}/submissions`]);
    expect(renderer.printSurface).toHaveBeenCalledTimes(2); // drawn anew from the edited design
    const { document } = settle(await store.getDocument(id)).data as { document: DesignDocument };
    expect(document.surfaces.BODY?.background).toEqual({ kind: "color", color: "#FF0000" });
    expect(await designIn(store, id)).toMatchObject({ status: "PENDING_REVIEW" });
  });

  it("re-reads what goes with the new status once after its own submission", async () => {
    const user = userEvent.setup();
    const { store } = await designBackend();
    const id = await draftWith(store, [textAt("text", 170)]);
    const seen = await openStudio(id, fakeRenderer());
    const invalidate = vi.spyOn(seen.client, "invalidateQueries");

    const dialog = await openSubmit(user);
    await user.click(within(dialog).getByRole("button", { name: "Gửi duyệt" }));
    expect(
      await screen.findByText(
        /^Đang chờ Quản lý kinh doanh duyệt — gửi lúc /,
        undefined,
        SUBMISSION,
      ),
    ).toBeInTheDocument();
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));

    const historyReads = invalidate.mock.calls.filter(
      ([filters]) =>
        JSON.stringify(filters) === JSON.stringify({ queryKey: designKeys.history(id) }),
    );
    expect(historyReads).toHaveLength(1);
  });

  it("can be cancelled before anything is sent", async () => {
    const user = userEvent.setup();
    const { store, post } = await designBackend();
    const id = await draftWith(store, [textAt("text", 170)]);
    await openStudio(id, fakeRenderer());

    const dialog = await openSubmit(user);
    await user.click(within(dialog).getByRole("button", { name: "Huỷ" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Gửi duyệt" })).toBeInTheDocument();
  });
});
