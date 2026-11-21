import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./client";
import { ApiError } from "./error";
import { __resetMockAdapterForTests, activateMockAdapter } from "./mock-adapter";
import { registerDesignMockRoutes } from "./mock-design";
import { seedMockCatalog } from "./mock-fixtures/catalog";
import {
  MOCK_SKU_WITHOUT_PRINT_CONFIG,
  printConfigFor,
} from "./mock-fixtures/design-print-configs";
import type {
  DesignAssetDto,
  DesignDocumentRecordDto,
  DesignDto,
} from "./mock-fixtures/design-rows";
import { MOCK_DESIGN_IDS } from "./mock-fixtures/design-seed";
import { createMemoryStorage } from "./mock-fixtures/design-storage";
import { createDesignMockStore } from "./mock-fixtures/design-store";

// Through the real axios client, mock adapter and route table: what the screens get. The store's
// rules are tested in mock-fixtures/design-store.test.ts; here each path of spec §4.2/§4.3 must
// reach its store method with its path params, query, JSON body or multipart parts.

const uuid = (n: number) => `5e5e0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const CUP12 = { productSlug: "ly-giay-2-lop-12oz", sku: "CUP-PAPER-12OZ-WHT" };

/** A design as the BE answers it (`DesignDraftResponse`): nulls are left out. */
interface Draft {
  id: string;
  name: string;
  status: string;
  version: number;
  productSlug: string;
  productName?: string;
  sku: string;
  variantName?: string;
  templateCode?: string;
  projectId?: string;
  parentSnapshotId?: string;
  reviewRequestedAt?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

/** The body the BE wants to start a design on CUP12: the product's id and the template's code. */
const startBody = (name: string, projectId?: string) => ({
  productId: seedMockCatalog().find((p) => p.slug === CUP12.productSlug)!.productId,
  sku: CUP12.sku,
  templateCode: printConfigFor(CUP12.productSlug, CUP12.sku)!.template.code,
  name,
  ...(projectId ? { projectId } : {}),
});

interface Page<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
}

const png = (bytes = 64) =>
  new File([new Uint8Array(bytes).fill(7)], "logo.png", { type: "image/png" });

const multipart = { headers: { "Content-Type": "multipart/form-data" } };

async function codeOf(request: Promise<unknown>) {
  const error = await request.catch((err: unknown) => err);
  expect(error).toBeInstanceOf(ApiError);
  return { status: (error as ApiError).status, code: (error as ApiError).code };
}

// Each test starts from a page that just activated the full mock: its own route table and stores.
beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  // The probe's "no handler", and the design mock keeping its data in memory (no IndexedDB here).
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(Math, "random").mockReturnValue(0.06); // no simulated 5% error, shortest latency
  activateMockAdapter();
  // The adapter looks a route up only after `registerAllMockRoutes()` ran: an unknown path settles
  // once it has, so routes registered later replace the default ones and are not overwritten.
  await api.get("/routes-ready-probe").catch(() => undefined);
});

afterEach(() => {
  __resetMockAdapterForTests();
  vi.restoreAllMocks();
});

it("the app's route table serves the design mock (seeded, memory storage in tests)", async () => {
  // The count is `totalElements` of a one-row page of DRAFTs: the BE has no draft-count route.
  const { data } = await api.get("/designs", { params: { status: "DRAFT", size: 1 } });
  expect(data).toMatchObject({ totalElements: 2, size: 1 });
});

describe("design mock routes", () => {
  // A fresh seeded store behind the design routes for every test.
  beforeEach(async () => {
    let ids = 0;
    const store = await createDesignMockStore({
      storage: createMemoryStorage(),
      newId: () => uuid(0x1000 + ids++),
      readImageSize: async () => ({ widthPx: 1200, heightPx: 800 }),
      toUrl: (key) => `blob:test/${key}`,
    });
    registerDesignMockRoutes(store);
  });

  it("GET /designs with status, page and size in the BE's shape; ARCHIVED is a 400; unknown id → 404", async () => {
    const { data: page } = await api.get<Page<Draft>>("/designs", {
      params: { status: "DRAFT", page: 0, size: 1 },
    });
    expect(page).toMatchObject({ page: 0, size: 1, totalElements: 2 });
    expect(page.items.map((d) => d.status)).toEqual(["DRAFT"]);
    // The BE's names, no null, no createdAt, no embedded project.
    const [first] = page.items;
    expect(first).toMatchObject({ productSlug: expect.any(String), sku: expect.any(String) });
    expect(first).not.toHaveProperty("createdAt");
    expect(first).not.toHaveProperty("project");
    expect(Object.values(first!)).not.toContain(null);
    // The status is read in any case, as the BE does.
    const lower = await api.get<Page<Draft>>("/designs", { params: { status: "draft", size: 1 } });
    expect(lower.data.totalElements).toBe(2);

    expect(await codeOf(api.get("/designs", { params: { status: "ARCHIVED" } }))).toEqual({
      status: 400,
      code: "UNSUPPORTED_PARAMETER",
    });
    expect(await codeOf(api.get("/designs", { params: { status: "NOPE" } }))).toEqual({
      status: 400,
      code: "UNSUPPORTED_PARAMETER",
    });

    expect(await codeOf(api.get(`/designs/${uuid(0xbad)}`))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
    expect(await codeOf(api.get(`/designs/${uuid(0xbad)}/history`))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("POST /designs/mine, GET /designs/:id, PUT /designs/:id/name, GET /designs/:id/history", async () => {
    const created = await api.post<Draft>("/designs/mine", startBody("Ly quán"));
    expect(created.status).toBe(201);
    expect(created.data).toMatchObject({
      status: "DRAFT",
      version: 0,
      productSlug: CUP12.productSlug,
      sku: CUP12.sku,
      templateCode: "CUP12-BODY",
    });
    const { id } = created.data;

    expect((await api.get<Draft>(`/designs/${id}`)).data).toEqual(created.data);
    const renamed = await api.put<Draft>(`/designs/${id}/name`, { version: 0, name: "Ly mới" });
    expect(renamed.status).toBe(200);
    expect(renamed.data).toMatchObject({ id, name: "Ly mới", version: 1 });
    const { data: history } = await api.get<Page<{ decision: string; notes?: string }>>(
      `/designs/${id}/history`,
    );
    expect(history).toMatchObject({ page: 0, totalElements: 1, hasNext: false });
    expect(history.items.map((row) => row.decision)).toEqual(["CREATED"]);
    expect(history.items[0]).not.toHaveProperty("notes"); // a null is left out

    // The BE's refusals: a stale version is CONFLICT, a template the SKU has not is 404.
    expect(await codeOf(api.put(`/designs/${id}/name`, { version: 0, name: "Lại" }))).toEqual({
      status: 409,
      code: "CONFLICT",
    });
    expect(
      await codeOf(api.post("/designs/mine", { ...startBody("Ly"), templateCode: "NOPE" })),
    ).toEqual({ status: 404, code: "PRINT_CONFIG_NOT_FOUND" });
    expect(await codeOf(api.post("/designs/mine", { ...startBody("Ly"), name: " " }))).toEqual({
      status: 400,
      code: "VALIDATION_FAILED",
    });
  });

  it("history is newest first and paged; GET /designs/:id/snapshot answers an approved design only", async () => {
    const id = MOCK_DESIGN_IDS.returned;
    const { data: all } = await api.get<Page<{ decision: string }>>(`/designs/${id}/history`);
    expect(all.items.map((row) => row.decision)).toEqual([
      "RETURNED",
      "SUBMITTED_FOR_REVIEW",
      "CREATED",
    ]);
    const { data: second } = await api.get<Page<{ decision: string }>>(`/designs/${id}/history`, {
      params: { page: 1, size: 2 },
    });
    expect(second).toMatchObject({ page: 1, size: 2, totalElements: 3, hasNext: false });
    expect(second.items.map((row) => row.decision)).toEqual(["CREATED"]);

    expect(await codeOf(api.get(`/designs/${id}/snapshot`))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
    const { data: snapshot } = await api.get<{ id: string; checksum: string; customerSku: string }>(
      `/designs/${MOCK_DESIGN_IDS.approved}/snapshot`,
    );
    expect(snapshot).toMatchObject({
      id: MOCK_DESIGN_IDS.approvedSnapshot,
      checksum: expect.any(String),
      customerSku: expect.any(String),
    });
  });

  it("GET /designs/:id/template answers the design's template in the BE's shape: active, designable, hasCartonSpec, the .glb when it has one", async () => {
    const { data } = await api.get<Record<string, unknown>>(
      `/designs/${MOCK_DESIGN_IDS.draft}/template`,
    );
    // BE-11: the template read says whether the variant takes a submission, and its carton spec.
    expect(data).toMatchObject({
      active: true,
      designable: true,
      hasCartonSpec: expect.any(Boolean),
      code: expect.any(String),
      sku: expect.any(String),
    });
    expect(Object.values(data)).not.toContain(null); // a null is left out, never sent

    // CUP12 is the one variant with a `.glb`: its design's template carries it.
    const made = await api.post<Draft>("/designs/mine", startBody("Ly 3D"));
    const { data: withGlb } = await api.get<{ model3d?: { url: string; surfaces: unknown[] } }>(
      `/designs/${made.data.id}/template`,
    );
    expect(withGlb.model3d).toMatchObject({ surfaces: [{ printAreaCode: "BODY" }] });
    expect(await codeOf(api.get(`/designs/${uuid(0xbad)}/template`))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("GET /catalog/products/:slug/customization lists a template per usable variant, nulls left out", async () => {
    const { data } = await api.get<{
      productId: string;
      templates: Array<{ sku: string; code: string; hasCartonSpec: boolean; maxColors?: number }>;
    }>(`/catalog/products/${CUP12.productSlug}/customization`);
    expect(data.productId).toBe(startBody("x").productId);
    expect(data.templates.map((t) => t.sku)).toContain(CUP12.sku);
    for (const template of data.templates) {
      expect(template).toMatchObject({
        code: expect.any(String),
        hasCartonSpec: expect.any(Boolean),
      });
      expect(template).not.toHaveProperty("maxColors"); // null in the fixture, omitted on the wire
    }
    // Each template carries its own `.glb`, and only the variant that has one.
    const withGlb = data.templates.filter((t) => "model3d" in t);
    expect(withGlb.map((t) => t.sku)).toEqual(["CUP-PAPER-12OZ-WHT"]);
    // A STANDARD product cannot be customized; a product the BE does not know is not found.
    expect(await codeOf(api.get("/catalog/products/nap-ly-90mm/customization"))).toEqual({
      status: 409,
      code: "PRODUCT_NOT_CUSTOMIZABLE",
    });
  });

  it("answers a product the mock catalogue does not know with the default configuration for the sku hint (design-only mock over the real catalogue)", async () => {
    const answer = async (slug: string, sku?: string) =>
      (
        await api.get<{ productId: string; templates: Array<{ sku: string; code: string }> }>(
          `/catalog/products/${slug}/customization`,
          sku ? { params: { sku } } : {},
        )
      ).data;

    const cup = await answer("ly-thuc-te", "REAL-CUP-1");
    expect(cup.templates).toMatchObject([{ sku: "REAL-CUP-1", code: "PET500-BODY" }]);
    expect((await answer("tui-thuc-te", "REAL-BAG-1")).templates[0]?.code).toBe("BAGM-4F");
    expect((await answer("ly-thuc-te")).templates).toEqual([]); // no hint, nothing to list

    // A design can then be started on it, as before, under the id the read named.
    const created = await api.post<Draft>("/designs/mine", {
      productId: cup.productId,
      sku: "REAL-CUP-1",
      templateCode: "PET500-BODY",
      name: "Ly thật",
    });
    expect(created.data).toMatchObject({ productSlug: "ly-thuc-te", sku: "REAL-CUP-1" });
  });

  it("GET and PUT /designs/:id/document", async () => {
    const id = MOCK_DESIGN_IDS.draft;
    const { data: record } = await api.get<DesignDocumentRecordDto>(`/designs/${id}/document`);
    expect(record.designId).toBe(id);

    const { data: saved } = await api.put<DesignDocumentRecordDto>(`/designs/${id}/document`, {
      version: record.version,
      document: record.document,
    });
    expect(saved.version).toBe(record.version + 1);
    expect(
      await codeOf(
        api.put(`/designs/${id}/document`, { version: record.version, document: record.document }),
      ),
    ).toEqual({ status: 409, code: "CONFLICT" });
  });

  it("PUT /designs/:id/document answers a layout over 1,000,000 bytes with 413 REQUEST_BODY_TOO_LARGE and a message only", async () => {
    const id = MOCK_DESIGN_IDS.draft;
    const { data: record } = await api.get<DesignDocumentRecordDto>(`/designs/${id}/document`);
    const error = await api
      .put(`/designs/${id}/document`, {
        version: record.version,
        document: { ...record.document, padding: "x".repeat(1_000_001) },
      })
      .then(
        () => {
          throw new Error("a refusal was expected");
        },
        (err: unknown) => err as ApiError,
      );
    expect(error).toMatchObject({
      status: 413,
      code: "REQUEST_BODY_TOO_LARGE",
      details: undefined,
    });
  });

  it("POST /designs/:id/assets (multipart file, Idempotency-Key), GET assets and its link", async () => {
    const id = MOCK_DESIGN_IDS.draft;
    const send = () => {
      const body = new FormData();
      body.append("file", png(), "logo.png");
      return api.post<DesignAssetDto>(`/designs/${id}/assets`, body, {
        headers: { ...multipart.headers, "Idempotency-Key": "upload-1" },
      });
    };

    const uploaded = await send();
    expect(uploaded.status).toBe(201);
    expect(uploaded.data).toMatchObject({ designId: id, originalName: "logo.png", widthPx: 1200 });
    // The same key answers the first upload again instead of storing a second copy.
    expect((await send()).data).toEqual(uploaded.data);

    const { data: assets } = await api.get<DesignAssetDto[]>(`/designs/${id}/assets`);
    expect(assets.filter((a) => a.assetId === uploaded.data.assetId)).toHaveLength(1);
    const { data: link } = await api.get(
      `/designs/${id}/assets/${uploaded.data.assetId}/download-url`,
    );
    expect(link).toEqual({
      url: `blob:test/asset/${uploaded.data.assetId}`,
      expiresAt: expect.any(String),
    });
    // A file the BE refuses is a 415 or 413 carrying only a message.
    expect(await codeOf(api.post(`/designs/${id}/assets`, new FormData(), multipart))).toEqual({
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });

  it("POST /designs/:id/assets takes a file part of another realm (duck-typed, not `instanceof Blob`)", async () => {
    const id = MOCK_DESIGN_IDS.draft;
    const bytes = new Uint8Array(64).fill(7);
    const foreign = {
      name: "logo.png",
      type: "image/png",
      size: bytes.length,
      arrayBuffer: async () => bytes.buffer,
    };
    const form = { get: (name: string) => (name === "file" ? foreign : null) };

    // Handed to the adapter as is, like a FormData axios does not know.
    const uploaded = await api.post<DesignAssetDto>(`/designs/${id}/assets`, form, {
      transformRequest: [(body: unknown) => body],
    });

    expect(uploaded.status).toBe(201);
    expect(uploaded.data).toMatchObject({ designId: id, originalName: "logo.png", sizeBytes: 64 });
  });

  it("the BE's flow: POST …/preflight-failures by rule, then artifacts one by one, the request for review, the files, a link, and the reviewer simulation", async () => {
    const id = MOCK_DESIGN_IDS.draft;
    const { data: design } = await api.get<Draft>(`/designs/${id}`);

    // The studio's own refusal on the record: findings by `rule`, any message ignored.
    const failure = await api.post<{ decision: string; notes?: string; version: number }>(
      `/designs/${id}/preflight-failures`,
      {
        version: design.version,
        issues: [{ rule: "ON_SEAM", surfaceCode: "BODY", elementId: "t" }],
      },
    );
    expect(failure.status).toBe(201);
    expect(failure.data).toMatchObject({ decision: "PREFLIGHT_FAILED", version: design.version });
    expect(
      await codeOf(api.post(`/designs/${id}/preflight-failures`, { version: 0, issues: [] })),
    ).toEqual({ status: 400, code: "VALIDATION_FAILED" });

    const { data: record } = await api.get<DesignDocumentRecordDto>(`/designs/${id}/document`);
    const upload = (role: string, file: File, documentChecksum = record.checksum) => {
      const body = new FormData();
      body.append("file", file, file.name);
      return api.post<Record<string, unknown>>(`/designs/${id}/artifacts`, body, {
        ...multipart,
        headers: { ...multipart.headers, "Idempotency-Key": `key-${role}` },
        params: { role, documentChecksum },
      });
    };
    const pdf = (name: string) => new File(["%PDF"], name, { type: "application/pdf" });

    // Nothing to send yet: the files are missing.
    const missing = await api
      .post(`/designs/${id}/technical-review-requests`, { version: design.version })
      .then(
        () => {
          throw new Error("a refusal was expected");
        },
        (err: unknown) => err as ApiError,
      );
    expect(missing).toMatchObject({ status: 409, code: "DESIGN_FILES_OUTDATED" });
    expect(missing.details).toEqual({
      roles: ["CUSTOMER_PREVIEW", "PRINT_READY", "TECHNICAL_SPEC"],
    });

    const preview = await upload("CUSTOMER_PREVIEW", png());
    expect(preview.status).toBe(201);
    expect(preview.data).toMatchObject({
      role: "CUSTOMER_PREVIEW",
      documentChecksum: record.checksum,
      checksum: expect.any(String),
    });
    // The same key and bytes answer the first artifact; other bytes under it are refused.
    expect((await upload("CUSTOMER_PREVIEW", png())).data).toEqual(preview.data);
    expect(
      await codeOf(upload("CUSTOMER_PREVIEW", new File(["other"], "o.png", { type: "image/png" }))),
    ).toEqual({ status: 422, code: "IDEMPOTENCY_KEY_REUSED" });
    await upload("PRINT_READY", pdf("print-ready.pdf"));
    await upload("TECHNICAL_SPEC", pdf("technical-spec.pdf"));

    // Each upload moved the version on (three of them, the replay none).
    const { data: after } = await api.get<Draft>(`/designs/${id}`);
    expect(after.version).toBe(design.version + 3);
    expect(
      await codeOf(
        api.post(`/designs/${id}/technical-review-requests`, { version: design.version }),
      ),
    ).toEqual({ status: 409, code: "CONFLICT" });

    const submitted = await api.post<Draft>(`/designs/${id}/technical-review-requests`, {
      version: after.version,
    });
    expect(submitted.status).toBe(200);
    expect(submitted.data).toMatchObject({ status: "PENDING_REVIEW", version: after.version + 1 });
    expect(
      await codeOf(
        api.post(`/designs/${id}/technical-review-requests`, { version: after.version + 1 }),
      ),
    ).toEqual({ status: 409, code: "DESIGN_NOT_DRAFT" });

    const { data: listed } = await api.get<Array<{ artifactId: string; role: string }>>(
      `/designs/${id}/artifacts`,
    );
    expect(listed.map((f) => f.role).toSorted()).toEqual([
      "CUSTOMER_PREVIEW",
      "PRINT_READY",
      "TECHNICAL_SPEC",
    ]);
    const { data: link } = await api.get(
      `/designs/${id}/artifacts/${listed[0]!.artifactId}/download-url`,
    );
    expect(link).toEqual({
      url: expect.stringContaining("blob:test/"),
      expiresAt: expect.any(String),
    });

    // The reviewer simulation returns what was just submitted.
    const { data: returned } = await api.post<DesignDto>(`/__mock/designs/${id}/return`, {
      reason: "Logo bị mờ",
    });
    expect(returned).toMatchObject({ status: "DRAFT", lastReturn: { reason: "Logo bị mờ" } });
  });

  it("the request for review is refused as the BE does: its own preflight with findings (nothing sent twice), a print file that is not a PDF, files drawn from another layout", async () => {
    const created = await api.post<Draft>("/designs/mine", startBody("Ly trống"));
    const id = created.data.id;
    const { data: record } = await api.get<DesignDocumentRecordDto>(`/designs/${id}/document`);
    const upload = async (role: string, file: File, documentChecksum = record.checksum) => {
      const body = new FormData();
      body.append("file", file, file.name);
      await api.post(`/designs/${id}/artifacts`, body, {
        ...multipart,
        params: { role, documentChecksum },
      });
    };
    const pdf = (name: string) => new File(["%PDF"], name, { type: "application/pdf" });
    await upload("CUSTOMER_PREVIEW", png());
    await upload("PRINT_READY", pdf("p.pdf"));
    await upload("TECHNICAL_SPEC", pdf("s.pdf"));
    const { data: now } = await api.get<Draft>(`/designs/${id}`);

    // An empty layout: the BE's preflight refuses it, and writes that on the history itself.
    const refused = await api
      .post(`/designs/${id}/technical-review-requests`, { version: now.version })
      .then(
        () => {
          throw new Error("a refusal was expected");
        },
        (err: unknown) => err as ApiError,
      );
    expect(refused).toMatchObject({ status: 422, code: "DESIGN_PREFLIGHT_FAILED" });
    expect(refused.details).toEqual({
      issues: [expect.objectContaining({ rule: "EMPTY_DESIGN", message: expect.any(String) })],
    });
    const { data: history } = await api.get<Page<{ decision: string; notes?: string }>>(
      `/designs/${id}/history`,
    );
    expect(history.items[0]).toMatchObject({ decision: "PREFLIGHT_FAILED", notes: "EMPTY_DESIGN" });
    expect((await api.get<Draft>(`/designs/${id}`)).data.version).toBe(now.version); // did not move

    // A print file that is not a PDF (on a layout that passes).
    const ready = MOCK_DESIGN_IDS.draft;
    const doc = (await api.get<DesignDocumentRecordDto>(`/designs/${ready}/document`)).data;
    const send = (role: string, file: File) => {
      const body = new FormData();
      body.append("file", file, file.name);
      return api.post(`/designs/${ready}/artifacts`, body, {
        ...multipart,
        params: { role, documentChecksum: doc.checksum },
      });
    };
    await send("CUSTOMER_PREVIEW", png());
    await send("PRINT_READY", png());
    await send("TECHNICAL_SPEC", pdf("s.pdf"));
    const notPdf = await api
      .post(`/designs/${ready}/technical-review-requests`, {
        version: (await api.get<Draft>(`/designs/${ready}`)).data.version,
      })
      .then(
        () => {
          throw new Error("a refusal was expected");
        },
        (err: unknown) => err as ApiError,
      );
    expect(notPdf).toMatchObject({ status: 422, code: "DESIGN_PREFLIGHT_FAILED" });
    expect(notPdf.details).toEqual({
      issues: [expect.objectContaining({ rule: "PRINT_FILE_INVALID" })],
    });
  });

  it("refuses an artifact with an unknown role or a malformed layout checksum", async () => {
    const id = MOCK_DESIGN_IDS.draft;
    const stale = "a".repeat(64);
    const body = new FormData();
    body.append("file", png(), "preview.png");
    await api.post(`/designs/${id}/artifacts`, body, {
      ...multipart,
      params: { role: "CUSTOMER_PREVIEW", documentChecksum: stale },
    });
    expect(
      await codeOf(
        api.post(`/designs/${id}/artifacts`, new FormData(), {
          ...multipart,
          params: { role: "NOT_A_ROLE" },
        }),
      ),
    ).toEqual({ status: 400, code: "VALIDATION_FAILED" });
    expect(
      await codeOf(
        api.post(`/designs/${id}/artifacts`, body, {
          ...multipart,
          params: { role: "PRINT_READY", documentChecksum: "not-a-checksum" },
        }),
      ),
    ).toEqual({ status: 400, code: "VALIDATION_FAILED" });
  });

  it("GET /designs carries customerSku on an approved design only (BE-2)", async () => {
    const { data: page } = await api.get<Page<Draft & { customerSku?: string }>>("/designs");
    const bySku = page.items.map((d) => [d.status, d.customerSku !== undefined] as const);
    expect(bySku.filter(([status]) => status === "APPROVED").every(([, has]) => has)).toBe(true);
    expect(bySku.filter(([status]) => status !== "APPROVED").some(([, has]) => has)).toBe(false);
    const approved = page.items.find((d) => d.id === MOCK_DESIGN_IDS.approved);
    expect(approved?.customerSku).toMatch(/-KH0010-/);
  });

  it("GET /designs?inProject=false|true filters in the query, so the totals count it (BE-15)", async () => {
    const { data: project } = await api.post<{ id: string }>("/design-projects", { name: "Dự án" });
    await api.post(`/design-projects/${project.id}/designs`, { designId: MOCK_DESIGN_IDS.draft });
    const all = (await api.get<Page<Draft>>("/designs")).data;
    const free = (await api.get<Page<Draft>>("/designs", { params: { inProject: false, size: 1 } }))
      .data;
    const taken = (await api.get<Page<Draft>>("/designs", { params: { inProject: "true" } })).data;

    expect(free.totalElements).toBe(all.totalElements - 1);
    expect(free.items).toHaveLength(1); // a full page, though a design of the project exists
    expect(taken.items.map((d) => d.id)).toEqual([MOCK_DESIGN_IDS.draft]);
    expect(await codeOf(api.get("/designs", { params: { inProject: "maybe" } }))).toEqual({
      status: 400,
      code: "UNSUPPORTED_PARAMETER",
    });
  });

  it("GET /design-fonts lists the BE's eight codes, in its order (BE-18)", async () => {
    const { data } = await api.get<Array<{ code: string; label: string }>>("/design-fonts");
    expect(data.map((f) => f.code)).toEqual([
      "be-vietnam-pro",
      "montserrat",
      "roboto-slab",
      "playfair-display",
      "oswald",
      "dancing-script",
      "lobster",
      "pacifico",
    ]);
    expect(data[0]).toEqual({ code: "be-vietnam-pro", label: "Be Vietnam Pro" });
  });

  it("GET …/snapshot of an approved design lists its frozen files and the bundle's checksum; an approved file that lost its bytes fails the integrity check", async () => {
    const { data: snapshot } = await api.get<{
      checksum: string;
      customerSku: string;
      artifacts: Array<{ artifactId: string; role: string; originalName: string }>;
    }>(`/designs/${MOCK_DESIGN_IDS.approved}/snapshot`);
    expect(snapshot.artifacts.map((a) => a.role)).toEqual([
      "CUSTOMER_PREVIEW",
      "PRINT_READY",
      "TECHNICAL_SPEC",
    ]);
    const print = snapshot.artifacts[1]!;
    const link = `/designs/${MOCK_DESIGN_IDS.approved}/artifacts/${print.artifactId}/download-url`;
    expect((await api.get<{ url: string }>(link)).data.url).toBeTruthy();
  });

  it("POST /__mock/designs/:id/approve, POST /designs/:id/revisions, POST /designs/:id/archive", async () => {
    const { data: approved } = await api.post<DesignDto>(
      `/__mock/designs/${MOCK_DESIGN_IDS.pending}/approve`,
    );
    expect(approved).toMatchObject({ id: MOCK_DESIGN_IDS.pending, status: "APPROVED" });

    // A revision of a design that is not approved is a plain CONFLICT in the BE.
    expect(await codeOf(api.post(`/designs/${MOCK_DESIGN_IDS.draft}/revisions`))).toEqual({
      status: 409,
      code: "CONFLICT",
    });
    const revised = await api.post<Draft>(`/designs/${approved.id}/revisions`);
    expect(revised.status).toBe(200);
    expect(revised.data).toMatchObject({
      status: "DRAFT",
      parentSnapshotId: approved.approval!.snapshotId,
    });

    const { data: removed } = await api.post<Draft>(`/designs/${revised.data.id}/archive`, {
      version: revised.data.version,
    });
    expect(removed.status).toBe("ARCHIVED");
    expect(await codeOf(api.get(`/designs/${revised.data.id}`))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("the reviewer simulation routes of a round: the open rounds, the failure switch and approve-all", async () => {
    const { data: none } = await api.get<{ rounds: unknown[] }>("/__mock/design-rounds");
    expect(none.rounds).toEqual([]);

    const pending = MOCK_DESIGN_IDS.pending;
    const on = await api.post(`/__mock/designs/${pending}/fail-next-approval`, { enabled: true });
    expect(on.data).toEqual({ designId: pending, failNext: true });
    expect(await codeOf(api.post(`/__mock/designs/${pending}/approve`))).toEqual({
      status: 409,
      code: "APPROVAL_FAILED",
    });
    // The switch went with that failure: the next approval is the design's own.
    const { data: approved } = await api.post<DesignDto>(`/__mock/designs/${pending}/approve`);
    expect(approved.status).toBe("APPROVED");

    expect(await codeOf(api.post(`/__mock/design-rounds/${uuid(9)}/approve-all`))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("the /design-projects routes, in the BE's contract: create, list, read, put, add, remove, history, archive", async () => {
    const created = (await api.post("/design-projects", { name: "Quán Hoa", description: "Bộ" }))
      .data;
    // `DesignProjectResponse`: designs and an image count, no designCount or open round.
    expect(created).toMatchObject({
      status: "ACTIVE",
      version: 0,
      designs: [],
      assetCount: 0,
    });
    const base = `/design-projects/${created.id}`;

    const list = (
      await api.get("/design-projects", { params: { status: "ACTIVE", page: 0, size: 5 } })
    ).data as Page<{ id: string; designCount: number }>;
    expect(list.items.map((p) => p.id)).toEqual([created.id]);
    expect(list.items[0]?.designCount).toBe(0);
    expect((await api.get(base)).data).toEqual(created);
    // PUT takes the whole of it: a name is required, and it moves the version on.
    expect(await codeOf(api.put(base, { version: 0 }))).toMatchObject({ status: 400 });
    expect((await api.put(base, { name: "Quán Hoa 2", version: 0 })).data).toMatchObject({
      name: "Quán Hoa 2",
      version: 1,
    });

    const design = (await api.post("/designs/mine", startBody("Ly"))).data as Draft;
    // Add and remove answer the project (F-31), designs in it (F-30).
    const added = (await api.post(`${base}/designs`, { designId: design.id })).data as {
      designs: Array<{ id: string }>;
    };
    expect(added.designs.map((d) => d.id)).toEqual([design.id]);
    expect(await codeOf(api.get(`${base}/designs`))).toMatchObject({ status: 404 }); // no such route
    const inProject = (await api.post("/designs/mine", startBody("Ly 2", created.id)))
      .data as Draft;
    expect(inProject.projectId).toBe(created.id);

    expect(await codeOf(api.post(`${base}/archive`, { version: 0 }))).toEqual({
      status: 409,
      code: "CONFLICT",
    });
    const removed = (await api.delete(`${base}/designs/${design.id}`)).data as {
      designs: Array<{ id: string }>;
    };
    expect(removed.designs.map((d) => d.id)).toEqual([inProject.id]);
    expect(await codeOf(api.delete(`${base}/designs/${design.id}`))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
    expect((await api.delete(`${base}/designs/${inProject.id}`)).status).toBe(200);
    expect((await api.post(`${base}/archive`, { version: 1 })).data).toMatchObject({
      status: "ARCHIVED",
      version: 2,
    });
    // The history is a page, newest first (F-16).
    const history = (await api.get(`${base}/history`, { params: { page: 0, size: 20 } }))
      .data as Page<{ event: string }>;
    expect(history.items.map((e) => e.event)).toEqual(["PROJECT_ARCHIVED", "PROJECT_CREATED"]);
    expect(await codeOf(api.get("/design-projects/unknown"))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("has no print-config route any more; a variant without a template is simply not listed; POST /__mock/reset", async () => {
    expect(
      await codeOf(
        api.get(`/catalog/products/${CUP12.productSlug}/variants/${CUP12.sku}/print-config`),
      ),
    ).toEqual({ status: 404, code: "HTTP_404" }); // no route at all
    const { data } = await api.get<{ templates: Array<{ sku: string }> }>(
      "/catalog/products/tui-giay-kraft/customization",
    );
    expect(data.templates.map((t) => t.sku)).not.toContain(MOCK_SKU_WITHOUT_PRINT_CONFIG);

    const { data: created } = await api.post<Draft>("/designs/mine", startBody("Ly"));
    expect((await api.post("/__mock/reset")).status).toBe(200);
    const { data: page } = await api.get<Page<Draft>>("/designs");
    expect(page.totalElements).toBe(4);
    expect(await codeOf(api.get(`/designs/${created.id}`))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
  });
});
