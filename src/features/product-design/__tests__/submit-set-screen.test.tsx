import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORE_ROUTES } from "@/constants";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import type { DesignMockStore } from "@/lib/api/mock-fixtures/design-store";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { SubmitSetScreen } from "../components/submit-set-screen";
import type { ExportRenderer } from "../components/studio/export-renderer";
import { emptyDocument } from "../engine/document/factory";
import type { DesignDocument } from "../engine/document/schema";
import { cup12oz, PNG_1x1, textEl } from "../engine/__tests__/fixtures";
import type { Design, DesignEvent } from "../types";
import {
  designBackend,
  STUDIO_PRODUCTS,
  submitElsewhere,
  type DesignBackend,
} from "./design-backend";
import { TEST_FONTS } from "./fixtures";

// "Gửi duyệt cả bộ" (spec 2026-11-12 §8) over the design mock: each design is loaded by itself,
// checked, drawn (a stand-in renderer: jsdom has no canvas) and uploaded, then one round opens.

const env = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: env.replace }),
  usePathname: () => "/design/projects/x/submit",
}));

// The steps are under test, not the PDFs: the bundle builder still runs every step, the two PDFs
// are stand-in bytes (as in `run-submission.test.ts`).
vi.mock("../engine", async (importOriginal) => {
  const engine = await importOriginal<typeof import("../engine")>();
  const pdf = async () => new TextEncoder().encode("%PDF-1.7 stand-in");
  return { ...engine, buildPrintPdf: pdf, buildSheetPdf: pdf };
});

// Each design is read, checked, drawn and uploaded through the mock (~0.2 s a request).
vi.setConfig({ testTimeout: 40_000 });
const SLOW = { timeout: 20_000 };

/** The client's own `post` and `get`, before the backend's pass-through spies wrap them. */
const realPost = api.post.bind(api);
const realGet = api.get.bind(api);

let backend: DesignBackend;
beforeEach(async () => {
  signIn();
  env.push.mockReset();
  env.replace.mockReset();
  backend = await designBackend();
  // jsdom has no canvas: `getContext` answers null (no 2D, no WebGL).
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  signOut();
});

/** The review files' renderers, one per design loaded; `hold(n)` holds the n-th preview drawn. */
function renderers() {
  const made: Array<Record<"preview" | "printSurface" | "release", ReturnType<typeof vi.fn>>> = [];
  let previews = 0;
  const holds = new Map<number, Promise<void>>();
  const factory = (): ExportRenderer => {
    const renderer = {
      preview: vi.fn(async () => {
        previews += 1;
        await holds.get(previews);
        return PNG_1x1;
      }),
      printSurface: vi.fn(async () => [{ png: PNG_1x1, heightPx: 1 }]),
      specSheet: vi.fn(async () => PNG_1x1),
      release: vi.fn(),
    };
    made.push(renderer);
    return renderer;
  };
  return {
    factory,
    made,
    previews: () => previews,
    /** Holds the n-th preview until the answer is called. */
    hold(n: number) {
      let release!: () => void;
      holds.set(n, new Promise<void>((resolve) => (release = resolve)));
      return () => act(() => release());
    },
  };
}

/** A cup document with some text: it passes the preflight. */
function textDocument(content = "Cà phê"): DesignDocument {
  const document = emptyDocument(cup12oz);
  document.surfaces.BODY = {
    background: { kind: "none" },
    elements: [textEl("t", { content, placement: { u: 170, v: 55, rotationDeg: 0, scale: 1 } })],
  };
  return document;
}

/** A cup draft of the project: with text (version 1), or `empty` (version 0, fails EMPTY_DESIGN). */
async function draftOf(store: DesignMockStore, projectId: string, name: string, empty = false) {
  const created = settle(await store.create({ ...STUDIO_PRODUCTS.cup, name, projectId }));
  const { id } = created.data as { id: string };
  if (!empty) settle(await store.putDocument(id, { version: 0, document: textDocument() }));
  return id;
}

async function newProject(store: DesignMockStore) {
  const created = settle(await store.createProject({ name: "Quán Hoa" }));
  return (created.data as { id: string }).id;
}

const designOf = async (store: DesignMockStore, id: string) =>
  settle(await store.get(id)).data as Design;

/** The URLs the client posted to, in order. */
const posted = () => backend.post.mock.calls.map(([url]) => url);
const uploadsOf = (id: string) =>
  backend.post.mock.calls.filter(([url]) => url === `/designs/${id}/submission-uploads`);
const rounds = () => posted().filter((url) => url.endsWith("/review-rounds"));

function open(projectId: string, ids: string[], factory: () => ExportRenderer) {
  return renderWithProviders(
    <SubmitSetScreen projectId={projectId} ids={ids} fonts={TEST_FONTS} newRenderer={factory} />,
  );
}

const rowOf = (name: string) => screen.findByRole("listitem", { name }, SLOW);
/** The run's live region (its latest milestone). */
const announced = () => screen.getByRole("status", { name: "Tiến độ gửi duyệt" });
const historyOf = async (store: DesignMockStore, projectId: string) =>
  settle(await store.projectHistory(projectId)).data as Array<{ type: string; note: string }>;
/** A lost answer: the request reached the server, the customer's browser heard nothing back. */
const lost = () =>
  new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ. Vui lòng kiểm tra mạng.");

describe("Gửi duyệt cả bộ", () => {
  it("sends nothing when one design fails: its row shows what to fix and a studio link, the failure is in its history", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const empty = await draftOf(store, projectId, "Ly trống", true);
    const { factory } = renderers();

    open(projectId, [a, empty], factory);

    const failing = await rowOf("Ly trống");
    await within(failing).findByText("Không đạt", {}, SLOW);
    expect(within(failing).getByText("Thiết kế chưa có nội dung.")).toBeInTheDocument();
    expect(within(failing).getByRole("link", { name: "Mở studio để sửa" })).toHaveAttribute(
      "href",
      STORE_ROUTES.design.detail(empty),
    );
    expect(within(await rowOf("Ly A")).getByText("Đạt")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa gửi bản nào");
    expect(screen.getByRole("alert")).toHaveFocus(); // the keyboard lands on what stopped it
    expect(announced()).toHaveTextContent("Ly trống: không đạt");
    expect(screen.queryByRole("button", { name: /Gửi duyệt/ })).not.toBeInTheDocument();
    // docs 12 §5.4: the project's history records the failed check, with each design's issues.
    await waitFor(async () => {
      const failed = (await historyOf(store, projectId)).filter(
        (event) => event.type === "BATCH_PREFLIGHT_FAILED",
      );
      expect(failed.map((event) => event.note)).toEqual([`${empty}: Thiết kế chưa có nội dung.`]);
    }, SLOW);

    expect(posted().filter((url) => url.endsWith("/submission-uploads"))).toEqual([]);
    expect(rounds()).toEqual([]);
    for (const id of [a, empty]) expect((await designOf(store, id)).status).toBe("DRAFT");
    const history = settle(await store.history(empty)).data as DesignEvent[];
    expect(history.map((event) => event.type)).toContain("PREFLIGHT_FAILED");
  });

  it("checks, confirms, draws and uploads each design with its own progress, then opens the round and goes back to the project", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    const draw = renderers();
    const releaseFirst = draw.hold(1);
    const user = userEvent.setup();

    open(projectId, [a, b], draw.factory);

    await screen.findByText("2 bản đều đạt", {}, SLOW);
    expect(screen.getByRole("button", { name: "Gửi duyệt 2 bản" })).toHaveFocus();
    expect(announced()).toHaveTextContent("Ly B: đạt");
    await user.click(screen.getByRole("button", { name: "Gửi duyệt 2 bản" }));
    // The same button says what the run does, and keeps the focus.
    expect(screen.getByRole("button", { name: "Đang dựng và tải lên…" })).toHaveFocus();
    const rowA = await rowOf("Ly A");
    expect(
      await within(rowA).findByRole("progressbar", { name: "Tiến độ Ly A" }, SLOW),
    ).toBeInTheDocument();
    expect(within(rowA).getByText("Đang dựng ảnh xem trước…")).toBeInTheDocument();
    expect(announced()).toHaveTextContent("Đang dựng Ly A (1/2)");
    expect(within(await rowOf("Ly B")).getByText("Đạt")).toBeInTheDocument();
    // Leaving now asks first (jsdom has no BeforeUnloadEvent: a cancelable event will do).
    const leave = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    Object.defineProperty(leave, "returnValue", { value: undefined, writable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);

    releaseFirst();

    await waitFor(
      () => expect(env.replace).toHaveBeenCalledWith(STORE_ROUTES.design.project(projectId)),
      SLOW,
    );
    for (const id of [a, b]) expect((await designOf(store, id)).status).toBe("PENDING_REVIEW");
    const project = settle(await store.getProject(projectId)).data as {
      openRound: { designIds: string[] } | null;
    };
    expect(project.openRound?.designIds).toEqual([a, b]);
    expect(uploadsOf(a)).toHaveLength(1);
    expect(uploadsOf(b)).toHaveLength(1);
    expect(rounds()).toHaveLength(1);
    const types = (await historyOf(store, projectId)).map((event) => event.type);
    expect(types).toContain("BATCH_SUBMITTED");
    expect(env.push).not.toHaveBeenCalled(); // Back from the project does not come here again
  });

  it("after a network error, Thử lại goes on from the design that stopped and draws no design again", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    let cut = true;
    backend.post.mockImplementation((...args: Parameters<typeof api.post>) => {
      if (cut && args[0] === `/designs/${b}/submission-uploads`) {
        cut = false;
        return Promise.reject(
          new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ. Vui lòng kiểm tra mạng."),
        );
      }
      return realPost(...args);
    });
    const draw = renderers();
    const user = userEvent.setup();

    open(projectId, [a, b], draw.factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));

    const retry = await screen.findByRole("button", { name: "Thử lại" }, SLOW);
    expect(screen.getByRole("alert")).toHaveTextContent("Không kết nối được máy chủ");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
    expect(within(await rowOf("Ly A")).getByText("Đã tải lên")).toBeInTheDocument();
    expect(draw.previews()).toBe(2);
    const loads = draw.made.length;

    await user.click(retry);

    await waitFor(
      () => expect(env.replace).toHaveBeenCalledWith(STORE_ROUTES.design.project(projectId)),
      SLOW,
    );
    expect(draw.previews()).toBe(2); // nothing drawn again
    expect(draw.made).toHaveLength(loads); // nothing loaded again
    expect(uploadsOf(a)).toHaveLength(1);
    const [first, again] = uploadsOf(b);
    expect(again?.[2]?.headers).toMatchObject({
      "Idempotency-Key": (first?.[2]?.headers as Record<string, string>)["Idempotency-Key"],
    });
    for (const id of [a, b]) expect((await designOf(store, id)).status).toBe("PENDING_REVIEW");
  });

  it("names the design another tab changed since its upload, and Thử lại draws only that one again", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    const draw = renderers();
    const releaseSecond = draw.hold(2); // b's drawing waits, after a was uploaded
    const user = userEvent.setup();

    open(projectId, [a, b], draw.factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));
    await within(await rowOf("Ly A")).findByText("Đã tải lên", {}, SLOW);
    const { version } = await designOf(store, a);
    settle(await store.putDocument(a, { version, document: textDocument("Trà sữa") }));
    releaseSecond();

    const changed = await rowOf("Ly A");
    expect(
      await within(changed).findByText("Bản này vừa được sửa ở nơi khác.", {}, SLOW),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa gửi bản nào");
    expect((await designOf(store, b)).status).toBe("DRAFT");

    await user.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(
      () => expect(env.replace).toHaveBeenCalledWith(STORE_ROUTES.design.project(projectId)),
      SLOW,
    );
    expect(draw.previews()).toBe(3); // a twice, b once
    expect(uploadsOf(a)).toHaveLength(2);
    expect(uploadsOf(b)).toHaveLength(1);
    expect(rounds()).toHaveLength(2);
    for (const id of [a, b]) expect((await designOf(store, id)).status).toBe("PENDING_REVIEW");
  });

  it("Huỷ stops the run and sends nothing", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    const draw = renderers();
    const releaseFirst = draw.hold(1);
    const user = userEvent.setup();

    open(projectId, [a, b], draw.factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));
    await within(await rowOf("Ly A")).findByRole("progressbar", {}, SLOW);
    await waitFor(() => expect(draw.previews()).toBe(1), SLOW); // a's preview is being drawn

    await user.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(env.replace).toHaveBeenCalledWith(STORE_ROUTES.design.project(projectId));
    releaseFirst();

    // The design being drawn is let go of, and nothing goes further.
    const drawing = draw.made.at(-1)!;
    await waitFor(() => expect(drawing.release).toHaveBeenCalled(), SLOW);
    expect(drawing.printSurface).not.toHaveBeenCalled(); // stopped after the preview
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    expect(posted().filter((url) => url.endsWith("/submission-uploads"))).toEqual([]);
    expect(rounds()).toEqual([]);
    for (const id of [a, b]) expect((await designOf(store, id)).status).toBe("DRAFT");
  });

  it("Huỷ ends a preview that waits for its 3D model at once: nothing more is started or recorded", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    const draw = renderers();
    // A renderer whose preview waits for its model until the run is cancelled (as the real one does).
    let previews = 0;
    const factory = (): ExportRenderer => {
      const renderer = draw.factory();
      renderer.preview = vi.fn(
        (_size: number, signal?: AbortSignal) =>
          new Promise<Uint8Array>((_resolve, reject) => {
            previews += 1;
            signal?.addEventListener("abort", () => reject(signal.reason));
          }),
      );
      return renderer;
    };
    const user = userEvent.setup();

    open(projectId, [a, b], factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));
    await waitFor(() => expect(previews).toBe(1), SLOW);

    await user.click(screen.getByRole("button", { name: "Huỷ" }));

    expect(env.replace).toHaveBeenCalledWith(STORE_ROUTES.design.project(projectId));
    // Released without anyone settling the preview: the abort alone ended its wait.
    await waitFor(() => expect(draw.made.at(-1)!.release).toHaveBeenCalled(), SLOW);
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    expect(previews).toBe(1); // b was never started
    expect(draw.made.at(-1)!.printSurface).not.toHaveBeenCalled();
    expect(posted().filter((url) => url.endsWith("/submission-uploads"))).toEqual([]);
    expect(rounds()).toEqual([]);
    expect(screen.queryByText(/chưa thành công|không gửi được/i)).not.toBeInTheDocument();
    for (const id of [a, b]) expect((await designOf(store, id)).status).toBe("DRAFT");
    expect((await historyOf(store, projectId)).filter((e) => /fail|lỗi/i.test(e.type))).toEqual([]);
  });
});

describe("Gửi duyệt cả bộ: what the customer is told", () => {
  it("finds the round open when its answer was lost on the way, and goes to the project", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    backend.post.mockImplementation(async (...args: Parameters<typeof api.post>) => {
      const answer = await realPost(...args);
      if (args[0].endsWith("/review-rounds")) throw lost(); // opened, but nobody heard
      return answer;
    });
    const user = userEvent.setup();

    open(projectId, [a, b], renderers().factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));

    await waitFor(
      () => expect(env.replace).toHaveBeenCalledWith(STORE_ROUTES.design.project(projectId)),
      SLOW,
    );
    expect(rounds()).toHaveLength(1);
    expect(screen.queryByText("Chưa gửi bản nào.")).not.toBeInTheDocument();
    for (const id of [a, b]) expect((await designOf(store, id)).status).toBe("PENDING_REVIEW");
  });

  it("says it does not know whether the round opened when the project cannot be read either; Thử lại finds out", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    let offline = false;
    backend.post.mockImplementation(async (...args: Parameters<typeof api.post>) => {
      if (offline) throw lost();
      const answer = await realPost(...args);
      if (args[0].endsWith("/review-rounds") && rounds().length === 1) {
        offline = true;
        throw lost();
      }
      return answer;
    });
    backend.get.mockImplementation((...args: Parameters<typeof api.get>) =>
      offline ? Promise.reject(lost()) : realGet(...args),
    );
    const user = userEvent.setup();

    open(projectId, [a, b], renderers().factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));

    const alert = await screen.findByRole("alert", {}, SLOW);
    expect(alert).toHaveTextContent("Chưa rõ lượt duyệt đã mở chưa.");
    expect(alert).not.toHaveTextContent("Chưa gửi bản nào");
    expect(screen.queryByRole("button", { name: "Huỷ" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về dự án" })).toBeInTheDocument();
    offline = false;

    await user.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(
      () => expect(env.replace).toHaveBeenCalledWith(STORE_ROUTES.design.project(projectId)),
      SLOW,
    );
    expect(rounds()).toHaveLength(2); // the second answered the round already open
    const types = (await historyOf(store, projectId)).map((event) => event.type);
    expect(types.filter((type) => type === "BATCH_SUBMITTED")).toHaveLength(1);
  });

  it("names the chosen designs it does not send, and why", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    const c = await draftOf(store, projectId, "Ly C");
    await submitElsewhere(store, c);

    open(projectId, [a, b, c], renderers().factory);

    await screen.findByText("2 bản đều đạt", {}, SLOW);
    expect(screen.getByText("1 bản đã chọn không được gửi")).toBeInTheDocument();
    expect(screen.getByText("Ly C: chờ duyệt, không còn là bản nháp.")).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "Ly C" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gửi duyệt 2 bản" })).toBeInTheDocument();
  });
});

describe("Gửi duyệt cả bộ: when there is no set to send", () => {
  it("explains that fewer than 2 drafts cannot be sent together, with a way back", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    await submitElsewhere(store, b);

    open(projectId, [a, b], renderers().factory);

    expect(
      await screen.findByRole("heading", { name: "Cần ít nhất 2 bản nháp" }, SLOW),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về dự án" })).toHaveAttribute(
      "href",
      STORE_ROUTES.design.project(projectId),
    );
    expect(posted()).toEqual([]);
  });

  it("explains that a closed project sends no set", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const ids = [await draftOf(store, projectId, "Ly A"), await draftOf(store, projectId, "Ly B")];
    settle(await store.archiveProject(projectId, { version: 0 }));

    open(projectId, ids, renderers().factory);

    expect(await screen.findByRole("heading", { name: "Dự án đã đóng" }, SLOW)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về dự án" })).toBeInTheDocument();
  });

  it("says when the project is not found", async () => {
    open("7d51f000-0000-4000-8000-0000000000ff", [], renderers().factory);

    expect(
      await screen.findByRole("heading", { name: "Không tìm thấy dự án" }, SLOW),
    ).toBeInTheDocument();
  });
});
