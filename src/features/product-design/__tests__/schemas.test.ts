import { describe, expect, it } from "vitest";
import { z } from "zod";

import { cup12oz } from "../engine/__tests__/fixtures";
import {
  artifactRoleSchema,
  changeReasonInputSchema,
  createDesignInputSchema,
  customizationDtoSchema,
  designArtifactDtoSchema,
  designAssetDtoSchema,
  designDecisionDtoSchema,
  designDocumentRecordDtoSchema,
  designDraftDtoSchema,
  designPageDtoSchema,
  designSnapshotDtoSchema,
  designStatusSchema,
  downloadLinkDtoSchema,
} from "../schemas";
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
  beTemplate,
  ids,
  proposedDraftFields,
  validCreateInput,
} from "./fixtures";

describe("design draft (BE DesignDraftResponse)", () => {
  it("parses a BE draft without the proposed fields", () => {
    const draft = designDraftDtoSchema.parse(beDraft());
    expect(draft).toMatchObject({ status: "DRAFT", version: 3, technicalReviewPassed: false });
    expect(draft.sku).toBeUndefined();
    expect(draft.reviewRequestedAt).toBeUndefined();
  });

  it("parses the proposed P6 fields when the BE sends them", () => {
    expect(designDraftDtoSchema.parse(beDraft(proposedDraftFields))).toMatchObject({
      productSlug: "ly-giay-2-lop-12oz",
      sku: "CUP-PAPER-12OZ-WHT",
      templateCode: "CUP12-BODY",
      previewArtifactId: ids.artifact,
      reviewRequestedAt: "2026-10-25T08:00:00.123456Z",
    });
  });

  it("reads the workflow fields the BE leaves out when they are null", () => {
    const draft = designDraftDtoSchema.parse(
      beDraft({
        currentArtifactId: ids.artifact,
        reviewNotes: "Sửa lại logo",
        status: "SUBMITTED",
      }),
    );
    expect(draft).toMatchObject({ currentArtifactId: ids.artifact, reviewNotes: "Sửa lại logo" });
    expect(draft.parentSnapshotId).toBeUndefined();
    expect(draft.assignedUserId).toBeUndefined();
  });

  it("rejects a status or an id outside the contract", () => {
    expect(() => designDraftDtoSchema.parse(beDraft({ status: "LOCKED" }))).toThrow(z.ZodError);
    expect(() => designDraftDtoSchema.parse(beDraft({ id: "d-1" }))).toThrow(z.ZodError);
    expect(() => designDraftDtoSchema.parse(beDraft({ version: -1 }))).toThrow(z.ZodError);
  });

  it("knows the four BE statuses (REJECTED is declared but never set)", () => {
    expect(designStatusSchema.options).toEqual(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);
  });

  it("parses a BE page and keeps its 0-based numbering for the API layer to shift", () => {
    const page = designPageDtoSchema.parse(bePage([beDraft()], { page: 2, hasPrevious: true }));
    expect(page.items).toHaveLength(1);
    expect(page.page).toBe(2);
  });
});

describe("history, snapshot, artifacts and links", () => {
  it("parses a decision (notes and actors can be absent)", () => {
    expect(designDecisionDtoSchema.parse(beDecision)).toMatchObject({ version: 4 });
    expect(
      designDecisionDtoSchema.parse({ decision: "SUBMITTED", version: 1, at: beDecision.at }),
    ).toMatchObject({ decision: "SUBMITTED" });
  });

  it("parses a snapshot with its artifact manifest", () => {
    const snapshot = designSnapshotDtoSchema.parse(beSnapshot);
    expect(snapshot.artifacts[0]?.role).toBe("CUSTOMER_PREVIEW");
  });

  it("parses artifacts and knows the four roles", () => {
    expect(designArtifactDtoSchema.parse(beArtifact)).toMatchObject({ sizeBytes: 48_213 });
    expect(artifactRoleSchema.options).toEqual([
      "CUSTOMER_PREVIEW",
      "TECHNICAL_SPEC",
      "PRINT_READY",
      "PRODUCTION_INSTRUCTION",
    ]);
    expect(() => designArtifactDtoSchema.parse({ ...beArtifact, role: "LOGO" })).toThrow(
      z.ZodError,
    );
  });

  it("parses a presigned download link", () => {
    expect(downloadLinkDtoSchema.parse(beDownload).url).toContain("https://");
    expect(() => downloadLinkDtoSchema.parse({ expiresAt: beDownload.expiresAt })).toThrow(
      z.ZodError,
    );
  });
});

describe("design document record (P3) and asset (P4)", () => {
  it("parses a stored document through the engine's document schema", () => {
    const record = designDocumentRecordDtoSchema.parse(beDocumentRecord());
    expect(record.document.templateCode).toBe("CUP12-BODY");
    expect(record.version).toBe(3);
  });

  it("rejects a document the engine would not accept", () => {
    const bad = beDocumentRecord({ document: { schemaVersion: 2 } });
    expect(() => designDocumentRecordDtoSchema.parse(bad)).toThrow(z.ZodError);
  });

  it("parses an asset with its pixel size", () => {
    expect(designAssetDtoSchema.parse(beAsset)).toMatchObject({ widthPx: 1200, heightPx: 800 });
    expect(() => designAssetDtoSchema.parse({ ...beAsset, widthPx: 0 })).toThrow(z.ZodError);
  });
});

describe("customization (P2)", () => {
  const parseTemplate = (overrides: Record<string, unknown>) =>
    customizationDtoSchema.parse(beCustomization({ templates: [beTemplate(overrides)] }))
      .templates[0];

  it("parses a customizable product with the engine's template schema", () => {
    const customization = customizationDtoSchema.parse(beCustomization());
    expect(customization.kind).toBe("CUSTOMIZABLE");
    expect(customization.templates[0]?.model.kind).toBe("parametric-cup");
  });

  it("normalises allowed formats to lowercase MIME types, once each", () => {
    const formats = (allowedFileFormats: string[]) =>
      parseTemplate({ allowedFileFormats })?.allowedFileFormats;

    expect(formats(["PNG", "JPG", "JPEG", "WEBP"])).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
    expect(formats(["Image/PNG", "image/jpeg"])).toEqual(["image/png", "image/jpeg"]);
  });

  it("turns an empty font list into null (every registry font)", () => {
    expect(parseTemplate({ allowedFontCodes: [] })?.allowedFontCodes).toBeNull();
    expect(parseTemplate({ allowedFontCodes: ["inter", "lora"] })?.allowedFontCodes).toEqual([
      "inter",
      "lora",
    ]);
  });

  it("reads a nullable field the BE leaves out as null, not as a contract break", () => {
    const { maxColors: _maxColors, ...withoutMaxColors } = beTemplate({
      allowedFontCodes: undefined,
    });
    const parsed = customizationDtoSchema.parse(beCustomization({ templates: [withoutMaxColors] }));
    expect(parsed.templates[0]).toMatchObject({ maxColors: null, allowedFontCodes: null });
  });

  it("keeps the template's own checks: a cup whose print shape disagrees with its model fails", () => {
    const bad = beTemplate({
      printAreas: cup12oz.printAreas.map((area) => ({ ...area, shape: { type: "rect" } })),
    });
    expect(() => customizationDtoSchema.parse(beCustomization({ templates: [bad] }))).toThrow(
      z.ZodError,
    );
  });

  it("accepts a standard product with no templates", () => {
    expect(
      customizationDtoSchema.parse({ productId: ids.product, kind: "STANDARD", templates: [] }),
    ).toMatchObject({ kind: "STANDARD", templates: [] });
  });
});

describe("inputs", () => {
  it("trims the design name and requires 1-200 characters", () => {
    expect(createDesignInputSchema.parse({ ...validCreateInput, name: "  Ly logo  " }).name).toBe(
      "Ly logo",
    );
    expect(() => createDesignInputSchema.parse({ ...validCreateInput, name: "   " })).toThrow(
      z.ZodError,
    );
    expect(() =>
      createDesignInputSchema.parse({ ...validCreateInput, name: "x".repeat(201) }),
    ).toThrow(z.ZodError);
    expect(
      createDesignInputSchema.parse({ ...validCreateInput, name: "x".repeat(200) }).name,
    ).toHaveLength(200);
  });

  it("requires a product id, a sku and a template code", () => {
    expect(() => createDesignInputSchema.parse({ ...validCreateInput, productId: "ly" })).toThrow(
      z.ZodError,
    );
    expect(() => createDesignInputSchema.parse({ ...validCreateInput, sku: "" })).toThrow(
      z.ZodError,
    );
    expect(() => createDesignInputSchema.parse({ ...validCreateInput, templateCode: "" })).toThrow(
      z.ZodError,
    );
  });

  it("trims a change reason and requires 1-2000 characters", () => {
    expect(changeReasonInputSchema.parse({ reason: "  Đổi logo " }).reason).toBe("Đổi logo");
    expect(() => changeReasonInputSchema.parse({ reason: "  " })).toThrow(z.ZodError);
    expect(() => changeReasonInputSchema.parse({ reason: "x".repeat(2001) })).toThrow(z.ZodError);
    expect(changeReasonInputSchema.parse({ reason: "x".repeat(2000) }).reason).toHaveLength(2000);
  });
});
