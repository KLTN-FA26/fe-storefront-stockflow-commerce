import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import {
  confirmDesign,
  createDesign,
  forkDesign,
  getArtifactDownloadUrl,
  getAssetDownloadUrl,
  getCustomization,
  getDesign,
  getDesignDocument,
  getDesignHistory,
  getDesignSnapshot,
  listArtifacts,
  listDesignAssets,
  listDesigns,
  requestChanges,
  requestTechnicalReview,
  reviseSpecification,
  saveDesignDocument,
  submitForConfirmation,
  uploadArtifact,
  uploadDesignAsset,
  withdrawConfirmation,
} from "../api";
import { emptyDocument } from "../engine/document/factory";
import type { DesignDocument } from "../engine/document/schema";
import { cup12oz, textEl } from "../engine/__tests__/fixtures";
import {
  beArtifact,
  beAsset,
  beCustomization,
  beDecision,
  beDocumentRecord,
  beDownload,
  beDraft,
  bePage,
  beSnapshot,
  cupDocument,
  ids,
  validCreateInput,
} from "./fixtures";

afterEach(() => vi.restoreAllMocks());

const png = () => new Blob(["x"], { type: "image/png" });

describe("design reads (BE DesignWorkflowController)", () => {
  it("lists designs with the BE's 0-based page and the status filter", async () => {
    // The BE answers the page it was asked for, 0-based.
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({ data: bePage([beDraft()], { page: 1 }) });
    const page = await listDesigns({ page: 2, size: 12, status: "APPROVED" });
    expect(get).toHaveBeenCalledWith("/designs", {
      params: { page: 1, size: 12, status: "APPROVED" },
    });
    expect(page.page).toBe(2);
  });

  it("sends no status when there is none, never a negative page, and the abort signal", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: bePage([beDraft()]) });
    const controller = new AbortController();
    await listDesigns({ page: 0, size: 12 }, controller.signal);
    const config = get.mock.calls[0]?.[1];
    expect(config).toMatchObject({ params: { page: 0, size: 12 }, signal: controller.signal });
    expect(config?.params).not.toHaveProperty("status");
  });

  it("returns 1-based page numbers", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: bePage([], { page: 0 }) });
    await expect(listDesigns({ page: 1, size: 12 })).resolves.toMatchObject({ page: 1, items: [] });
  });

  it("reads one design, percent-encoding the id", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: beDraft() });
    await expect(getDesign("a/b c")).resolves.toMatchObject({ id: ids.design });
    expect(get).toHaveBeenCalledWith("/designs/a%2Fb%20c", {});
  });

  it("reads the decision history with a 0-based page", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({
      data: bePage([beDecision], { page: 0, size: 20 }),
    });
    const history = await getDesignHistory("d-1", { page: 1, size: 20 });
    expect(get).toHaveBeenCalledWith("/designs/d-1/history", { params: { page: 0, size: 20 } });
    expect(history).toMatchObject({ page: 1 });
    expect(history.items[0]?.decision).toBe("TECHNICAL_REVIEW_PASSED");
  });

  it("reads the confirmed snapshot", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: beSnapshot });
    await expect(getDesignSnapshot("d-1")).resolves.toMatchObject({ id: ids.snapshot });
    expect(get).toHaveBeenCalledWith("/designs/d-1/snapshot", {});
  });

  it("rejects with a ZodError when the BE breaks the contract", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: beDraft({ status: "LOCKED" }) });
    await expect(getDesign("d-1")).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe("creating a design (P1) and reading the customization (P2)", () => {
  it("creates through POST /designs/mine with the trimmed input", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beDraft() });
    await expect(
      createDesign({ ...validCreateInput, name: "  Ly giấy logo quán " }),
    ).resolves.toMatchObject({ id: ids.design });
    expect(post).toHaveBeenCalledWith("/designs/mine", {
      ...validCreateInput,
      name: "Ly giấy logo quán",
    });
  });

  it("refuses what the BE would refuse without calling it", async () => {
    const post = vi.spyOn(api, "post");
    await expect(createDesign({ ...validCreateInput, name: " " })).rejects.toBeInstanceOf(
      z.ZodError,
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("maps a missing self-service endpoint to DESIGN_API_UNAVAILABLE", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(
      new ApiError(404, "NOT_FOUND", "No static resource"),
    );
    await expect(createDesign(validCreateInput)).rejects.toMatchObject({
      status: 404,
      code: "DESIGN_API_UNAVAILABLE",
    });
  });

  it("maps a 405 (POST /designs/mine meets GET /designs/{id}) the same way", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(405, "HTTP_405", "Not allowed"));
    await expect(createDesign(validCreateInput)).rejects.toMatchObject({
      code: "DESIGN_API_UNAVAILABLE",
    });
  });

  it("lets the answers the shipped P1 gives through untouched", async () => {
    const post = vi.spyOn(api, "post");
    const notCustomizable = new ApiError(409, "PRODUCT_NOT_CUSTOMIZABLE", "x");
    post.mockRejectedValueOnce(notCustomizable);
    await expect(createDesign(validCreateInput)).rejects.toBe(notCustomizable);

    const noProduct = new ApiError(404, "PRODUCT_NOT_FOUND", "x");
    post.mockRejectedValueOnce(noProduct);
    await expect(createDesign(validCreateInput)).rejects.toBe(noProduct);
  });

  it("reads the customization by slug, normalising what the BE spells differently", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: beCustomization() });
    const customization = await getCustomization("ly giấy/12oz");
    expect(get).toHaveBeenCalledWith(
      "/catalog/products/ly%20gi%E1%BA%A5y%2F12oz/customization",
      {},
    );
    expect(customization.templates[0]).toMatchObject({
      allowedFileFormats: ["image/png", "image/jpeg"],
      allowedFontCodes: null,
    });
  });

  it("maps a 405 on the customization to DESIGN_API_UNAVAILABLE but keeps a 404 a 404", async () => {
    const get = vi.spyOn(api, "get");
    get.mockRejectedValueOnce(new ApiError(405, "HTTP_405", "x"));
    await expect(getCustomization("ly")).rejects.toMatchObject({ code: "DESIGN_API_UNAVAILABLE" });

    const missing = new ApiError(404, "NOT_FOUND", "x");
    get.mockRejectedValueOnce(missing);
    await expect(getCustomization("ly")).rejects.toBe(missing);
  });
});

describe("design document (P3)", () => {
  it("reads the stored document", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: beDocumentRecord() });
    const record = await getDesignDocument("d-1");
    expect(get).toHaveBeenCalledWith("/designs/d-1/document", {});
    expect(record).toMatchObject({ version: 3, checksum: "d".repeat(64) });
  });

  it("saves the document with the version it was read at", async () => {
    const put = vi
      .spyOn(api, "put")
      .mockResolvedValueOnce({ data: beDocumentRecord({ version: 4 }) });
    const document = cupDocument();
    const record = await saveDesignDocument("d-1", { version: 3, document });
    expect(put).toHaveBeenCalledWith("/designs/d-1/document", { version: 3, document });
    expect(record.version).toBe(4);
  });

  it("refuses an oversized document without calling the BE", async () => {
    const put = vi.spyOn(api, "put");
    const hugeDoc: DesignDocument = emptyDocument(cup12oz);
    hugeDoc.surfaces.BODY?.elements.push(textEl("t1", { name: "x".repeat(1_000_001) }));

    await expect(
      saveDesignDocument("d-1", { version: 1, document: hugeDoc }),
    ).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(put).not.toHaveBeenCalled();
  });

  it("maps a missing document endpoint to DESIGN_API_UNAVAILABLE", async () => {
    vi.spyOn(api, "put").mockRejectedValueOnce(new ApiError(405, "HTTP_405", "x"));
    await expect(
      saveDesignDocument("d-1", { version: 1, document: cupDocument() }),
    ).rejects.toMatchObject({ code: "DESIGN_API_UNAVAILABLE" });
  });

  it("lets a version conflict through for the editor to handle", async () => {
    const conflict = new ApiError(409, "CONFLICT", "changed");
    vi.spyOn(api, "put").mockRejectedValueOnce(conflict);
    await expect(saveDesignDocument("d-1", { version: 1, document: cupDocument() })).rejects.toBe(
      conflict,
    );
  });
});

describe("assets (P4)", () => {
  it("lists a design's assets", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: [beAsset] });
    const assets = await listDesignAssets("d-1");
    expect(get).toHaveBeenCalledWith("/designs/d-1/assets", {});
    expect(assets[0]).toMatchObject({ assetId: ids.asset });
  });

  it("uploads assets as multipart with an idempotency key", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beAsset });
    const asset = await uploadDesignAsset("d-1", png(), "logo.png", "key-1");
    const [url, body, config] = post.mock.calls[0]!;
    expect(url).toBe("/designs/d-1/assets");
    expect(body).toBeInstanceOf(FormData);
    expect(config).toMatchObject({
      headers: { "Content-Type": "multipart/form-data", "Idempotency-Key": "key-1" },
    });
    expect(asset.originalName).toBe("logo.png");
  });

  it("sends the file under the `file` field with its name", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beAsset });
    await uploadDesignAsset("d-1", png(), "logo.png", "key-1");
    const file = (post.mock.calls[0]![1] as FormData).get("file");
    expect(file).toBeInstanceOf(Blob);
    expect((file as File).name).toBe("logo.png");
  });

  it("gives a large upload more time than the JSON default", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beAsset });
    await uploadDesignAsset("d-1", png(), "logo.png", "key-1");
    const timeout = (post.mock.calls[0]![2] as { timeout: number }).timeout;
    expect(timeout).toBeGreaterThan(api.defaults.timeout ?? 0);
  });

  it("reads a short-lived download link, encoding both ids", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: beDownload });
    const link = await getAssetDownloadUrl("d 1", "a/1");
    expect(get).toHaveBeenCalledWith("/designs/d%201/assets/a%2F1/download-url", {});
    expect(link.url).toContain("https://");
  });

  it("maps a missing asset endpoint to DESIGN_API_UNAVAILABLE", async () => {
    vi.spyOn(api, "get").mockRejectedValueOnce(new ApiError(405, "HTTP_405", "x"));
    await expect(listDesignAssets("d-1")).rejects.toMatchObject({
      code: "DESIGN_API_UNAVAILABLE",
    });
  });

  it("lets a file the BE refuses surface with its own code", async () => {
    const tooLarge = new ApiError(413, "PAYLOAD_TOO_LARGE", "x");
    vi.spyOn(api, "post").mockRejectedValueOnce(tooLarge);
    await expect(uploadDesignAsset("d-1", png(), "logo.png", "key-1")).rejects.toBe(tooLarge);
  });
});

describe("artifacts (BE DesignController)", () => {
  it("lists artifacts", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: [beArtifact] });
    await expect(listArtifacts("d-1")).resolves.toHaveLength(1);
    expect(get).toHaveBeenCalledWith("/designs/d-1/artifacts", {});
  });

  it("uploads an artifact with its role, multipart and an idempotency key", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beArtifact });
    await uploadArtifact("d-1", "TECHNICAL_SPEC", new Blob(["%PDF"]), "spec.pdf", "key-2");
    const [url, body, config] = post.mock.calls[0]!;
    expect(url).toBe("/designs/d-1/artifacts");
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBeInstanceOf(Blob);
    expect(config).toMatchObject({
      params: { role: "TECHNICAL_SPEC" },
      headers: { "Content-Type": "multipart/form-data", "Idempotency-Key": "key-2" },
    });
  });

  it("refuses an unknown role without calling the BE", async () => {
    const post = vi.spyOn(api, "post");
    await expect(
      uploadArtifact("d-1", "LOGO" as never, png(), "logo.png", "key-3"),
    ).rejects.toBeInstanceOf(z.ZodError);
    expect(post).not.toHaveBeenCalled();
  });

  it("reads an artifact's download link", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: beDownload });
    await getArtifactDownloadUrl("d-1", ids.artifact);
    expect(get).toHaveBeenCalledWith(`/designs/d-1/artifacts/${ids.artifact}/download-url`, {});
  });
});

describe("workflow writes", () => {
  it("revises the specification text", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValueOnce({ data: beDraft() });
    await reviseSpecification("d-1", { version: 3, spec: "Mẫu ly" });
    expect(put).toHaveBeenCalledWith("/designs/d-1/specification", { version: 3, spec: "Mẫu ly" });
  });

  it("asks for the technical review (P5)", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: beDraft({ reviewRequestedAt: "2026-10-25T08:00:00Z" }) });
    const draft = await requestTechnicalReview("d-1", { version: 3 });
    expect(post).toHaveBeenCalledWith("/designs/d-1/technical-review-requests", { version: 3 });
    expect(draft.reviewRequestedAt).toBe("2026-10-25T08:00:00Z");
  });

  it("maps a missing review-request endpoint to DESIGN_API_UNAVAILABLE", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(405, "HTTP_405", "x"));
    await expect(requestTechnicalReview("d-1", { version: 3 })).rejects.toMatchObject({
      code: "DESIGN_API_UNAVAILABLE",
    });
  });

  it("submits for confirmation with the version only", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: beDraft({ status: "SUBMITTED" }) });
    const draft = await submitForConfirmation("d-1", { version: 4 });
    expect(post).toHaveBeenCalledWith("/designs/d-1/confirmation-requests", { version: 4 });
    expect(draft.status).toBe("SUBMITTED");
  });

  it("confirms with the artifact and answers the immutable snapshot", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beSnapshot });
    const snapshot = await confirmDesign("d-1", { version: 5, artifactId: ids.artifact });
    expect(post).toHaveBeenCalledWith("/designs/d-1/confirmations", {
      version: 5,
      artifactId: ids.artifact,
    });
    expect(snapshot.checksum).toBe("b".repeat(64));
  });

  it("asks for changes and withdraws with a trimmed reason", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: beDraft() });
    await requestChanges("d-1", { version: 5, reason: "  Đổi màu logo " });
    await withdrawConfirmation("d-1", { version: 5, reason: " Chờ báo giá " });
    expect(post).toHaveBeenNthCalledWith(1, "/designs/d-1/change-requests", {
      version: 5,
      reason: "Đổi màu logo",
    });
    expect(post).toHaveBeenNthCalledWith(2, "/designs/d-1/confirmation-withdrawals", {
      version: 5,
      reason: "Chờ báo giá",
    });
  });

  it("refuses a blank reason without calling the BE", async () => {
    const post = vi.spyOn(api, "post");
    await expect(requestChanges("d-1", { version: 5, reason: "  " })).rejects.toBeInstanceOf(
      z.ZodError,
    );
    await expect(withdrawConfirmation("d-1", { version: 5, reason: "" })).rejects.toBeInstanceOf(
      z.ZodError,
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("forks an approved design into a new draft", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: beDraft({ parentSnapshotId: ids.snapshot }) });
    const draft = await forkDesign("d-1");
    expect(post.mock.calls[0]?.[0]).toBe("/designs/d-1/revisions");
    expect(draft.parentSnapshotId).toBe(ids.snapshot);
  });
});
