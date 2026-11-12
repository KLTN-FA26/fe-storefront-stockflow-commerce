import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { MOCK_SKU_WITHOUT_PRINT_CONFIG } from "@/lib/api/mock-fixtures/design-print-configs";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";

import {
  createDesign,
  createRevision,
  deleteDesign,
  getAssetDownloadUrl,
  getDesign,
  getDesignDocument,
  getDesignHistory,
  getDraftCount,
  getPrintConfig,
  listDesignAssets,
  listDesignFiles,
  listDesigns,
  recordPreflightFailure,
  renameDesign,
  saveDesignDocument,
  submitDesign,
  uploadDesignAsset,
} from "../api";
import { plainBytes } from "../api-submission";
import { pngBytes, textEl } from "../engine/__tests__/fixtures";
import { sha256Hex } from "../engine/export/checksum";
import { preflightIssuesOf } from "../errors";
import type { SubmissionFiles } from "../types";
import { designBackend, type DesignBackend } from "./design-backend";
import { designDto } from "./fixtures";

// Through the real client, the mock adapter and the design route table, over a seeded store in
// memory (spec 2026-11-09 §5): what the screens get while the design module runs on the mock.

const { draft, returned, pending, approved, archived, approvedSnapshot } = MOCK_DESIGN_IDS;
const BAG = { productSlug: "tui-giay-kraft", sku: "BAG-KRAFT-M" };

let backend: DesignBackend;
beforeEach(async () => {
  backend = await designBackend();
});
afterEach(() => vi.restoreAllMocks());

async function errorOf(request: Promise<unknown>) {
  const error = await request.catch((err: unknown) => err);
  return { status: (error as { status?: number }).status, code: (error as { code?: string }).code };
}

describe("reads", () => {
  it("lists designs a page at a time: 1-based here, 0-based on the wire, ARCHIVED never listed", async () => {
    const controller = new AbortController();
    const all = await listDesigns({ page: 1, size: 20 }, controller.signal);
    expect(all).toMatchObject({ page: 1, size: 20, totalElements: 4, hasPrevious: false });
    expect(all.items.map((d) => d.id)).not.toContain(archived);
    expect(backend.get).toHaveBeenLastCalledWith("/designs", {
      params: { page: 0, size: 20 },
      signal: controller.signal,
    });

    const second = await listDesigns({ page: 2, size: 1, status: "DRAFT" });
    expect(second).toMatchObject({ page: 2, totalElements: 2, hasNext: false, hasPrevious: true });
    expect(second.items.map((d) => d.status)).toEqual(["DRAFT"]);
    expect(backend.get).toHaveBeenLastCalledWith("/designs", {
      params: { page: 1, size: 1, status: "DRAFT" },
    });

    // Never a negative page.
    await listDesigns({ page: 0, size: 1 });
    expect(backend.get).toHaveBeenLastCalledWith("/designs", { params: { page: 0, size: 1 } });
  });

  it("reads the draft count, one design, its history, and answers an archived one 404", async () => {
    expect(await getDraftCount()).toEqual({ drafts: 2, limit: 50 });

    const design = await getDesign(returned);
    expect(design).toMatchObject({ id: returned, status: "DRAFT", projectId: null });
    expect(design.lastReturn?.reason).toContain("Chữ quá sát mép trên");

    const history = await getDesignHistory(returned);
    expect(history.map((e) => e.type)).toEqual(["CREATED", "SUBMITTED_FOR_REVIEW", "RETURNED"]);
    expect(history.at(-1)?.note).toBe(design.lastReturn?.reason);

    expect(await errorOf(getDesign(archived))).toEqual({ status: 404, code: "NOT_FOUND" });
  });

  it("percent-encodes the id", async () => {
    await getDesign("a/b c").catch(() => undefined);
    expect(backend.get).toHaveBeenCalledWith("/designs/a%2Fb%20c", {});
  });

  it("rejects with a ZodError when an answer breaks the contract", async () => {
    backend.get.mockResolvedValueOnce({ data: designDto({ status: "SUBMITTED" }) });
    await expect(getDesign(draft)).rejects.toBeInstanceOf(z.ZodError);
  });

  it("reads a variant's print configuration, and 404 for one without", async () => {
    const config = await getPrintConfig(BAG.productSlug, BAG.sku);
    expect(config).toMatchObject({ sku: BAG.sku, variantStatus: "ACTIVE", hasCartonSpec: true });
    expect(config.template.model.kind).toBe("parametric-bag");
    expect(config.fileRules.formats).toEqual(["image/png", "image/jpeg"]);
    expect(backend.get).toHaveBeenCalledWith(
      "/catalog/products/tui-giay-kraft/variants/BAG-KRAFT-M/print-config",
      {},
    );

    expect(await errorOf(getPrintConfig(BAG.productSlug, MOCK_SKU_WITHOUT_PRINT_CONFIG))).toEqual({
      status: 404,
      code: "NOT_FOUND",
    });
  });
});

describe("create, rename, revise", () => {
  it("creates a DRAFT from a variant with the trimmed input", async () => {
    const created = await createDesign({ ...BAG, name: "  Túi quán  " });
    expect(created).toMatchObject({ status: "DRAFT", version: 0, name: "Túi quán" });
    expect(backend.post).toHaveBeenCalledWith("/designs", { ...BAG, name: "Túi quán" });
    expect(await getDraftCount()).toMatchObject({ drafts: 3 });
  });

  it("refuses a name the server would refuse without calling it", async () => {
    await expect(createDesign({ ...BAG, name: "x".repeat(201) })).rejects.toBeInstanceOf(
      z.ZodError,
    );
    await expect(renameDesign(draft, { name: " ", version: 2 })).rejects.toBeInstanceOf(z.ZodError);
    expect(backend.post).not.toHaveBeenCalled();
    expect(backend.patch).not.toHaveBeenCalled();
  });

  it("answers a variant without a print configuration with PRINT_CONFIG_MISSING", async () => {
    const request = createDesign({ ...BAG, sku: MOCK_SKU_WITHOUT_PRINT_CONFIG, name: "Túi" });
    expect(await errorOf(request)).toEqual({ status: 422, code: "PRINT_CONFIG_MISSING" });
  });

  it("renames with the version the customer sees; the rename bumps it; a stale one is refused", async () => {
    const renamed = await renameDesign(draft, { name: " Túi mới ", version: 2 });
    expect(renamed).toMatchObject({ id: draft, name: "Túi mới", version: 3 });
    expect(backend.patch).toHaveBeenCalledWith(`/designs/${draft}`, {
      name: "Túi mới",
      version: 2,
    });

    expect(await errorOf(renameDesign(draft, { name: "Túi", version: 2 }))).toEqual({
      status: 409,
      code: "VERSION_CONFLICT",
    });
  });

  it("creates a revision of an APPROVED design from its snapshot", async () => {
    const revision = await createRevision(approved);
    expect(revision).toMatchObject({
      status: "DRAFT",
      sourceSnapshotId: approvedSnapshot,
      product: { slug: "ly-giay-2-lop-12oz" },
    });
    expect(backend.post).toHaveBeenCalledWith(`/designs/${approved}/revisions`);
    expect(await errorOf(createRevision(draft))).toEqual({ status: 409, code: "INVALID_STATE" });
  });
});

describe("document and images", () => {
  it("reads the document and saves it with the version it was read at", async () => {
    const record = await getDesignDocument(draft);
    expect(record).toMatchObject({ designId: draft, version: 2 });

    const saved = await saveDesignDocument(draft, { version: 2, document: record.document });
    expect(saved.version).toBe(3);
    expect(backend.put).toHaveBeenCalledWith(`/designs/${draft}/document`, {
      version: 2,
      document: record.document,
    });
    const stale = saveDesignDocument(draft, { version: 2, document: record.document });
    expect(await errorOf(stale)).toEqual({ status: 409, code: "VERSION_CONFLICT" });
  });

  it("refuses a document over the size limit without sending it", async () => {
    const { document } = await getDesignDocument(draft);
    document.surfaces.FRONT?.elements.push(textEl("big", { name: "x".repeat(1_000_001) }));
    expect(await errorOf(saveDesignDocument(draft, { version: 2, document }))).toEqual({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(backend.put).not.toHaveBeenCalled();
  });

  it("uploads an image as multipart with its idempotency key, lists it and links it", async () => {
    const file = new Blob([pngBytes(1200, 800)], { type: "image/png" });
    const asset = await uploadDesignAsset(draft, file, "logo.png", "key-1");
    expect(asset).toMatchObject({ designId: draft, originalName: "logo.png", widthPx: 1200 });

    const [url, body, config] = backend.post.mock.calls[0]!;
    expect(url).toBe(`/designs/${draft}/assets`);
    expect((body as FormData).get("file")).toMatchObject({ name: "logo.png", type: "image/png" });
    expect(config).toMatchObject({
      headers: { "Content-Type": "multipart/form-data", "Idempotency-Key": "key-1" },
      timeout: 120_000,
    });

    expect((await listDesignAssets(draft)).map((a) => a.assetId)).toContain(asset.assetId);
    expect(await getAssetDownloadUrl(draft, asset.assetId)).toMatchObject({
      url: `blob:mock/asset/${asset.assetId}`,
    });
  });

  it("lets FILE_REJECTED through for a format the variant does not take", async () => {
    const gif = new Blob(["GIF89a"], { type: "image/gif" });
    expect(await errorOf(uploadDesignAsset(draft, gif, "a.gif", "key-2"))).toEqual({
      status: 422,
      code: "FILE_REJECTED",
    });
  });
});

describe("submitting", () => {
  const bundle = (): SubmissionFiles => ({
    CUSTOMER_PREVIEW: { name: "preview.png", type: "image/png", bytes: pngBytes(1600, 900) },
    PRINT_READY: {
      name: "print-ready.pdf",
      type: "application/pdf",
      bytes: new TextEncoder().encode("%PDF print"),
    },
    TECHNICAL_SPEC: {
      name: "technical-spec.pdf",
      type: "application/pdf",
      bytes: new TextEncoder().encode("%PDF spec"),
    },
  });

  it("sends multipart: version, preflight, the checksums and one part per role", async () => {
    const files = bundle();
    const submitted = await submitDesign(draft, {
      version: 2,
      preflight: { result: "Pass", issues: [] },
      files,
    });
    expect(submitted).toMatchObject({ id: draft, status: "PENDING_REVIEW", version: 3 });

    const [url, body, config] = backend.post.mock.calls[0]!;
    expect(url).toBe(`/designs/${draft}/submissions`);
    expect(config).toMatchObject({
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120_000,
    });
    const form = body as FormData;
    expect(form.get("version")).toBe("2");
    expect(JSON.parse(String(form.get("preflight")))).toEqual({ result: "Pass", issues: [] });
    const sha = {
      CUSTOMER_PREVIEW: await sha256Hex(files.CUSTOMER_PREVIEW.bytes.slice()),
      PRINT_READY: await sha256Hex(files.PRINT_READY.bytes.slice()),
      TECHNICAL_SPEC: await sha256Hex(files.TECHNICAL_SPEC.bytes.slice()),
    };
    expect(JSON.parse(String(form.get("checksums")))).toEqual(sha);
    for (const role of ["CUSTOMER_PREVIEW", "PRINT_READY", "TECHNICAL_SPEC"] as const) {
      expect(form.get(role)).toMatchObject({ name: files[role].name, type: files[role].type });
    }

    // What the server stored is what was sent.
    const stored = await listDesignFiles(draft);
    expect(stored.map((f) => [f.role, f.name, f.sha256])).toEqual([
      ["CUSTOMER_PREVIEW", "preview.png", sha.CUSTOMER_PREVIEW],
      ["PRINT_READY", "print-ready.pdf", sha.PRINT_READY],
      ["TECHNICAL_SPEC", "technical-spec.pdf", sha.TECHNICAL_SPEC],
    ]);
  });

  it("hashes and sends a file's own bytes, copying only a view over shared memory", () => {
    const bytes = new TextEncoder().encode("%PDF print");
    const own = new Uint8Array(new ArrayBuffer(bytes.length));
    own.set(bytes);
    expect(plainBytes(own)).toBe(own);

    const shared = new Uint8Array(new SharedArrayBuffer(bytes.length));
    shared.set(bytes);
    const copy = plainBytes(shared);
    expect(copy).not.toBe(shared);
    expect(copy.buffer).toBeInstanceOf(ArrayBuffer);
    expect([...copy]).toEqual([...bytes]);
  });

  it("submits each file from its own bytes: the array hashed is the array the part is built from", async () => {
    const files = bundle();
    const bytes = new TextEncoder().encode("%PDF print");
    const print = new Uint8Array(new ArrayBuffer(bytes.length));
    print.set(bytes);
    files.PRINT_READY.bytes = print;
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    const wrapped: unknown[] = [];
    const RealBlob = globalThis.Blob;
    vi.stubGlobal(
      "Blob",
      class extends RealBlob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          wrapped.push(...(parts ?? []));
        }
      },
    );
    try {
      await submitDesign(draft, { version: 2, preflight: { result: "Pass", issues: [] }, files });
    } finally {
      vi.unstubAllGlobals();
    }

    // A copy of a 50 MB print file (`slice()`) would be another array in both places.
    expect(digest.mock.calls.some(([, data]) => data === print)).toBe(true);
    expect(wrapped).toContain(print);
  });

  it("lets a server-side preflight Fail through with its issues", async () => {
    const issues = [
      { ruleId: "EMPTY_DESIGN" as const, level: "fail" as const, message: "Thiết kế trống." },
    ];
    const error = await submitDesign(draft, {
      version: 2,
      preflight: { result: "Fail", issues },
      files: bundle(),
    }).catch((err: unknown) => err);
    expect(error).toMatchObject({ status: 422, code: "PREFLIGHT_FAILED" });
    expect(preflightIssuesOf(error)).toEqual(issues);
  });

  it("records a preflight the browser refused, at the version it checked", async () => {
    const issues = [
      {
        ruleId: "DPI_BELOW_MIN" as const,
        level: "fail" as const,
        message: "Ảnh dưới 300 DPI.",
        surfaceCode: "BODY" as const,
        elementId: "el-sang-1",
      },
    ];
    const event = await recordPreflightFailure(returned, { version: 5, issues });
    expect(event).toMatchObject({
      type: "PREFLIGHT_FAILED",
      version: 5,
      note: "Ảnh dưới 300 DPI.",
    });
    expect(backend.post).toHaveBeenCalledWith(`/designs/${returned}/preflight-failures`, {
      version: 5,
      issues,
    });
    expect(await errorOf(recordPreflightFailure(pending, { version: 0, issues }))).toEqual({
      status: 409,
      code: "INVALID_STATE",
    });
  });

  it("lists no files before a design was ever submitted", async () => {
    expect(await listDesignFiles(draft)).toEqual([]);
  });
});

describe("deleting", () => {
  it("sends { version } in the body; the draft is ARCHIVED and answers 404 from then on", async () => {
    expect(await errorOf(deleteDesign(draft, { version: 1 }))).toEqual({
      status: 409,
      code: "VERSION_CONFLICT",
    });
    const removed = await deleteDesign(draft, { version: 2 });
    expect(removed).toMatchObject({ id: draft, status: "ARCHIVED" });
    expect(backend.delete).toHaveBeenLastCalledWith(`/designs/${draft}`, {
      data: { version: 2 },
    });
    expect(await errorOf(getDesign(draft))).toEqual({ status: 404, code: "NOT_FOUND" });
  });

  it("refuses to delete a design that is not a DRAFT", async () => {
    expect(await errorOf(deleteDesign(approved, { version: 0 }))).toEqual({
      status: 409,
      code: "INVALID_STATE",
    });
  });
});
