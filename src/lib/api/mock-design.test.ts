import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { api } from "./client";
import { ApiError } from "./error";
import { activateMockAdapter } from "./mock-adapter";
import { MOCK_QC_DELAY_MS, registerDesignMockRoutes } from "./mock-design";
import { createMockCatalog, seedMockCatalog } from "./mock-fixtures/catalog";
import { MOCK_DESIGN_IDS, createMockDesignStudio } from "./mock-fixtures/designs";

// Through the real axios client, mock adapter and route table: what the screens get with USE_MOCK=true.
// The store's rules are tested in mock-fixtures/designs.test.ts; here the routes are what is checked:
// path, method, body, query, multipart and header reach the right store method.
interface Draft {
  id: string;
  status: string;
  version: number;
  ownerUserId: string;
  customerId: string;
  sku: string;
  templateCode: string;
  productSlug?: string;
  currentArtifactId?: string;
  technicalReviewPassed: boolean;
  reviewNotes?: string;
  reviewRequestedAt?: string;
  parentSnapshotId?: string;
}
interface Stored {
  assetId: string;
  artifactId: string;
  role: string;
  widthPx: number;
  heightPx: number;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}
interface Page<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
}
interface Snapshot {
  id: string;
  draftId: string;
  artifactId: string;
  artifacts: Array<{ role: string }>;
}

const uuid = (n: number) => `5e5e0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const USER = uuid(0xa);
const CUSTOMER = uuid(0xb);
const CUP = seedMockCatalog().find((p) => p.slug === "ly-giay-2-lop-12oz")!;
const LID = seedMockCatalog().find((p) => p.slug === "nap-ly-90mm")!;
const QC_NOTES = "Mock QC: đạt kỹ thuật";

const png = (bytes: number, name = "logo.png") =>
  new File([new Uint8Array(bytes).fill(7)], name, { type: "image/png" });

/** The client's own `multipart()`: a FormData body, the JSON default overridden, the key in a header. */
function post<T>(
  url: string,
  file: File,
  headers: Record<string, string>,
  params?: Record<string, string>,
) {
  const body = new FormData();
  body.append("file", file, file.name);
  return api.post<T>(url, body, {
    headers: { "Content-Type": "multipart/form-data", ...headers },
    ...(params ? { params } : {}),
  });
}

const studio = () =>
  createMockDesignStudio({
    userId: USER,
    customerId: CUSTOMER,
    catalogKindOf: createMockCatalog(seedMockCatalog()).kindOf,
    newId: () => uuid(0x1000 + n++),
    readImageSize: async () => ({ width: 1200, height: 800 }),
    toUrl: (blob) => `blob:mock/${blob.size}`,
  });

const originalAdapter = api.defaults.adapter;
const scheduled: Array<{ run: () => void; delayMs: number }> = [];
let n = 0;

beforeAll(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(Math, "random").mockReturnValue(0.06); // no simulated 5% error, shortest latency
  activateMockAdapter();
  // The adapter looks a route up only after `registerAllMockRoutes()` ran: an unknown path settles
  // once it has, so the routes registered below replace the default ones and are not overwritten.
  vi.spyOn(console, "warn").mockImplementationOnce(() => {});
  await api.get("/routes-ready-probe").catch(() => undefined);

  registerDesignMockRoutes(studio(), {
    schedule: (run, delayMs) => scheduled.push({ run, delayMs }),
  });
});
afterAll(() => {
  vi.restoreAllMocks();
  if (originalAdapter) api.defaults.adapter = originalAdapter;
});

async function startDesign(name = "Ly quán Nhà Mình"): Promise<Draft> {
  const { data } = await api.post<Draft>("/designs/mine", {
    productId: CUP.productId,
    sku: "CUP-PAPER-12OZ-WHT",
    templateCode: "CUP12-BODY",
    name,
  });
  return data;
}

/** The newest scheduled mock-QC answer, run now instead of after its delay. */
function runScheduled() {
  const next = scheduled.pop();
  expect(next, "a mock QC answer was scheduled").toBeDefined();
  next?.run();
}

describe("mock design routes", () => {
  it("starts a design with POST /designs/mine and stores its empty document", async () => {
    const draft = await startDesign();
    expect(draft).toMatchObject({
      status: "DRAFT",
      version: 0,
      ownerUserId: USER,
      customerId: CUSTOMER,
      productSlug: "ly-giay-2-lop-12oz",
      sku: "CUP-PAPER-12OZ-WHT",
      templateCode: "CUP12-BODY",
    });

    const { data: record } = await api.get<{ designId: string; version: number; document: object }>(
      `/designs/${draft.id}/document`,
    );
    expect(record).toMatchObject({
      designId: draft.id,
      version: 0,
      document: {
        schemaVersion: 1,
        templateCode: "CUP12-BODY",
        surfaces: { BODY: { elements: [] } },
      },
    });
  });

  it("answers a refusal as an ApiError with the BE's code", async () => {
    await expect(
      api.post("/designs/mine", {
        productId: LID.productId,
        sku: "LID-90MM-BLK",
        templateCode: "X",
        name: "Nắp",
      }),
    ).rejects.toMatchObject({ status: 409, code: "PRODUCT_NOT_CUSTOMIZABLE" });
    await expect(api.get("/designs/not-a-design")).rejects.toBeInstanceOf(ApiError);
  });

  it("serves the customization templates of a product, beside the catalogue's own product route", async () => {
    const [custom, detail, standard] = await Promise.all([
      api.get<{ productId: string; kind: string; templates: Array<{ code: string; sku: string }> }>(
        "/catalog/products/ly-giay-2-lop-12oz/customization",
      ),
      api.get<{ slug: string; kind: string }>("/catalog/products/ly-giay-2-lop-12oz"),
      api.get("/catalog/products/nap-ly-90mm/customization").catch((error: unknown) => error),
    ]);
    expect(custom.data).toMatchObject({
      productId: CUP.productId,
      kind: "CUSTOMIZABLE",
      templates: [{ code: "CUP12-BODY", sku: "CUP-PAPER-12OZ-WHT" }],
    });
    expect(detail.data).toMatchObject({ slug: "ly-giay-2-lop-12oz", kind: "CUSTOMIZABLE" });
    expect(standard).toMatchObject({ status: 409, code: "PRODUCT_NOT_CUSTOMIZABLE" });
  });

  it("lists the caller's designs, filtered by status, page by page and newest first", async () => {
    const [approved, firstPage, all] = await Promise.all([
      api.get<Page<Draft>>("/designs", { params: { status: "APPROVED" } }),
      api.get<Page<Draft>>("/designs", { params: { page: 0, size: 1 } }),
      api.get<Page<Draft>>("/designs", { params: { size: 200 } }),
    ]);
    expect(approved.data.items.map((d) => d.id)).toEqual([MOCK_DESIGN_IDS.approvedCup]);
    expect(firstPage.data).toMatchObject({ page: 0, size: 1 });
    expect(firstPage.data.items).toHaveLength(1);
    expect(firstPage.data.totalElements).toBe(all.data.totalElements);
    expect(all.data.items.map((d) => d.id)).not.toContain(MOCK_DESIGN_IDS.foreign);
    await expect(api.get("/designs", { params: { status: "NOPE" } })).rejects.toMatchObject({
      status: 400,
      code: "UNSUPPORTED_PARAMETER",
    });
  });

  it("stores a customer image from a multipart upload and replays it for the same key", async () => {
    const { id } = await startDesign();
    const url = `/designs/${id}/assets`;

    const first = await post<Stored>(url, png(64), { "Idempotency-Key": "asset-1" });
    expect(first.status).toBe(201);
    expect(first.data).toMatchObject({
      widthPx: 1200,
      heightPx: 800,
      originalName: "logo.png",
      contentType: "image/png",
      sizeBytes: 64,
    });

    // The key is read case-insensitively: a lower-case header is the same request.
    const replay = await post<Stored>(url, png(64), { "idempotency-key": "asset-1" });
    expect(replay.data.assetId).toBe(first.data.assetId);
    await expect(post(url, png(65), { "Idempotency-Key": "asset-1" })).rejects.toMatchObject({
      status: 422,
      code: "IDEMPOTENCY_KEY_REUSED",
    });

    const [list, link] = await Promise.all([
      api.get<Stored[]>(url),
      api.get<{ url: string; expiresAt: string }>(`${url}/${first.data.assetId}/download-url`),
    ]);
    expect(list.data.map((a) => a.assetId)).toEqual([first.data.assetId]);
    expect(link.data.url).toBe("blob:mock/64");
  });

  it("refuses a multipart request without a file part", async () => {
    const { id } = await startDesign();
    await expect(api.post(`/designs/${id}/assets`, { note: "no file" })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_FAILED",
    });
    const body = new FormData();
    body.append("other", "x");
    await expect(
      api.post(`/designs/${id}/artifacts`, body, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
  });

  it("stores an artifact under the role of `params.role`, CUSTOMER_PREVIEW by default", async () => {
    const { id } = await startDesign();
    const url = `/designs/${id}/artifacts`;

    const print = await post<Stored>(
      url,
      png(32, "print.png"),
      { "Idempotency-Key": "print-1" },
      { role: "PRINT_READY" },
    );
    const preview = await post<Stored>(url, png(48, "preview.png"), {
      "Idempotency-Key": "prev-1",
    });
    expect(print.data).toMatchObject({ role: "PRINT_READY", originalName: "print.png" });
    expect(preview.data).toMatchObject({ role: "CUSTOMER_PREVIEW", originalName: "preview.png" });
    await expect(
      post(url, png(8), { "Idempotency-Key": "bad-1" }, { role: "NOT_A_ROLE" }),
    ).rejects.toMatchObject({ status: 400, code: "UNSUPPORTED_PARAMETER" });

    const [design, list, link] = await Promise.all([
      api.get<Draft>(`/designs/${id}`),
      api.get<Stored[]>(url),
      api.get<{ url: string }>(`${url}/${preview.data.artifactId}/download-url`),
    ]);
    // Only the preview becomes the design's current artifact; each upload moved the version.
    expect(design.data).toMatchObject({
      currentArtifactId: preview.data.artifactId,
      version: 2,
    });
    expect(list.data.map((a) => a.role)).toEqual(["CUSTOMER_PREVIEW", "PRINT_READY"]);
    expect(link.data.url).toBe("blob:mock/48");
  });

  it("walks a design from review to a confirmed snapshot and a new version", async () => {
    const { id } = await startDesign();
    const preview = await post<Stored>(
      `/designs/${id}/artifacts`,
      png(48, "preview.png"),
      { "Idempotency-Key": "walk-1" },
      { role: "CUSTOMER_PREVIEW" },
    );

    // P5: the customer asks QC to look; the mock QC (mock-only) answers after 2 s.
    const requested = await api.post<Draft>(`/designs/${id}/technical-review-requests`, {
      version: 1,
    });
    expect(requested.data).toMatchObject({ version: 2, technicalReviewPassed: false });
    expect(requested.data.reviewRequestedAt).toBeTruthy();
    expect(scheduled.at(-1)?.delayMs).toBe(2000);
    runScheduled();

    const reviewed = await api.get<Draft>(`/designs/${id}`);
    expect(reviewed.data).toMatchObject({
      version: 3,
      technicalReviewPassed: true,
      reviewNotes: QC_NOTES,
    });

    const submitted = await api.post<Draft>(`/designs/${id}/confirmation-requests`, { version: 3 });
    expect(submitted.data.status).toBe("SUBMITTED");
    const confirmed = await api.post<Snapshot>(`/designs/${id}/confirmations`, {
      version: 4,
      artifactId: preview.data.artifactId,
    });
    expect(confirmed.data).toMatchObject({ draftId: id, artifactId: preview.data.artifactId });
    expect(confirmed.data.artifacts.map((a) => a.role)).toEqual(["CUSTOMER_PREVIEW"]);

    const [snapshot, history] = await Promise.all([
      api.get<Snapshot>(`/designs/${id}/snapshot`),
      api.get<Page<{ decision: string }>>(`/designs/${id}/history`),
    ]);
    expect(snapshot.data.id).toBe(confirmed.data.id);
    expect(history.data.items.map((d) => d.decision)).toEqual([
      "CUSTOMER_CONFIRMED",
      "SENT_TO_CUSTOMER",
      "TECHNICAL_ACCEPTED",
      "TECHNICAL_REVIEW_REQUESTED",
    ]);

    const fork = await api.post<Draft>(`/designs/${id}/revisions`);
    expect(fork.data).toMatchObject({
      status: "DRAFT",
      version: 0,
      parentSnapshotId: confirmed.data.id,
    });
    const { data: record } = await api.get<{ designId: string }>(
      `/designs/${fork.data.id}/document`,
    );
    expect(record.designId).toBe(fork.data.id);
  }, 15_000);

  it("moves a pending confirmation back to DRAFT through change-requests and withdrawals", async () => {
    const { id } = await startDesign();
    await post(`/designs/${id}/artifacts`, png(16), { "Idempotency-Key": "chg-1" });
    await api.post(`/designs/${id}/technical-review-requests`, { version: 1 });
    runScheduled();
    await api.post(`/designs/${id}/confirmation-requests`, { version: 3 });

    const changed = await api.post<Draft>(`/designs/${id}/change-requests`, {
      version: 4,
      reason: "Đổi màu nền sang kem",
    });
    expect(changed.data).toMatchObject({
      status: "DRAFT",
      technicalReviewPassed: false,
      reviewNotes: "Đổi màu nền sang kem",
    });
    // A withdrawal needs a pending confirmation: this one was just taken back.
    await expect(
      api.post(`/designs/${id}/confirmation-withdrawals`, {
        version: changed.data.version,
        reason: "Rút lại",
      }),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
  }, 15_000);

  it("revises the specification, which cancels a review the mock QC has not answered yet", async () => {
    const { id } = await startDesign();
    await post(`/designs/${id}/artifacts`, png(16), { "Idempotency-Key": "stale-1" });
    await api.post(`/designs/${id}/technical-review-requests`, { version: 1 });
    expect(scheduled.at(-1)?.delayMs).toBe(2000);

    const revised = await api.put<Draft>(`/designs/${id}/specification`, {
      version: 2,
      spec: "Thêm logo ở mặt trước",
    });
    expect(revised.data.version).toBe(3);

    // The QC answer arrives for a design that has changed since the request: it must not pass it.
    runScheduled();
    const { data } = await api.get<Draft>(`/designs/${id}`);
    expect(data).toMatchObject({ version: 3, technicalReviewPassed: false });
    expect(data.reviewRequestedAt).toBeUndefined();
  }, 15_000);

  it("saves and reads the design document at the draft's version", async () => {
    const { id } = await startDesign();
    const { data: record } = await api.get<{
      version: number;
      document: { surfaces: Record<string, unknown> };
    }>(`/designs/${id}/document`);

    const saved = await api.put<{ version: number; checksum: string }>(`/designs/${id}/document`, {
      version: record.version,
      document: record.document,
    });
    expect(saved.data.version).toBe(1);
    await expect(
      api.put(`/designs/${id}/document`, { version: 0, document: record.document }),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(saved.data.checksum).toMatch(/^[0-9a-f]{64}$/);

    // A document that is not this design's is a validation error on `document`, like any other 400.
    await expect(
      api.put(`/designs/${id}/document`, {
        version: saved.data.version,
        document: { ...record.document, templateCode: "CUP12-LOGO" },
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_FAILED",
      fieldErrors: { document: expect.any(String) },
    });
  });

  // Last: it replaces the routes with ones that keep the default scheduler.
  it("waits on a plain 2 s timer when no scheduler is injected", async () => {
    registerDesignMockRoutes(studio());
    const realSetTimeout = globalThis.setTimeout;
    const timer = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((handler, timeout, ...args) =>
        // The mock QC's own timer is held back so the test runs it, not the clock.
        timeout === MOCK_QC_DELAY_MS
          ? (0 as unknown as ReturnType<typeof setTimeout>)
          : realSetTimeout(handler, timeout, ...args),
      );

    const { id } = await startDesign();
    await post(`/designs/${id}/artifacts`, png(16), { "Idempotency-Key": "plain-1" });
    await api.post(`/designs/${id}/technical-review-requests`, { version: 1 });
    const qc = timer.mock.calls.find(([, timeout]) => timeout === MOCK_QC_DELAY_MS);
    expect(MOCK_QC_DELAY_MS).toBe(2000);
    expect(qc).toBeDefined();
    timer.mockRestore();

    (qc?.[0] as () => void)();
    const { data } = await api.get<Draft>(`/designs/${id}`);
    expect(data).toMatchObject({ technicalReviewPassed: true, reviewNotes: QC_NOTES });
  }, 15_000);
});
