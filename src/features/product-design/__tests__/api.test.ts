import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { seedMockCatalog } from "@/lib/api/mock-fixtures/catalog";
import {
  MOCK_SKU_WITHOUT_PRINT_CONFIG,
  printConfigFor,
} from "@/lib/api/mock-fixtures/design-print-configs";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";

import {
  createDesign,
  createRevision,
  deleteDesign,
  getAssetDownloadUrl,
  getDesign,
  getDesignDocument,
  getDesignHistory,
  getArtifactDownloadUrl,
  getDesignPrintConfig,
  getDraftCount,
  getPrintConfig,
  listDesignAssets,
  listDesignFiles,
  listDesigns,
  readDesignVersion,
  recordPreflightFailure,
  requestReview,
  renameDesign,
  saveDesignDocument,
  submitDesign,
  uploadDesignAsset,
  uploadDesignFiles,
} from "../api";
import { plainBytes } from "../api-submission";
import { pngBytes, textEl } from "../engine/__tests__/fixtures";
import { sha256Hex } from "../engine/export/checksum";
import { describeFileDownloadError, outdatedRolesOf, preflightIssuesOf } from "../errors";
import type { SubmissionFiles } from "../types";
import { designBackend, type DesignBackend } from "./design-backend";
import { designDraftDto } from "./fixtures";

// Through the real client, the mock adapter and the design route table, over a seeded store in
// memory (spec 2026-11-09 §5): what the screens get while the design module runs on the mock.

const { draft, returned, pending, approved, archived, approvedSnapshot } = MOCK_DESIGN_IDS;
const BAG = { productSlug: "tui-giay-kraft", sku: "BAG-KRAFT-M" };
// What the BE wants beside the SKU: the product's id and the template's code, read from the
// product's customization (F-12).
const BAG_PRODUCT_ID = seedMockCatalog().find((p) => p.slug === BAG.productSlug)!.productId;
const BAG_TEMPLATE = printConfigFor(BAG.productSlug, BAG.sku)!.template.code;

const RUN = "run-1"; // a submission run's nonce (`newRunNonce`)

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
    backend.get.mockResolvedValueOnce({ data: designDraftDto({ status: "SUBMITTED" }) });
    await expect(getDesign(draft)).rejects.toBeInstanceOf(z.ZodError);
  });

  it("reads a variant's print configuration from the product's customization, and 404 for one without", async () => {
    const config = await getPrintConfig(BAG.productSlug, BAG.sku);
    expect(config).toMatchObject({ sku: BAG.sku, variantStatus: "ACTIVE", hasCartonSpec: true });
    expect(config.template.model.kind).toBe("parametric-bag");
    expect(config.fileRules.formats).toEqual(["image/png", "image/jpeg"]);
    expect(backend.get).toHaveBeenCalledWith("/catalog/products/tui-giay-kraft/customization", {
      params: { sku: BAG.sku },
    });
    // The title comes from the catalogue's detail (F-7).
    expect(config.product.title).toBe("Túi giấy kraft quai xoắn");

    // A variant the BE does not list has no template: the old 404, in the BE's words.
    expect(await errorOf(getPrintConfig(BAG.productSlug, MOCK_SKU_WITHOUT_PRINT_CONFIG))).toEqual({
      status: 404,
      code: "PRINT_CONFIG_NOT_FOUND",
    });
  });

  it("reads a design's print configuration from its template, with the .glb of the template that has one", async () => {
    const design = await getDesign(draft);
    const config = await getDesignPrintConfig(design);
    expect(config).toMatchObject({ sku: design.variant.sku, variantStatus: "ACTIVE" });
    expect(backend.get).toHaveBeenCalledWith(`/designs/${draft}/template`, {});

    const cup = await getDesign(MOCK_DESIGN_IDS.approved);
    const withGlb = await getDesignPrintConfig(cup);
    expect(withGlb.template.sku).toBe(cup.variant.sku);
  });
});

describe("create, rename, revise", () => {
  it("creates a DRAFT from a variant with the trimmed input", async () => {
    const created = await createDesign({ ...BAG, name: "  Túi quán  " });
    expect(created).toMatchObject({ status: "DRAFT", version: 0, name: "Túi quán" });
    expect(backend.get).toHaveBeenCalledWith("/catalog/products/tui-giay-kraft/customization", {
      params: { sku: BAG.sku },
    });
    expect(backend.post).toHaveBeenCalledWith("/designs/mine", {
      productId: BAG_PRODUCT_ID,
      sku: BAG.sku,
      templateCode: BAG_TEMPLATE,
      name: "Túi quán",
    });
    expect(await getDraftCount()).toMatchObject({ drafts: 3 });
  });

  it("refuses a name the server would refuse without calling it", async () => {
    await expect(createDesign({ ...BAG, name: "x".repeat(201) })).rejects.toBeInstanceOf(
      z.ZodError,
    );
    await expect(renameDesign(draft, { name: " ", version: 2 })).rejects.toBeInstanceOf(z.ZodError);
    expect(backend.post).not.toHaveBeenCalled();
    expect(backend.put).not.toHaveBeenCalled();
  });

  it("answers a variant without a template with PRINT_CONFIG_NOT_FOUND, before any design is made", async () => {
    const request = createDesign({ ...BAG, sku: MOCK_SKU_WITHOUT_PRINT_CONFIG, name: "Túi" });
    expect(await errorOf(request)).toEqual({ status: 404, code: "PRINT_CONFIG_NOT_FOUND" });
    expect(backend.post).not.toHaveBeenCalled();
  });

  it("renames with the version the customer sees; the rename bumps it; a stale one is refused", async () => {
    const renamed = await renameDesign(draft, { name: " Túi mới ", version: 2 });
    expect(renamed).toMatchObject({ id: draft, name: "Túi mới", version: 3 });
    expect(backend.put).toHaveBeenCalledWith(`/designs/${draft}/name`, {
      version: 2,
      name: "Túi mới",
    });

    expect(await errorOf(renameDesign(draft, { name: "Túi", version: 2 }))).toEqual({
      status: 409,
      code: "CONFLICT",
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
    expect(await errorOf(createRevision(draft))).toEqual({ status: 409, code: "CONFLICT" });
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
    expect(await errorOf(stale)).toEqual({ status: 409, code: "CONFLICT" });
  });

  it("refuses a document over the size limit without sending it", async () => {
    const { document } = await getDesignDocument(draft);
    document.surfaces.FRONT?.elements.push(textEl("big", { name: "x".repeat(1_000_001) }));
    expect(await errorOf(saveDesignDocument(draft, { version: 2, document }))).toEqual({
      status: 413,
      code: "REQUEST_BODY_TOO_LARGE",
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

  it("lets the BE's 415 UNSUPPORTED_MEDIA_TYPE through for a format the template does not take, with only a message", async () => {
    const gif = new Blob(["GIF89a"], { type: "image/gif" });
    const error = await uploadDesignAsset(draft, gif, "a.gif", "key-2").catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      details: undefined,
    });
  });

  it("lets a file over the template's size through as 413 PAYLOAD_TOO_LARGE", async () => {
    const big = new Blob([new Uint8Array(51 * 1024 * 1024)], { type: "image/png" });
    expect(await errorOf(uploadDesignAsset(draft, big, "big.png", "key-3"))).toEqual({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
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

  it("sends the BE's flow: each file as an artifact bound to the saved layout, the version read again, then the request for review", async () => {
    const files = bundle();
    const { checksum } = await getDesignDocument(draft);
    const submitted = await submitDesign(draft, {
      documentChecksum: checksum,
      files,
      runNonce: RUN,
    });
    // Three uploads moved the version on from 2; the request carries the one read after them.
    expect(submitted).toMatchObject({ id: draft, status: "PENDING_REVIEW", version: 6 });

    const posts = backend.post.mock.calls;
    const uploads = posts.filter(([url]) => url === `/designs/${draft}/artifacts`);
    expect(uploads.map(([, , config]) => config?.params)).toEqual([
      { role: "CUSTOMER_PREVIEW", documentChecksum: checksum },
      { role: "PRINT_READY", documentChecksum: checksum },
      { role: "TECHNICAL_SPEC", documentChecksum: checksum },
    ]);
    for (const [, body, config] of uploads) {
      expect(config).toMatchObject({
        headers: { "Content-Type": "multipart/form-data", "Idempotency-Key": expect.any(String) },
        timeout: 120_000,
      });
      expect((body as FormData).get("file")).toMatchObject({ name: expect.any(String) });
    }
    expect(posts.at(-1)).toEqual([`/designs/${draft}/technical-review-requests`, { version: 5 }]);
    // No second call to record a refusal, and the old one-call submission is gone.
    expect(posts.some(([url]) => String(url).endsWith("/preflight-failures"))).toBe(false);
    expect(posts.some(([url]) => String(url).endsWith("/submissions"))).toBe(false);

    // What the BE stored is what was sent, the newest file of each role.
    const stored = await listDesignFiles(draft);
    expect(stored.map((f) => [f.role, f.name])).toEqual([
      ["CUSTOMER_PREVIEW", "preview.png"],
      ["PRINT_READY", "print-ready.pdf"],
      ["TECHNICAL_SPEC", "technical-spec.pdf"],
    ]);
    for (const file of stored) {
      const sent = files[file.role as keyof typeof files].bytes.slice();
      expect(file.sha256).toBe(await sha256Hex(sent));
    }
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

  it("wraps a file's own bytes in the part: a copy of a 50 MB print file would be another array", async () => {
    const files = bundle();
    const bytes = new TextEncoder().encode("%PDF print");
    const print = new Uint8Array(new ArrayBuffer(bytes.length));
    print.set(bytes);
    files.PRINT_READY.bytes = print;
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
      const { checksum } = await getDesignDocument(draft);
      await submitDesign(draft, { documentChecksum: checksum, files, runNonce: RUN });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(wrapped).toContain(print);
  });

  it("lets the BE's own preflight Fail through, in the studio's issue list, and never records it again", async () => {
    // A new design is an empty layout: the BE's preflight refuses it (EMPTY_DESIGN).
    const created = await createDesign({ ...BAG, name: "Túi trống" });
    const { checksum } = await getDesignDocument(created.id);
    const error = await submitDesign(created.id, {
      documentChecksum: checksum,
      files: bundle(),
      runNonce: RUN,
    }).catch((err: unknown) => err);
    expect(error).toMatchObject({ status: 422, code: "DESIGN_PREFLIGHT_FAILED" });
    expect(preflightIssuesOf(error)).toEqual([
      { ruleId: "EMPTY_DESIGN", level: "fail", message: "Thiết kế chưa có nội dung." },
    ]);
    // The BE put it on the history itself; the version did not move.
    expect((await getDesignHistory(created.id)).map((event) => event.type)).toEqual([
      "CREATED",
      "PREFLIGHT_FAILED",
    ]);
    expect(
      backend.post.mock.calls.some(([url]) => String(url).endsWith("/preflight-failures")),
    ).toBe(false);
  });

  it("answers 409 DESIGN_FILES_OUTDATED, with the roles, when a file was drawn from another layout", async () => {
    const { checksum } = await getDesignDocument(draft);
    await uploadDesignFiles(draft, bundle(), checksum, RUN);
    await backend.store.simulateOutdatedFiles(draft, ["PRINT_READY"]);
    const error = await requestReview(draft, await readDesignVersion(draft)).catch(
      (err: unknown) => err,
    );
    expect(error).toMatchObject({ status: 409, code: "DESIGN_FILES_OUTDATED" });
    expect(outdatedRolesOf(error)).toEqual(["PRINT_READY"]);
  });

  it("replays a repeated key without making that artifact current: the same run's repair loops, a new run's does not", async () => {
    const { checksum } = await getDesignDocument(draft);
    await uploadDesignFiles(draft, bundle(), checksum, RUN);
    // The current print file reads as drawn from another layout (a template edited since).
    await backend.store.simulateOutdatedFiles(draft, ["PRINT_READY"]);

    // The same run, the same bytes: the BE answers the first artifact and attaches nothing.
    const version = await readDesignVersion(draft);
    await uploadDesignFiles(draft, bundle(), checksum, RUN, ["PRINT_READY"]);
    expect(await readDesignVersion(draft)).toBe(version);
    const loop = await requestReview(draft, version).catch((err: unknown) => err);
    expect(outdatedRolesOf(loop)).toEqual(["PRINT_READY"]);

    // Another run (a redraw): the very same bytes are a new upload, now the current file.
    await uploadDesignFiles(draft, bundle(), checksum, "run-2", ["PRINT_READY"]);
    const sent = await requestReview(draft, await readDesignVersion(draft));
    expect(sent.status).toBe("PENDING_REVIEW");
  });

  it("answers a print file that is not a PDF with the BE's PRINT_FILE_INVALID finding", async () => {
    const files = bundle();
    files.PRINT_READY = { name: "print.png", type: "image/png", bytes: pngBytes(10, 10) };
    const { checksum } = await getDesignDocument(draft);
    const error = await submitDesign(draft, {
      documentChecksum: checksum,
      files,
      runNonce: RUN,
    }).catch((err: unknown) => err);
    expect(error).toMatchObject({ status: 422, code: "DESIGN_PREFLIGHT_FAILED" });
    expect(preflightIssuesOf(error)?.[0]).toMatchObject({
      ruleId: "PRINT_FILE_INVALID",
      message: expect.stringContaining("PDF"),
    });
  });

  it("records a preflight the browser refused: findings by rule, no message, at the version it checked", async () => {
    const issues = [
      {
        ruleId: "DPI_BELOW_MIN" as const,
        level: "fail" as const,
        message: "Ảnh dưới 300 DPI.",
        surfaceCode: "BODY" as const,
        elementId: "el-sang-1",
      },
      {
        ruleId: "NO_CARTON_SPEC" as const,
        level: "fail" as const,
        message: "Thiếu quy cách thùng.",
      },
    ];
    const event = await recordPreflightFailure(returned, { version: 5, issues });
    expect(event).toMatchObject({
      type: "PREFLIGHT_FAILED",
      version: 5,
      note: "DPI_BELOW_MIN; CARTON_SPEC_MISSING",
    });
    // The BE's key is `rule` (its name for the carton spec), and it ignores a message: none is sent.
    expect(backend.post).toHaveBeenCalledWith(`/designs/${returned}/preflight-failures`, {
      version: 5,
      issues: [
        { rule: "DPI_BELOW_MIN", surfaceCode: "BODY", elementId: "el-sang-1" },
        { rule: "CARTON_SPEC_MISSING" },
      ],
    });
    const { version: pendingVersion } = await getDesign(pending);
    expect(
      await errorOf(recordPreflightFailure(pending, { version: pendingVersion, issues })),
    ).toEqual({
      status: 409,
      code: "DESIGN_NOT_DRAFT",
    });
  });

  it("lists no files before a design was ever sent", async () => {
    expect(await listDesignFiles(draft)).toEqual([]);
  });

  it("lists the newest file of each role, links one only when asked, and reads an approved design's from its snapshot", async () => {
    const { checksum } = await getDesignDocument(draft);
    await uploadDesignFiles(draft, bundle(), checksum, RUN);
    const [preview] = await listDesignFiles(draft);
    expect(backend.get.mock.calls.some(([url]) => String(url).includes("download-url"))).toBe(
      false,
    );
    const link = await getArtifactDownloadUrl(draft, preview!.artifactId);
    expect(link).toMatchObject({
      url: expect.stringContaining("blob:mock/"),
      expiresAt: expect.any(String),
    });

    const frozen = await listDesignFiles(approved, undefined, true);
    expect(frozen.map((f) => f.role)).toEqual([
      "CUSTOMER_PREVIEW",
      "PRINT_READY",
      "TECHNICAL_SPEC",
    ]);
    expect(backend.get).toHaveBeenCalledWith(`/designs/${approved}/snapshot`, {});
  });

  it("refuses a link to an approved file that lost its bytes with 409 CONFLICT, worded as an integrity failure", async () => {
    await backend.store.simulateCorruptFile(approved, "PRINT_READY");
    const files = await listDesignFiles(approved);
    const print = files.find((f) => f.role === "PRINT_READY")!;
    const error = await getArtifactDownloadUrl(approved, print.artifactId).catch(
      (err: unknown) => err,
    );
    expect(error).toMatchObject({ status: 409, code: "CONFLICT" });
    expect(describeFileDownloadError(error)).toContain("kiểm tra toàn vẹn");
  });
});

describe("deleting", () => {
  it("posts { version } to /archive; the draft is ARCHIVED and answers 404 from then on", async () => {
    expect(await errorOf(deleteDesign(draft, { version: 1 }))).toEqual({
      status: 409,
      code: "CONFLICT",
    });
    const removed = await deleteDesign(draft, { version: 2 });
    expect(removed).toMatchObject({ id: draft, status: "ARCHIVED" });
    expect(backend.post).toHaveBeenLastCalledWith(`/designs/${draft}/archive`, { version: 2 });
    expect(await errorOf(getDesign(draft))).toEqual({ status: 404, code: "NOT_FOUND" });
  });

  it("refuses to delete a design that is not a DRAFT", async () => {
    const { version } = await getDesign(approved);
    expect(await errorOf(deleteDesign(approved, { version }))).toEqual({
      status: 409,
      code: "DESIGN_NOT_DRAFT",
    });
  });
});
