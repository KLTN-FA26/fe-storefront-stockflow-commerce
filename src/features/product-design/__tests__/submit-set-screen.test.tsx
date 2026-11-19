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
// The print file needs its colour profiles: jsdom serves no `public/` files.
vi.mock(
  "../components/studio/print-profiles",
  async () => (await import("./print-profiles-stub")).printProfilesStub,
);

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
  // Deterministic, as the real files of an unchanged layout are: a repair must work for identical
  // bytes (its upload key carries a nonce of its own), not because the stand-ins differ per draw.
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
      printVector: vi.fn(async () => null),
      printSheetFace: vi.fn(async () => ({ content: "", images: [], alphas: [], layers: [] })),
      printSlug: vi.fn(async () => PNG_1x1),
      designBrief: vi.fn(async () => [PNG_1x1]),
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
  backend.post.mock.calls.filter(([url]) => url === `/designs/${id}/artifacts`);
/** A design's files go one request each (preview, print file, spec sheet). */
const FILES = 3;
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
      expect(failed.map((event) => event.note)).toEqual([`${empty}: EMPTY_DESIGN`]);
    }, SLOW);

    expect(posted().filter((url) => url.endsWith("/artifacts"))).toEqual([]);
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
    expect(uploadsOf(a)).toHaveLength(FILES);
    expect(uploadsOf(b)).toHaveLength(FILES);
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
      if (cut && args[0] === `/designs/${b}/artifacts`) {
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
    expect(uploadsOf(a)).toHaveLength(FILES);
    // b's first file was cut and sent again with the same key, then the other two followed.
    const [first, again] = uploadsOf(b);
    expect(uploadsOf(b)).toHaveLength(FILES + 1);
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
    expect(uploadsOf(a)).toHaveLength(2 * FILES);
    expect(uploadsOf(b)).toHaveLength(FILES);
    expect(rounds()).toHaveLength(2); // the first met a's moved version (409 CONFLICT)
    for (const id of [a, b]) expect((await designOf(store, id)).status).toBe("PENDING_REVIEW");
  });

  it("when the BE refuses the round with findings for a design, that row lists them and nothing is sent", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    backend.post.mockImplementation((...args: Parameters<typeof api.post>) => {
      if (args[0].endsWith("/review-rounds")) {
        return Promise.reject(
          new ApiError(422, "DESIGN_BATCH_PREFLIGHT_FAILED", "failed", undefined, undefined, {
            designs: [{ designId: b, issues: [{ rule: "EMPTY_DESIGN", message: "empty" }] }],
          }),
        );
      }
      return realPost(...args);
    });
    const user = userEvent.setup();

    open(projectId, [a, b], renderers().factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));

    await screen.findByRole("alert", {}, SLOW);
    const failing = await rowOf("Ly B");
    await within(failing).findByText("Không đạt", {}, SLOW);
    expect(within(failing).getByText("Thiết kế chưa có nội dung.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa gửi bản nào");
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    expect(rounds()).toHaveLength(1); // the BE records the failed check itself: nothing more is sent
    for (const id of [a, b]) expect((await designOf(store, id)).status).toBe("DRAFT");
  });

  it("draws and uploads only the roles the BE names outdated, once, then asks for the round again", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    const draw = renderers();
    const releaseSecond = draw.hold(2);
    const user = userEvent.setup();

    open(projectId, [a, b], draw.factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));
    await within(await rowOf("Ly A")).findByText("Đã tải lên", {}, SLOW);
    // a's print file now reads as drawn from another layout (a template edited since).
    settle(await store.simulateOutdatedFiles(a, ["PRINT_READY"]));
    releaseSecond();

    await waitFor(
      () => expect(env.replace).toHaveBeenCalledWith(STORE_ROUTES.design.project(projectId)),
      SLOW,
    );
    expect(uploadsOf(a)).toHaveLength(FILES + 1); // the print file again, not the other two
    expect(uploadsOf(b)).toHaveLength(FILES);
    expect(rounds()).toHaveLength(2);
    // a's template is read afresh before its files are drawn again (a template edited on the server).
    const templateReads = backend.get.mock.calls.filter(
      ([url]) => url === `/designs/${a}/template`,
    );
    expect(templateReads.length).toBeGreaterThanOrEqual(1);
    // The repaired print file is the very same bytes: a replayed key would leave the old file
    // current and the round would be refused again. Its key has a nonce of its own, so the mock
    // (the BE's replay rules) takes it as the current file, and the round opens.
    const keys = uploadsOf(a)
      .filter(
        ([, , config]) => (config?.params as { role?: string } | undefined)?.role === "PRINT_READY",
      )
      .map(([, , config]) => config?.headers?.["Idempotency-Key"]);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    for (const id of [a, b]) expect((await designOf(store, id)).status).toBe("PENDING_REVIEW");
  });

  it("stops and asks the customer to try again when the files are outdated a second time", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    // Every round request finds a's print file drawn from another layout.
    backend.post.mockImplementation(async (...args: Parameters<typeof api.post>) => {
      if (args[0].endsWith("/review-rounds")) await store.simulateOutdatedFiles(a, ["PRINT_READY"]);
      return realPost(...args);
    });
    const user = userEvent.setup();

    open(projectId, [a, b], renderers().factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));

    const stopped = await rowOf("Ly A");
    expect(
      await within(stopped).findByText(
        "File của bản này chưa khớp với thiết kế nên chưa gửi được. Hãy thử lại.",
        {},
        SLOW,
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Thử lại" }, SLOW)).toBeInTheDocument();
    expect(rounds()).toHaveLength(2); // asked, repaired once, asked again: no loop
    expect(uploadsOf(a)).toHaveLength(FILES + 1);
    for (const id of [a, b]) expect((await designOf(store, id)).status).toBe("DRAFT");
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
    expect(posted().filter((url) => url.endsWith("/artifacts"))).toEqual([]);
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
    expect(posted().filter((url) => url.endsWith("/artifacts"))).toEqual([]);
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

/** The round's refusal as `post` answers it, everything else through the mock. */
function refuseRound(error: () => ApiError) {
  backend.post.mockImplementation(async (...args: Parameters<typeof api.post>) => {
    if (args[0].endsWith("/review-rounds")) throw error();
    return realPost(...args);
  });
}
const reopenLink = (row: HTMLElement) =>
  within(row).queryByRole("link", { name: "Mở lại thiết kế" });

describe("Gửi duyệt cả bộ: a round the BE refuses for some of its designs (BE-4)", () => {
  it("re-reads only the designs details.designIds names: one edited elsewhere is named, with its studio, and Thử lại draws only it again", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    const readsOf = (id: string) =>
      backend.get.mock.calls.filter(([url]) => url === `/designs/${id}`).length;
    // Another tab saves b's layout after its files went up: the mock, as the BE, checks the version
    // first and answers 409 CONFLICT naming b.
    let readsOfA = 0;
    let editB = true;
    backend.post.mockImplementation(async (...args: Parameters<typeof api.post>) => {
      if (args[0].endsWith("/review-rounds") && editB) {
        editB = false;
        const { version } = await designOf(store, b);
        settle(await store.putDocument(b, { version, document: textDocument("Trà sữa") }));
        readsOfA = readsOf(a);
      }
      return realPost(...args);
    });
    const draw = renderers();
    const user = userEvent.setup();

    open(projectId, [a, b], draw.factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));

    const named = await rowOf("Ly B");
    expect(
      await within(named).findByText("Bản này vừa được sửa ở nơi khác.", {}, SLOW),
    ).toBeInTheDocument();
    expect(reopenLink(named)).toHaveAttribute("href", STORE_ROUTES.design.detail(b));
    const other = await rowOf("Ly A");
    expect(within(other).getByText("Đã tải lên")).toBeInTheDocument();
    expect(reopenLink(other)).toBeNull();
    expect(readsOf(a)).toBe(readsOfA); // a is not named, so not read again
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa gửi bản nào");
    expect(screen.getByRole("alert")).toHaveTextContent("1 bản vừa thay đổi ở nơi khác");

    await user.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(
      () => expect(env.replace).toHaveBeenCalledWith(STORE_ROUTES.design.project(projectId)),
      SLOW,
    );
    expect(uploadsOf(a)).toHaveLength(FILES); // a kept its files
    expect(uploadsOf(b)).toHaveLength(2 * FILES); // b drawn and uploaded again
    expect(rounds()).toHaveLength(2);
  });

  /** b leaves DRAFT in another tab once its files are up, just before the round is asked for. */
  function moveBeforeRound(move: () => Promise<void>) {
    let once = true;
    backend.post.mockImplementation(async (...args: Parameters<typeof api.post>) => {
      if (args[0].endsWith("/review-rounds") && once) {
        once = false;
        await move();
      }
      return realPost(...args);
    });
  }

  it.each([
    [
      "sent for review",
      "Chờ duyệt",
      async (store: DesignMockStore, id: string) => submitElsewhere(store, id),
    ],
    [
      "approved",
      "Đã duyệt",
      async (store: DesignMockStore, id: string) => {
        await submitElsewhere(store, id);
        settle(await store.simulateApprove(id));
      },
    ],
  ])(
    "names a design %s elsewhere by its status, with its studio, and offers no Thử lại nor any redraw",
    async (_, label, move) => {
      const { store } = backend;
      const projectId = await newProject(store);
      const a = await draftOf(store, projectId, "Ly A");
      const b = await draftOf(store, projectId, "Ly B");
      moveBeforeRound(() => move(store, b));
      const draw = renderers();
      const user = userEvent.setup();

      open(projectId, [a, b], draw.factory);
      await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));

      const row = await rowOf("Ly B");
      expect(
        await within(row).findByText(
          `Bản này đang ở trạng thái “${label}”, không còn là bản nháp nên không gửi cùng bộ được.`,
          {},
          SLOW,
        ),
      ).toBeInTheDocument();
      expect(reopenLink(row)).toHaveAttribute("href", STORE_ROUTES.design.detail(b));
      expect(reopenLink(await rowOf("Ly A"))).toBeNull();
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("1 bản không còn là bản nháp");
      expect(alert).not.toHaveTextContent("vừa thay đổi ở nơi khác");
      expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Về dự án" })).toBeInTheDocument();
      await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
      expect(draw.previews()).toBe(2); // nothing drawn again
      expect(uploadsOf(b)).toHaveLength(FILES);
      expect(rounds()).toHaveLength(1);
    },
  );

  it("names a design returned elsewhere: its reviewer's reason is read first, no Thử lại nor redraw", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    moveBeforeRound(async () => {
      await submitElsewhere(store, b);
      settle(await store.simulateReturn(b, { reason: "Logo mờ" })); // a draft again, a new version
    });
    const draw = renderers();
    const user = userEvent.setup();

    open(projectId, [a, b], draw.factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));

    const row = await rowOf("Ly B");
    expect(
      await within(row).findByText(
        "Bản này vừa bị trả lại kèm góp ý. Hãy mở lại để xem góp ý trước khi gửi duyệt lại.",
        {},
        SLOW,
      ),
    ).toBeInTheDocument();
    expect(reopenLink(row)).toHaveAttribute("href", STORE_ROUTES.design.detail(b));
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    expect(draw.previews()).toBe(2);
    expect(rounds()).toHaveLength(1);
  });

  it.each([
    [
      "not started on a template",
      "/template",
      () =>
        new ApiError(404, "PRINT_CONFIG_NOT_FOUND", "This design was not started on a template"),
      "Bản này không gắn với khuôn in nào nên không gửi duyệt được. Hãy liên hệ cửa hàng.",
    ],
    [
      "with no layout",
      "/document",
      () => new ApiError(404, "NOT_FOUND", "This design has no layout"),
      "Bản này chưa có bố cục đã lưu nên không gửi duyệt được. Hãy liên hệ cửa hàng.",
    ],
  ])(
    "says a draft at the version sent was refused as one %s, with no retry that cannot help",
    async (_, path, refusal, sentence) => {
      const { store } = backend;
      const projectId = await newProject(store);
      const a = await draftOf(store, projectId, "Ly A");
      const b = await draftOf(store, projectId, "Ly B");
      // The BE's planning answers CONFLICT naming b; its own reads then say why. (The mock's
      // designs always have both, so this one read is the test's.)
      let refused = false;
      backend.post.mockImplementation(async (...args: Parameters<typeof api.post>) => {
        if (args[0].endsWith("/review-rounds")) {
          refused = true;
          throw new ApiError(409, "CONFLICT", "x", undefined, undefined, { designIds: [b] });
        }
        return realPost(...args);
      });
      backend.get.mockImplementation((...args: Parameters<typeof api.get>) =>
        refused && args[0] === `/designs/${b}${path}`
          ? Promise.reject(refusal())
          : realGet(...args),
      );
      const draw = renderers();
      const user = userEvent.setup();

      open(projectId, [a, b], draw.factory);
      await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));

      const row = await rowOf("Ly B");
      expect(await within(row).findByText(sentence, {}, SLOW)).toBeInTheDocument();
      expect(reopenLink(row)).toBeNull();
      expect(screen.getByRole("alert")).toHaveTextContent("Có bản không thể gửi cùng bộ");
      expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
      expect(draw.previews()).toBe(2);
    },
  );

  it("re-reads the set to find the changed design when the BE names none (an older BE)", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    // The mock names the designs; this BE strips the list off its refusal.
    backend.post.mockImplementation(async (...args: Parameters<typeof api.post>) => {
      try {
        return await realPost(...args);
      } catch (error) {
        if (error instanceof ApiError && args[0].endsWith("/review-rounds")) {
          throw new ApiError(error.status, error.code, error.message);
        }
        throw error;
      }
    });
    const draw = renderers();
    const releaseSecond = draw.hold(2);
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
    expect(reopenLink(changed)).toHaveAttribute("href", STORE_ROUTES.design.detail(a));
    expect(backend.get.mock.calls.some(([url]) => url === `/designs/${a}`)).toBe(true);
  });

  it("the mock names every design with a stale version, as the BE does", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    const c = await draftOf(store, projectId, "Ly C");
    const versions = await Promise.all(
      [a, b, c].map(async (id) => (await designOf(store, id)).version),
    );
    for (const id of [a, c]) {
      const { version } = await designOf(store, id);
      settle(await store.putDocument(id, { version, document: textDocument("Mới") }));
    }

    const refused = await api
      .post(`/design-projects/${projectId}/review-rounds`, {
        designs: [a, b, c].map((id, i) => ({ id, version: versions[i] })),
      })
      .catch((error: unknown) => error);

    expect(refused).toMatchObject({
      status: 409,
      code: "CONFLICT",
      details: { designIds: [a, c] },
    });
  });
});

describe("Gửi duyệt cả bộ: refusals the run cannot act on", () => {
  it("stops on a 422 it cannot read, and Thử lại draws and uploads every design anew, once", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    let refusals = 1;
    backend.post.mockImplementation(async (...args: Parameters<typeof api.post>) => {
      if (args[0].endsWith("/review-rounds") && refusals-- > 0) {
        throw new ApiError(422, "DESIGN_BATCH_PREFLIGHT_FAILED", "failed", undefined, undefined, {
          designs: "unreadable",
        });
      }
      return realPost(...args);
    });
    const draw = renderers();
    const user = userEvent.setup();

    open(projectId, [a, b], draw.factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));

    const alert = await screen.findByRole("alert", {}, SLOW);
    expect(alert).toHaveTextContent(
      "Máy chủ chưa nhận bộ thiết kế nhưng không cho biết bản nào chưa đạt. Bấm Thử lại để dựng và tải lên lại tất cả các bản.",
    );
    // It waits for the customer: no request of its own.
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    expect(rounds()).toHaveLength(1);
    expect(draw.previews()).toBe(2);

    await user.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(
      () => expect(env.replace).toHaveBeenCalledWith(STORE_ROUTES.design.project(projectId)),
      SLOW,
    );
    expect(draw.previews()).toBe(4); // each design drawn again
    expect(uploadsOf(a)).toHaveLength(2 * FILES);
    expect(uploadsOf(b)).toHaveLength(2 * FILES);
    expect(rounds()).toHaveLength(2);
    for (const id of [a, b]) expect((await designOf(store, id)).status).toBe("PENDING_REVIEW");
  });

  it("names a design that left the project when the round answers 404, and stops for good", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    const draw = renderers();
    const releaseSecond = draw.hold(2);
    const user = userEvent.setup();

    open(projectId, [a, b], draw.factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));
    await within(await rowOf("Ly A")).findByText("Đã tải lên", {}, SLOW);
    settle(await store.removeFromProject(projectId, a)); // taken out in another tab
    releaseSecond();

    const gone = await rowOf("Ly A");
    expect(
      await within(gone).findByText("Bản này không còn thuộc dự án.", {}, SLOW),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Một bản trong bộ không còn tồn tại hoặc đã rời khỏi dự án.",
    );
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    expect(within(await rowOf("Ly B")).queryByText("Bản này không còn thuộc dự án.")).toBeNull();
  });

  it("says one design of the set no longer exists when neither the BE nor a fresh read says which", async () => {
    const { store } = backend;
    const projectId = await newProject(store);
    const a = await draftOf(store, projectId, "Ly A");
    const b = await draftOf(store, projectId, "Ly B");
    const readsOfB = () => backend.get.mock.calls.filter(([url]) => url === `/designs/${b}`).length;
    let readsBefore = 0;
    refuseRound(() => {
      readsBefore = readsOfB();
      return new ApiError(404, "NOT_FOUND", "Not found");
    });
    const user = userEvent.setup();

    open(projectId, [a, b], renderers().factory);
    await user.click(await screen.findByRole("button", { name: "Gửi duyệt 2 bản" }, SLOW));

    const alert = await screen.findByRole("alert", {}, SLOW);
    expect(alert).toHaveTextContent(
      "Một bản trong bộ không còn tồn tại hoặc đã rời khỏi dự án. Hãy về dự án và chọn lại các bản.",
    );
    expect(alert).not.toHaveTextContent("Không tìm thấy thiết kế");
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    // The set is read again (fresh), which is how a design that is gone would be named.
    await waitFor(() => expect(readsOfB()).toBeGreaterThan(readsBefore));
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
