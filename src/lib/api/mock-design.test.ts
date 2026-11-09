import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { sha256Hex } from "@/features/product-design/engine/export/checksum";

import { api } from "./client";
import { ApiError } from "./error";
import { activateMockAdapter } from "./mock-adapter";
import { registerDesignMockRoutes } from "./mock-design";
import { MOCK_SKU_WITHOUT_PRINT_CONFIG } from "./mock-fixtures/design-print-configs";
import type {
  DesignAssetDto,
  DesignDocumentRecordDto,
  DesignDto,
  DesignEventDto,
  DesignFileDto,
} from "./mock-fixtures/design-rows";
import { MOCK_DESIGN_IDS } from "./mock-fixtures/design-seed";
import { createMemoryStorage } from "./mock-fixtures/design-storage";
import { createDesignMockStore } from "./mock-fixtures/design-store";

// Through the real axios client, mock adapter and route table: what the screens get. The store's
// rules are tested in mock-fixtures/design-store.test.ts; here each path of spec §4.2/§4.3 must
// reach its store method with its path params, query, JSON body or multipart parts.

const uuid = (n: number) => `5e5e0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const CUP12 = { productSlug: "ly-giay-2-lop-12oz", sku: "CUP-PAPER-12OZ-WHT" };
const originalAdapter = api.defaults.adapter;

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

let ids = 0;

beforeAll(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(Math, "random").mockReturnValue(0.06); // no simulated 5% error, shortest latency
  activateMockAdapter();
  // The adapter looks a route up only after `registerAllMockRoutes()` ran: an unknown path settles
  // once it has, so routes registered later replace the default ones and are not overwritten.
  vi.spyOn(console, "warn").mockImplementationOnce(() => {});
  await api.get("/routes-ready-probe").catch(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
  if (originalAdapter) api.defaults.adapter = originalAdapter;
});

it("the app's route table serves the design mock (seeded, memory storage in tests)", async () => {
  const { data } = await api.get("/designs/draft-count");
  expect(data).toEqual({ drafts: 2, limit: 50 });
});

describe("design mock routes", () => {
  beforeAll(async () => {
    const store = await createDesignMockStore({
      storage: createMemoryStorage(),
      newId: () => uuid(0x1000 + ids++),
      readImageSize: async () => ({ widthPx: 1200, heightPx: 800 }),
      toUrl: (key) => `blob:test/${key}`,
    });
    registerDesignMockRoutes(store);
  });

  it("GET /designs with status, page and size; GET /designs/draft-count; unknown id → 404", async () => {
    const { data: page } = await api.get<Page<DesignDto>>("/designs", {
      params: { status: "DRAFT", page: 0, size: 1 },
    });
    expect(page).toMatchObject({ page: 0, size: 1, totalElements: 2 });
    expect(page.items.map((d) => d.status)).toEqual(["DRAFT"]);

    const { data: count } = await api.get("/designs/draft-count");
    expect(count).toEqual({ drafts: 2, limit: 50 });

    expect(await codeOf(api.get(`/designs/${uuid(0xbad)}`))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
    expect(await codeOf(api.get(`/designs/${uuid(0xbad)}/history`))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("POST /designs, GET and PATCH /designs/:id, GET /designs/:id/history", async () => {
    const created = await api.post<DesignDto>("/designs", { ...CUP12, name: "Ly quán" });
    expect(created.status).toBe(201);
    const { id } = created.data;

    expect((await api.get<DesignDto>(`/designs/${id}`)).data).toEqual(created.data);
    const { data: renamed } = await api.patch<DesignDto>(`/designs/${id}`, {
      name: "Ly mới",
      version: 0,
    });
    expect(renamed).toMatchObject({ id, name: "Ly mới", version: 1 });
    const { data: history } = await api.get<DesignEventDto[]>(`/designs/${id}/history`);
    expect(history.map((event) => event.type)).toEqual(["CREATED"]);
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
    ).toEqual({ status: 409, code: "VERSION_CONFLICT" });
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
    const { data: link } = await api.get(`/designs/${id}/assets/${uploaded.data.assetId}/url`);
    expect(link).toEqual({
      url: `blob:test/asset/${uploaded.data.assetId}`,
      expiresAt: expect.any(String),
    });
    expect(await codeOf(api.post(`/designs/${id}/assets`, new FormData(), multipart))).toEqual({
      status: 422,
      code: "FILE_REJECTED",
    });
  });

  it("POST /designs/:id/preflight-failures, then POST /designs/:id/submissions (multipart parts) and GET files", async () => {
    const id = MOCK_DESIGN_IDS.draft;
    const { data: design } = await api.get<DesignDto>(`/designs/${id}`);
    const issues = [
      { ruleId: "EMPTY_DESIGN", level: "fail", message: "Thiết kế chưa có nội dung." },
    ];

    const { data: event } = await api.post<DesignEventDto>(`/designs/${id}/preflight-failures`, {
      version: design.version,
      issues,
    });
    expect(event).toMatchObject({ type: "PREFLIGHT_FAILED", version: design.version });

    const files = {
      PRINT_READY: new File(["print"], "print-ready.pdf", { type: "application/pdf" }),
      CUSTOMER_PREVIEW: new File(["preview"], "preview.png", { type: "image/png" }),
      TECHNICAL_SPEC: new File(["spec"], "technical-spec.pdf", { type: "application/pdf" }),
    };
    const checksums = Object.fromEntries(
      await Promise.all(
        Object.entries(files).map(async ([role, file]) => [
          role,
          await sha256Hex(new Uint8Array(await file.arrayBuffer())),
        ]),
      ),
    );
    const body = new FormData();
    body.append("version", String(design.version));
    body.append("preflight", JSON.stringify({ result: "Pass", issues: [] }));
    body.append("checksums", JSON.stringify(checksums));
    for (const [role, file] of Object.entries(files)) body.append(role, file, file.name);

    const { data: submitted } = await api.post<DesignDto>(
      `/designs/${id}/submissions`,
      body,
      multipart,
    );
    expect(submitted).toMatchObject({ status: "PENDING_REVIEW", version: design.version + 1 });

    const { data: bundle } = await api.get<DesignFileDto[]>(`/designs/${id}/files`);
    expect(bundle.map((file) => [file.role, file.name, file.sha256])).toEqual([
      ["CUSTOMER_PREVIEW", "preview.png", checksums.CUSTOMER_PREVIEW],
      ["PRINT_READY", "print-ready.pdf", checksums.PRINT_READY],
      ["TECHNICAL_SPEC", "technical-spec.pdf", checksums.TECHNICAL_SPEC],
    ]);
    expect(
      await codeOf(api.post(`/designs/${id}/preflight-failures`, { version: 0, issues })),
    ).toEqual({ status: 409, code: "INVALID_STATE" });

    // The reviewer simulation returns what was just submitted.
    const { data: returned } = await api.post<DesignDto>(`/__mock/designs/${id}/return`, {
      reason: "Logo bị mờ",
    });
    expect(returned).toMatchObject({ status: "DRAFT", lastReturn: { reason: "Logo bị mờ" } });
  });

  it("POST /__mock/designs/:id/approve, POST /designs/:id/revisions, DELETE /designs/:id", async () => {
    const { data: approved } = await api.post<DesignDto>(
      `/__mock/designs/${MOCK_DESIGN_IDS.pending}/approve`,
    );
    expect(approved).toMatchObject({ id: MOCK_DESIGN_IDS.pending, status: "APPROVED" });

    const revised = await api.post<DesignDto>(`/designs/${approved.id}/revisions`);
    expect(revised.status).toBe(201);
    expect(revised.data).toMatchObject({
      status: "DRAFT",
      sourceSnapshotId: approved.approval!.snapshotId,
    });

    const { data: removed } = await api.delete<DesignDto>(`/designs/${revised.data.id}`, {
      data: { version: revised.data.version },
    });
    expect(removed.status).toBe("ARCHIVED");
    expect(await codeOf(api.get(`/designs/${revised.data.id}`))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("GET /catalog/products/:slug/variants/:sku/print-config, 404 without one; POST /__mock/reset", async () => {
    const { data: config } = await api.get(
      `/catalog/products/${CUP12.productSlug}/variants/${CUP12.sku}/print-config`,
    );
    expect(config).toMatchObject({ sku: CUP12.sku, variantStatus: "ACTIVE", hasCartonSpec: true });
    expect(
      await codeOf(
        api.get(
          `/catalog/products/tui-giay-kraft/variants/${MOCK_SKU_WITHOUT_PRINT_CONFIG}/print-config`,
        ),
      ),
    ).toEqual({ status: 404, code: "NOT_FOUND" });

    const { data: created } = await api.post<DesignDto>("/designs", { ...CUP12, name: "Ly" });
    expect((await api.post("/__mock/reset")).status).toBe(200);
    const { data: page } = await api.get<Page<DesignDto>>("/designs");
    expect(page.totalElements).toBe(4);
    expect(await codeOf(api.get(`/designs/${created.id}`))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
  });
});
