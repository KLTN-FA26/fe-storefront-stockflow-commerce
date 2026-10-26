import { createHash } from "node:crypto";

import type { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/error";
import { seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import type { MockDesignStudio } from "@/lib/api/mock-fixtures/designs";
import { settle } from "@/test/fake-backend";
import { renderWithProviders, signIn, signOut } from "@/test/render";

import { DesignStudio } from "../components/studio/design-studio";
import type { ExportRenderer } from "../components/studio/export-renderer";
import type { StudioServices } from "../components/studio/studio-context";
import {
  documentChecksum,
  emptyDocument,
  mmToPt,
  setBackground,
  type CustomizationTemplate,
  type DesignDocument,
  type DesignElement,
  type PrintAreaCode,
} from "../engine";
import { bagM, cup12oz, imageEl, PNG_1x1, pngBytes, textEl } from "../engine/__tests__/fixtures";
import { designKeys } from "../queries";
import { fakeDesignBackend, idempotencyKeyOf, mockStudio, queryOf } from "./design-backend";
import { TEST_FONTS } from "./fixtures";

const env = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));
vi.mock("@/providers/app-providers", () => ({ useIsMock: () => true }));

// Each test renders the whole studio and walks a workflow: well over 5 s in a loaded full run.
vi.setConfig({ testTimeout: 20_000 });
/** Export, three uploads, spec and request: longer than the 1 s wait default on a loaded machine. */
const SUBMISSION = { timeout: 4000 };

beforeEach(() => {
  env.push.mockReset();
  signIn();
  // jsdom has no canvas: `getContext` logs "not implemented" before answering null (no 2D, no WebGL).
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Element.prototype.scrollIntoView = vi.fn();
  // Every image link serves a file, and a decoder reads it: the design's images load.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("png")),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 600, height: 600, close: () => undefined })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  signOut();
});

type Kind = "cup" | "bag";

const PRODUCTS: Record<
  Kind,
  { slug: string; sku: string; templateCode: string; template: CustomizationTemplate }
> = {
  cup: {
    slug: "ly-giay-2-lop-12oz",
    sku: "CUP-PAPER-12OZ-WHT",
    templateCode: "CUP12-BODY",
    template: cup12oz,
  },
  bag: { slug: "tui-giay-kraft", sku: "BAG-KRAFT-M", templateCode: "BAGM-4F", template: bagM },
};

/** On the 12oz cup body: `u` across the band, half-way down it. */
const at = (u: number, v = 55) => ({ placement: { u, v, rotationDeg: 0, scale: 1 } });
const coffee = () => textEl("text", { content: "Cà phê", ...at(170) });

/** A new draft of `kind` (P1); `assets` are uploaded first (their ids go to `place`). */
async function draft(
  studio: MockDesignStudio,
  kind: Kind,
  place: (assetIds: string[]) => Partial<Record<PrintAreaCode, DesignElement[]>> = () => ({}),
  assets: { width: number; height: number }[] = [],
) {
  const { slug, sku, templateCode, template } = PRODUCTS[kind];
  const product = seedMockCatalog().find((p) => p.slug === slug)!;
  const created = settle(
    await studio.create({ productId: product.productId, sku, templateCode, name: "Thiết kế thử" }),
  );
  const { id } = created.data as { id: string };
  const assetIds: string[] = [];
  for (const [i, { width, height }] of assets.entries()) {
    const file = new File([pngBytes(width, height)], `logo-${i}.png`, { type: "image/png" });
    const stored = settle(await studio.uploadAsset(id, file, `asset-key-${i}`));
    assetIds.push((stored.data as { assetId: string }).assetId);
  }
  const document = emptyDocument(template);
  for (const [code, elements] of Object.entries(place(assetIds))) {
    document.surfaces[code as PrintAreaCode] = { background: { kind: "none" }, elements };
  }
  settle(await studio.putDocument(id, { version: 0, document }));
  return id;
}

const versionOf = (studio: MockDesignStudio, id: string) =>
  (settle(studio.get(id)).data as { version: number }).version;

/** The design as QC passed it: a current preview, then a passed technical review. */
async function passReview(studio: MockDesignStudio, id: string) {
  const preview = new File([new Uint8Array(8).fill(7)], "preview.png", { type: "image/png" });
  settle(await studio.uploadArtifact(id, "CUSTOMER_PREVIEW", preview, "preview-key-1"));
  settle(studio.completeReview(id, true, "Đạt kỹ thuật"));
}

/** Sales sent the passed design to the customer: SUBMITTED. */
async function sendToCustomer(studio: MockDesignStudio, id: string) {
  await passReview(studio, id);
  settle(studio.submit(id, { version: versionOf(studio, id) }));
}

/** Export rendering stands in for the canvases jsdom lacks: every picture is a 1 × 1 PNG. */
const fakeRenderer = () => ({
  preview: vi.fn<ExportRenderer["preview"]>(async () => PNG_1x1),
  printSurface: vi.fn<ExportRenderer["printSurface"]>(async () => [{ png: PNG_1x1, heightPx: 1 }]),
  specSheet: vi.fn<ExportRenderer["specSheet"]>(async () => PNG_1x1),
  release: vi.fn<ExportRenderer["release"]>(),
});

type Seen = { current?: StudioServices; client?: QueryClient };

/** Renders the studio of `designId`; resolves once it is laid out, with its latest services. */
async function openStudio(designId: string, renderer: ExportRenderer = fakeRenderer()) {
  const seen: Seen = {};
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
  seen.client = client;
  await screen.findByRole("tablist", { name: "Mặt in" });
  return seen;
}

/** One background change on the body: an edit autosave picks up. */
const paintBody = (services: StudioServices, color: `#${string}`) =>
  act(() => services.editor.apply((doc) => setBackground(doc, "BODY", { kind: "color", color })));

const SAVED = /^Đã lưu lúc \d{2}:\d{2}$/;

type PostSpy = ReturnType<typeof fakeDesignBackend>["post"];

const artifactPosts = (post: PostSpy) =>
  post.mock.calls.filter(([url]) => /\/artifacts$/.test(url));
/** The roles of the artifacts uploaded so far, in order. */
const roles = (post: PostSpy) => artifactPosts(post).map(([, , config]) => queryOf(config).role);
const uploadOf = (post: PostSpy, role: string) =>
  artifactPosts(post).find(([, , config]) => queryOf(config).role === role)!;
const fileOf = (post: PostSpy, role: string) =>
  (uploadOf(post, role)[1] as FormData).get("file") as File;

/** R67: SHA-256 hex of hex(bytes) + "\0" + name + "\0" + type + "\0" + role. */
const artifactKey = (bytes: Uint8Array, name: string, type: string, role: string) =>
  createHash("sha256")
    .update(`${Buffer.from(bytes).toString("hex")}\0${name}\0${type}\0${role}`)
    .digest("hex");

async function sendForReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Gửi QC kiểm tra" }));
  const dialog = await screen.findByRole("dialog", { name: "Gửi QC kiểm tra" });
  await user.click(within(dialog).getByRole("button", { name: "Gửi" }));
  return dialog;
}

describe("preflight panel", () => {
  it("locates a preflight issue on click", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    // 300 px over 60 mm: 127 DPI, under the bag's 150 DPI minimum.
    const low = (assetId: string) =>
      imageEl("low", { assetId, naturalWidthPx: 300, naturalHeightPx: 200 });
    const id = await draft(studio, "bag", ([asset]) => ({ BACK: [low(asset!)] }), [
      { width: 300, height: 200 },
    ]);
    const seen = await openStudio(id);

    await user.click(screen.getByRole("tab", { name: "Kiểm tra" }));
    const panel = screen.getByRole("region", { name: "Kết quả kiểm tra" });
    expect(within(panel).getByText("1 lỗi")).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Mặt sau" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Mặt trước" })).toHaveAttribute("aria-selected", "true");

    await user.click(within(panel).getByRole("button", { name: /127 DPI/ }));

    expect(screen.getByRole("tab", { name: "Mặt sau" })).toHaveAttribute("aria-selected", "true");
    expect(seen.current!.editor.store.getState()).toMatchObject({
      activeSurface: "BACK",
      selectedId: "low",
    });
  });

  it("sums up a clean design and shows the notes QC left", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    const preview = new File([new Uint8Array(8).fill(3)], "preview.png", { type: "image/png" });
    settle(await studio.uploadArtifact(id, "CUSTOMER_PREVIEW", preview, "preview-key-2"));
    settle(studio.completeReview(id, false, "Chữ quá sát mép, hãy dời vào trong."));
    await openStudio(id);

    await user.click(screen.getByRole("tab", { name: "Kiểm tra" }));
    const panel = screen.getByRole("region", { name: "Kết quả kiểm tra" });
    expect(within(panel).getByText("Đạt")).toBeInTheDocument();
    expect(within(panel).getByText("Chữ quá sát mép, hãy dời vào trong.")).toBeInTheDocument();
  });
});

describe("review submission", () => {
  it("blocks review submission while preflight fails", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    await openStudio(await draft(studio, "cup"));

    await user.click(screen.getByRole("button", { name: "Gửi QC kiểm tra" }));
    const dialog = await screen.findByRole("dialog", { name: "Gửi QC kiểm tra" });

    expect(within(dialog).getByText("Sửa các lỗi trước khi gửi kiểm tra.")).toBeInTheDocument();
    expect(within(dialog).getByText("Thiết kế chưa có nội dung.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Gửi" })).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("submits for review: three artifacts, spec, then the review request", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post, put } = fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    const renderer = fakeRenderer();
    const seen = await openStudio(id, renderer);

    await sendForReview(user);

    await waitFor(
      () => expect(roles(post)).toEqual(["CUSTOMER_PREVIEW", "PRINT_READY", "TECHNICAL_SPEC"]),
      SUBMISSION,
    );
    await waitFor(
      () => expect(post.mock.lastCall?.[0]).toMatch(/technical-review-requests$/),
      SUBMISSION,
    );
    expect(put.mock.lastCall?.[0]).toMatch(/\/specification$/);

    // The print file: the body at 300 DPI, one page the size of its bleed box.
    const { flatBounds } = seen.current!.surfaces.byCode.BODY!;
    expect(renderer.printSurface).toHaveBeenCalledWith(
      "BODY",
      expect.objectContaining({ templateCode: "CUP12-BODY" }),
      300 / 25.4,
    );
    const pdf = await PDFDocument.load(
      new Uint8Array(await fileOf(post, "PRINT_READY").arrayBuffer()),
    );
    expect(pdf.getPageCount()).toBe(1);
    const page = pdf.getPage(0).getSize();
    expect(page.width).toBeCloseTo(mmToPt(flatBounds.width), 3);
    expect(page.height).toBeCloseTo(mmToPt(flatBounds.height), 3);
    expect(fileOf(post, "TECHNICAL_SPEC").type).toBe("application/pdf");

    // Each upload is keyed by its bytes, name, type and role (R67).
    expect(idempotencyKeyOf(uploadOf(post, "CUSTOMER_PREVIEW")[2])).toBe(
      artifactKey(PNG_1x1, "preview.png", "image/png", "CUSTOMER_PREVIEW"),
    );

    // The specification is the summary text: template, preflight and the document's checksum.
    const { spec } = put.mock.lastCall?.[1] as { spec: string };
    expect(spec).toContain("Mẫu: CUP12-BODY");
    expect(spec).toContain("Preflight: Pass");
    expect(spec).toMatch(/SHA-256: [0-9a-f]{64}$/);

    expect(await screen.findByRole("button", { name: "Đang chờ QC" })).toBeDisabled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(renderer.release).toHaveBeenCalled();

    // R48: the autosaver took the version the review request left; an edit (which withdraws the
    // request, once the customer says so) saves, no conflict.
    paintBody(seen.current!, "#00FF00");
    const ask = await screen.findByRole("dialog", {
      name: "Chỉnh sửa sẽ huỷ yêu cầu kiểm tra QC. Tiếp tục?",
    });
    await user.click(within(ask).getByRole("button", { name: "Tiếp tục chỉnh sửa" }));
    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(put.mock.lastCall?.[0]).toMatch(/\/document$/);
    expect(screen.queryByText("Thiết kế đã thay đổi ở nơi khác")).not.toBeInTheDocument();
  });

  it("retries a failed step without redoing the files already uploaded", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    const answer = post.getMockImplementation()!;
    let failed = false;
    post.mockImplementation(async (url, body, config) => {
      if (/\/artifacts$/.test(url) && queryOf(config).role === "TECHNICAL_SPEC" && !failed) {
        failed = true;
        throw new ApiError(500, "INTERNAL_ERROR", "Storage unavailable");
      }
      return answer(url, body, config);
    });
    const renderer = fakeRenderer();
    await openStudio(await draft(studio, "cup", () => ({ BODY: [coffee()] })), renderer);

    const dialog = await sendForReview(user);
    const retry = await within(dialog).findByRole("button", { name: "Thử lại" }, SUBMISSION);
    expect(within(dialog).getByText(/Hệ thống đang gặp sự cố/)).toBeInTheDocument();
    await user.click(retry);

    await waitFor(
      () => expect(post.mock.lastCall?.[0]).toMatch(/technical-review-requests$/),
      SUBMISSION,
    );
    expect(roles(post)).toEqual([
      "CUSTOMER_PREVIEW",
      "PRINT_READY",
      "TECHNICAL_SPEC",
      "TECHNICAL_SPEC",
    ]);
    expect(renderer.preview).toHaveBeenCalledTimes(1);
    expect(renderer.printSurface).toHaveBeenCalledTimes(1);
  });

  it("leaves autosave on the version the uploads left when the review request fails", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post, put } = fakeDesignBackend(studio);
    const answer = post.getMockImplementation()!;
    post.mockImplementation(async (url, body, config) => {
      if (/technical-review-requests$/.test(url)) {
        throw new ApiError(500, "INTERNAL_ERROR", "Review queue unavailable");
      }
      return answer(url, body, config);
    });
    const seen = await openStudio(await draft(studio, "cup", () => ({ BODY: [coffee()] })));

    const dialog = await sendForReview(user);
    await within(dialog).findByRole("button", { name: "Thử lại" }, SUBMISSION);
    await user.click(within(dialog).getByRole("button", { name: "Huỷ" }));

    // Three uploads and the specification moved the version on: the next save sends that one.
    paintBody(seen.current!, "#00FF00");
    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(put.mock.lastCall?.[0]).toMatch(/\/document$/);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stops before asking QC when the document changed elsewhere, and offers the reload", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post, put } = fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    const elsewhere: DesignDocument = emptyDocument(cup12oz);
    elsewhere.surfaces.BODY = { background: { kind: "color", color: "#00FF00" }, elements: [] };
    const answer = post.getMockImplementation()!;
    let changed = false;
    post.mockImplementation(async (url, body, config) => {
      const result = await answer(url, body, config);
      if (!changed && /\/artifacts$/.test(url) && queryOf(config).role === "TECHNICAL_SPEC") {
        // Another tab saves the document once the files are up, before the review request.
        changed = true;
        settle(
          await studio.putDocument(id, { version: versionOf(studio, id), document: elsewhere }),
        );
      }
      return result;
    });
    const renderer = fakeRenderer();
    const seen = await openStudio(id, renderer);

    await sendForReview(user);
    // R69: the review dialog gives way to the conflict dialog; nothing more is sent.
    const conflict = await screen.findByRole(
      "dialog",
      { name: "Thiết kế đã thay đổi ở nơi khác" },
      SUBMISSION,
    );
    expect(screen.queryByRole("dialog", { name: "Gửi QC kiểm tra" })).not.toBeInTheDocument();
    const urls = () => [...post.mock.calls, ...put.mock.calls].map(([url]) => url);
    expect(urls().filter((url) => /(specification|technical-review-requests)$/.test(url))).toEqual(
      [],
    );

    await user.click(within(conflict).getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(seen.current!.editor.store.getState().document.surfaces.BODY).toEqual(
      elsewhere.surfaces.BODY,
    );

    // Sent again, the reloaded design is exported anew and reaches QC.
    await sendForReview(user);
    await waitFor(
      () => expect(post.mock.lastCall?.[0]).toMatch(/technical-review-requests$/),
      SUBMISSION,
    );
    expect(renderer.preview).toHaveBeenCalledTimes(2);
    expect(renderer.printSurface).toHaveBeenCalledTimes(2);
    const { spec } = put.mock.lastCall?.[1] as { spec: string };
    expect(spec).toContain(`SHA-256: ${await documentChecksum(elsewhere)}`);
  });
});

describe("workflow actions", () => {
  it("finalizes with the risk checkbox when warnings exist, then shows the confirmed card", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    // 600 px over 80 mm: 190 DPI, over the 12oz cup's 150 but under the print file's 300 (DPI_LOW, a warning).
    const photo = (assetId: string) =>
      imageEl("photo", {
        assetId,
        naturalWidthPx: 600,
        naturalHeightPx: 400,
        widthMm: 80,
        heightMm: 160 / 3,
        ...at(140),
      });
    const id = await draft(studio, "cup", ([asset]) => ({ BODY: [photo(asset!)] }), [
      { width: 600, height: 400 },
    ]);
    await passReview(studio, id);
    await openStudio(id);

    await user.click(screen.getByRole("button", { name: "Chốt thiết kế" }));
    const dialog = await screen.findByRole("dialog", { name: "Chốt thiết kế?" });
    expect(within(dialog).getByText("Ảnh đạt 190 DPI, bản in có thể hơi mờ.")).toBeInTheDocument();
    const finalize = within(dialog).getByRole("button", { name: "Xác nhận chốt" });
    expect(finalize).toBeDisabled();
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "Tôi đã xem các cảnh báo và chấp nhận rủi ro khi in",
      }),
    );
    await user.click(finalize);

    const card = await screen.findByRole("region", { name: "Bản chốt" });
    const snapshotId = (settle(studio.snapshot(id)).data as { id: string }).id;
    expect(await within(card).findByText(snapshotId)).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith(`/designs/${id}/confirmations`, expect.anything());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Sao chép mã" }));
    expect(await navigator.clipboard.readText()).toBe(snapshotId);
    expect(screen.getByText("Đã sao chép mã bản chốt")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Yêu cầu báo giá" })).toHaveAttribute(
      "href",
      "/chat",
    );
    expect(screen.getByRole("button", { name: "Tạo phiên bản mới" })).toBeInTheDocument();
  });

  it("confirms a design Sales sent without the checkbox when nothing warns", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    await sendToCustomer(studio, id);
    await openStudio(id);

    await user.click(screen.getByRole("button", { name: "Xác nhận thiết kế" }));
    const dialog = await screen.findByRole("dialog", { name: "Xác nhận thiết kế?" });
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));

    expect(await screen.findByRole("region", { name: "Bản chốt" })).toBeInTheDocument();
    expect(post).not.toHaveBeenCalledWith(
      `/designs/${id}/confirmation-requests`,
      expect.anything(),
    );
  });

  it("asks for a reason before requesting changes", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    await sendToCustomer(studio, id);
    await openStudio(id);
    const version = versionOf(studio, id);

    await user.click(screen.getByRole("button", { name: "Yêu cầu sửa" }));
    const dialog = await screen.findByRole("dialog", { name: "Yêu cầu sửa thiết kế" });
    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu sửa" }));
    expect(await within(dialog).findByText("Hãy nhập lý do")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Lý do yêu cầu sửa"), "  Đổi chữ sang màu đỏ ");
    await user.click(within(dialog).getByRole("button", { name: "Gửi yêu cầu sửa" }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/designs/${id}/change-requests`, {
        version,
        reason: "Đổi chữ sang màu đỏ",
      }),
    );
    // SUBMITTED → DRAFT with the customer's reason: editable again, the reason shown as the notes.
    await waitFor(() => expect(screen.getByRole("button", { name: "Chữ (T)" })).toBeEnabled());
    await user.click(screen.getByRole("tab", { name: "Kiểm tra" }));
    expect(screen.getByText("Đổi chữ sang màu đỏ")).toBeInTheDocument();
  });

  it("shows the conflict dialog on 409 and reloads", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { put } = fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    const seen = await openStudio(id);
    // Another tab saved first: the stored design moved on to version 2.
    const elsewhere = emptyDocument(cup12oz);
    elsewhere.surfaces.BODY = { background: { kind: "color", color: "#00FF00" }, elements: [] };
    settle(await studio.putDocument(id, { version: 1, document: elsewhere }));

    paintBody(seen.current!, "#FF0000");
    const dialog = await screen.findByRole(
      "dialog",
      { name: "Thiết kế đã thay đổi ở nơi khác" },
      { timeout: 4000 },
    );

    // jsdom has no object URLs: a URL class that has them stands in for this test.
    const createObjectURL = vi.fn((_blob: Blob) => "blob:backup");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static override createObjectURL = createObjectURL;
        static override revokeObjectURL = revokeObjectURL;
      },
    );
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await user.click(within(dialog).getByRole("button", { name: "Tải bản sao JSON" }));
    expect(download).toHaveBeenCalledTimes(1);
    const backup = JSON.parse(await createObjectURL.mock.calls[0]![0].text()) as {
      surfaces: { BODY: { background: unknown } };
    };
    expect(backup.surfaces.BODY.background).toEqual({ kind: "color", color: "#FF0000" });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:backup");

    await user.click(within(dialog).getByRole("button", { name: "Tải lại" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const state = seen.current!.editor.store.getState();
    expect(state.document.surfaces.BODY?.background).toEqual({ kind: "color", color: "#00FF00" });
    expect(state.canUndo).toBe(false);

    // Saving goes on from the reloaded version.
    paintBody(seen.current!, "#0000FF");
    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(put.mock.lastCall?.[1]).toMatchObject({ version: 2 });
  });
});

describe("autosave and the other writers of a design (R69)", () => {
  it("opens the conflict dialog when another tab saved the document, and saves nothing over it", async () => {
    const studio = mockStudio();
    const { put } = fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    const seen = await openStudio(id);
    const elsewhere = emptyDocument(cup12oz);
    elsewhere.surfaces.BODY = { background: { kind: "color", color: "#00FF00" }, elements: [] };
    settle(await studio.putDocument(id, { version: 1, document: elsewhere }));

    // The window regains focus: the design is read again, at the other tab's version.
    await act(() =>
      seen.client!.invalidateQueries({ queryKey: designKeys.detail(id), exact: true }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Thiết kế đã thay đổi ở nơi khác" }),
    ).toBeInTheDocument();

    const saves = put.mock.calls.length;
    paintBody(seen.current!, "#FF0000");
    await act(() => new Promise((resolve) => setTimeout(resolve, 2000))); // past autosave's wait
    expect(put.mock.calls.length).toBe(saves);
    expect(settle(studio.getDocument(id)).data).toMatchObject({ document: elsewhere });
  });

  it("saves an edit over a QC answer that landed between two polls, without a dialog", async () => {
    const studio = mockStudio();
    const { put } = fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    const seen = await openStudio(id);
    // QC answered (a preview upload and the review: two version bumps) before the next poll.
    await passReview(studio, id);

    paintBody(seen.current!, "#FF0000");
    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(put.mock.calls.map(([, body]) => (body as { version: number }).version)).toEqual([
      1, // refused: the design is at 3 now
      3,
    ]);
    expect(settle(studio.getDocument(id)).data).toMatchObject({
      document: { surfaces: { BODY: { background: { kind: "color", color: "#FF0000" } } } },
    });
  });

  it("does not save over another device's document when the design was read after it (R69)", async () => {
    const studio = mockStudio();
    const { get, put } = fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    // The document was read before another device saved; the design after it (a newer version).
    const before = settle(studio.getDocument(id));
    const elsewhere = emptyDocument(cup12oz);
    elsewhere.surfaces.BODY = { background: { kind: "color", color: "#00FF00" }, elements: [] };
    settle(await studio.putDocument(id, { version: 1, document: elsewhere }));
    const answer = get.getMockImplementation()!;
    let stale = true;
    get.mockImplementation(async (url, config) => {
      if (stale && url === `/designs/${id}/document`) {
        stale = false;
        return before;
      }
      return answer(url, config);
    });
    const seen = await openStudio(id);

    expect(
      await screen.findByRole("dialog", { name: "Thiết kế đã thay đổi ở nơi khác" }),
    ).toBeInTheDocument();
    paintBody(seen.current!, "#FF0000");
    await act(() => new Promise((resolve) => setTimeout(resolve, 2000))); // past autosave's wait
    expect(put).not.toHaveBeenCalled();
    expect(settle(studio.getDocument(id)).data).toMatchObject({ document: elsewhere });
  });

  it("asks the stored document again after a failed read, and still finds the other save", async () => {
    const studio = mockStudio();
    const { get } = fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    const seen = await openStudio(id);
    const elsewhere = emptyDocument(cup12oz);
    elsewhere.surfaces.BODY = { background: { kind: "color", color: "#00FF00" }, elements: [] };
    settle(await studio.putDocument(id, { version: 1, document: elsewhere }));
    // The read fails past the query's own two retries.
    const answer = get.getMockImplementation()!;
    let failures = 0;
    get.mockImplementation(async (url, config) => {
      if (failures < 3 && url === `/designs/${id}/document`) {
        failures += 1;
        throw new ApiError(503, "SERVICE_UNAVAILABLE", "Document service down");
      }
      return answer(url, config);
    });

    await act(() =>
      seen.client!.invalidateQueries({ queryKey: designKeys.detail(id), exact: true }),
    );
    expect(
      await screen.findByRole(
        "dialog",
        { name: "Thiết kế đã thay đổi ở nơi khác" },
        { timeout: 10_000 },
      ),
    ).toBeInTheDocument();
    expect(failures).toBe(3);
  });
});

describe("finalizing an edited design", () => {
  it("finishes a finalize whose confirmation failed after the submit went through", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post } = fakeDesignBackend(studio);
    const answer = post.getMockImplementation()!;
    let failed = false;
    post.mockImplementation(async (url, body, config) => {
      if (!failed && /\/confirmations$/.test(url)) {
        failed = true;
        throw new ApiError(503, "SERVICE_UNAVAILABLE", "Confirmation service down");
      }
      return answer(url, body, config);
    });
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    await passReview(studio, id);
    await openStudio(id);

    await user.click(screen.getByRole("button", { name: "Chốt thiết kế" }));
    const dialog = await screen.findByRole("dialog", { name: "Chốt thiết kế?" });
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận chốt" }));
    expect(await within(dialog).findByText(/Hệ thống đang gặp sự cố/)).toBeInTheDocument();

    // The design is SUBMITTED now: the retry only confirms it.
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận chốt" }));
    expect(await screen.findByRole("region", { name: "Bản chốt" })).toBeInTheDocument();
    const urls = post.mock.calls.map(([url]) => url);
    expect(urls.filter((url) => url.endsWith("/confirmation-requests"))).toHaveLength(1);
    expect(urls.filter((url) => url.endsWith("/confirmations"))).toHaveLength(2);
  });

  it("saves a pending edit first, and stops when that save sends the design back to QC", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { post, put } = fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    await passReview(studio, id);
    // The document save waits until the test lets it through.
    const answer = put.getMockImplementation()!;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    put.mockImplementation(async (url, body, config) => {
      if (/\/document$/.test(url)) await held;
      return answer(url, body, config);
    });
    const seen = await openStudio(id);

    paintBody(seen.current!, "#00FF00"); // still inside autosave's 1.5 s wait, once accepted
    const ask = await screen.findByRole("dialog", {
      name: "Chỉnh sửa sẽ huỷ kết quả kiểm tra QC. Tiếp tục?",
    });
    await user.click(within(ask).getByRole("button", { name: "Tiếp tục chỉnh sửa" }));
    await user.click(screen.getByRole("button", { name: "Chốt thiết kế" }));
    const dialog = await screen.findByRole("dialog", { name: "Chốt thiết kế?" });
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận chốt" }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(`/designs/${id}/document`, expect.anything()),
    );
    expect(within(dialog).getByRole("button", { name: "Quay lại" })).toBeDisabled();
    release();

    expect(
      await within(dialog).findByText(
        "Thay đổi vừa lưu đã huỷ kết quả kiểm tra. Hãy gửi QC kiểm tra lại trước khi chốt.",
      ),
    ).toBeInTheDocument();
    const writes = post.mock.calls.map(([url]) => url);
    expect(writes.filter((url) => /(confirmation-requests|confirmations)$/.test(url))).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Quay lại" }));
    expect(await screen.findByRole("button", { name: "Gửi QC kiểm tra" })).toBeInTheDocument();
  });
});

/** QC is looking at the design (a current preview and a review request): awaitingReview. */
async function askForReview(studio: MockDesignStudio, id: string) {
  const preview = new File([new Uint8Array(8).fill(7)], "preview.png", { type: "image/png" });
  settle(await studio.uploadArtifact(id, "CUSTOMER_PREVIEW", preview, "preview-key-1"));
  settle(studio.requestReview(id, { version: versionOf(studio, id) }));
}

describe("editing a design QC is involved in (spec §7.5)", () => {
  const BLANK = { kind: "none" };

  it("asks before the first edit voids the passed review: Huỷ puts the design back", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { put } = fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    await passReview(studio, id);
    const seen = await openStudio(id);

    paintBody(seen.current!, "#FF0000");
    const ask = await screen.findByRole("dialog", {
      name: "Chỉnh sửa sẽ huỷ kết quả kiểm tra QC. Tiếp tục?",
    });
    await user.click(within(ask).getByRole("button", { name: "Huỷ" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(seen.current!.editor.store.getState().document.surfaces.BODY?.background).toEqual(BLANK);
    await act(() => new Promise((resolve) => setTimeout(resolve, 2000))); // past autosave's wait
    expect(put).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Chốt thiết kế" })).toBeInTheDocument();
  });

  it("puts back the design QC passed, however often the studio re-renders while it asks (N1)", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { put } = fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    await passReview(studio, id);
    const seen = await openStudio(id);
    const background = () =>
      seen.current!.editor.store.getState().document.surfaces.BODY?.background;
    const declineWhileTheStudioRerenders = async () => {
      const ask = await screen.findByRole("dialog", {
        name: "Chỉnh sửa sẽ huỷ kết quả kiểm tra QC. Tiếp tục?",
      });
      // A poll or an announcement re-renders the studio while the dialog is up.
      act(() => seen.current!.announce("Đang kiểm tra"));
      await user.click(within(ask).getByRole("button", { name: "Huỷ" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    };

    paintBody(seen.current!, "#FF0000");
    await declineWhileTheStudioRerenders();
    expect(background()).toEqual(BLANK);

    paintBody(seen.current!, "#0000FF");
    await declineWhileTheStudioRerenders();
    expect(background()).toEqual(BLANK);
    await act(() => new Promise((resolve) => setTimeout(resolve, 2000))); // past autosave's wait
    expect(put).not.toHaveBeenCalled();
  });

  it("saves the edit once the customer goes on, and asks only once", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    const { put } = fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    await passReview(studio, id);
    const seen = await openStudio(id);

    paintBody(seen.current!, "#FF0000");
    const ask = await screen.findByRole("dialog", {
      name: "Chỉnh sửa sẽ huỷ kết quả kiểm tra QC. Tiếp tục?",
    });
    await user.click(within(ask).getByRole("button", { name: "Tiếp tục chỉnh sửa" }));
    paintBody(seen.current!, "#0000FF");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(put).toHaveBeenCalledTimes(1);
    expect(settle(studio.getDocument(id)).data).toMatchObject({
      document: { surfaces: { BODY: { background: { kind: "color", color: "#0000FF" } } } },
    });
  });

  it("asks before the first edit withdraws the review request", async () => {
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    await askForReview(studio, id);
    const seen = await openStudio(id);

    paintBody(seen.current!, "#FF0000");
    expect(
      await screen.findByRole("dialog", {
        name: "Chỉnh sửa sẽ huỷ yêu cầu kiểm tra QC. Tiếp tục?",
      }),
    ).toBeInTheDocument();
  });

  it("does not ask while the design is only being edited", async () => {
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const seen = await openStudio(await draft(studio, "cup", () => ({ BODY: [coffee()] })));
    paintBody(seen.current!, "#FF0000");
    expect(await screen.findByText(SAVED, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("the status strip", () => {
  it("says what an edit does to a design waiting for QC", async () => {
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    await askForReview(studio, id);
    await openStudio(id);

    const strip = screen.getByRole("region", { name: "Trạng thái thiết kế" });
    expect(
      within(strip).getByText(
        "QC đang kiểm tra thiết kế của bạn. Chỉnh sửa lúc này sẽ huỷ yêu cầu kiểm tra.",
      ),
    ).toBeInTheDocument();
  });

  it("opens the QC notes", async () => {
    const user = userEvent.setup();
    const studio = mockStudio();
    fakeDesignBackend(studio);
    const id = await draft(studio, "cup", () => ({ BODY: [coffee()] }));
    await passReview(studio, id);
    await openStudio(id);

    const strip = screen.getByRole("region", { name: "Trạng thái thiết kế" });
    await user.click(within(strip).getByRole("button", { name: "Ghi chú QC" }));
    const notes = await screen.findByRole("dialog", { name: "Ghi chú kiểm tra" });
    expect(within(notes).getByText("Đạt kỹ thuật")).toBeInTheDocument();
  });
});
