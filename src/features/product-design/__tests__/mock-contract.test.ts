// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  MOCK_DESIGN_PRODUCT_SLUGS,
  MOCK_DESIGN_TEMPLATES,
} from "@/lib/api/mock-fixtures/design-templates";
import {
  MOCK_DESIGN_IDS,
  MOCK_SEED_CHECKSUMS,
  createMockDesignStudio,
  snapshotChecksum,
  type MockResult,
} from "@/lib/api/mock-fixtures/designs";

import { emptyDocument } from "../engine/document/factory";
import { documentChecksum } from "../engine/export/checksum";
import { customizationTemplateSchema } from "../engine/template/schema";
import {
  customizationDtoSchema,
  designArtifactDtoSchema,
  designAssetDtoSchema,
  designDecisionPageDtoSchema,
  designDocumentRecordDtoSchema,
  designDraftDtoSchema,
  designPageDtoSchema,
  designSnapshotDtoSchema,
  downloadLinkDtoSchema,
} from "../schemas";

// The mock BE must send what the FE schemas parse: a contract drift is caught here, not in a screen.

const USER = "5e5e0000-0000-4000-8000-00000000000a";
const CUSTOMER = "5e5e0000-0000-4000-8000-00000000000b";
const png = (bytes = 8) =>
  new File([new Uint8Array(bytes).fill(7)], "logo.png", { type: "image/png" });

function studio() {
  let n = 0;
  return createMockDesignStudio({
    userId: USER,
    customerId: CUSTOMER,
    newId: () => `5e5e0000-0000-4000-8000-${(0x1000 + n++).toString(16).padStart(12, "0")}`,
    readImageSize: async () => ({ width: 1200, height: 800 }),
    toUrl: (blob) => `blob:mock/${blob.size}`,
  });
}

const body = (result: MockResult): unknown => {
  expect(result.status, JSON.stringify(result.data)).toBeLessThan(300);
  return (result.data as { data: unknown }).data;
};
const parse = <S extends z.ZodType>(schema: S, result: MockResult): z.infer<S> =>
  schema.parse(body(result));

describe("mock design templates", () => {
  it.each(Object.entries(MOCK_DESIGN_TEMPLATES))(
    "%s parses with the engine template schema, cup sector included",
    (sku, template) => {
      expect(customizationTemplateSchema.parse(template)).toEqual(template);
      expect(template.sku).toBe(sku);
      expect(MOCK_DESIGN_PRODUCT_SLUGS[sku]).toBeTruthy();
    },
  );

  it("cover the eight customizable SKUs with unique codes and ids", () => {
    const templates = Object.values(MOCK_DESIGN_TEMPLATES);
    expect(templates.map((t) => t.code).sort()).toEqual([
      "BAGL-4F",
      "BAGM-4F",
      "CUP12-BODY",
      "CUP12-LOGO",
      "CUP16-KRAFT",
      "CUP8-KRAFT",
      "CUP8-WHT",
      "PET500-BODY",
    ]);
    expect(new Set(templates.map((t) => t.templateId)).size).toBe(templates.length);
    expect(MOCK_DESIGN_TEMPLATES["CUP-PET-500ML"]).toMatchObject({ minDpi: 200 });
    expect(
      MOCK_DESIGN_TEMPLATES["BAG-KRAFT-L"]?.printAreas.map((a) => [a.code, a.widthMm, a.heightMm]),
    ).toEqual([
      ["FRONT", 320, 375],
      ["BACK", 320, 375],
      ["LEFT", 120, 375],
      ["RIGHT", 120, 375],
    ]);
  });

  it("round-trip through the customization answer, null fields restored", () => {
    const s = studio();
    for (const slug of new Set(Object.values(MOCK_DESIGN_PRODUCT_SLUGS))) {
      const { templates, kind } = parse(customizationDtoSchema, s.customization(slug));
      expect(kind).toBe("CUSTOMIZABLE");
      expect(templates.length).toBeGreaterThan(0);
      for (const template of templates)
        expect(template).toEqual(MOCK_DESIGN_TEMPLATES[template.sku]);
    }
  });
});

describe("mock design studio answers parse with the DTO schemas", () => {
  it("seeded designs: list, get, history, document, snapshot, links", () => {
    const s = studio();
    const page = parse(designPageDtoSchema, s.list());
    expect(page.items.map((d) => d.id)).toEqual([
      MOCK_DESIGN_IDS.draftBag,
      MOCK_DESIGN_IDS.approvedCup,
    ]);

    const approved = parse(designDraftDtoSchema, s.get(MOCK_DESIGN_IDS.approvedCup));
    expect(approved).toMatchObject({ status: "APPROVED", sku: "CUP-PAPER-12OZ-WHT" });
    expect(parse(designDraftDtoSchema, s.get(MOCK_DESIGN_IDS.draftBag))).toMatchObject({
      status: "DRAFT",
    });
    expect(
      parse(designDecisionPageDtoSchema, s.history(MOCK_DESIGN_IDS.approvedCup)).items,
    ).toHaveLength(3);

    for (const id of [MOCK_DESIGN_IDS.approvedCup, MOCK_DESIGN_IDS.draftBag]) {
      parse(designDocumentRecordDtoSchema, s.getDocument(id));
    }
    const snapshot = parse(designSnapshotDtoSchema, s.snapshot(MOCK_DESIGN_IDS.approvedCup));
    expect(snapshot.id).toBe(MOCK_DESIGN_IDS.snapshot);
    parse(z.array(designArtifactDtoSchema), s.listArtifacts(MOCK_DESIGN_IDS.approvedCup));
    parse(
      downloadLinkDtoSchema,
      s.artifactLink(MOCK_DESIGN_IDS.approvedCup, MOCK_DESIGN_IDS.preview),
    );
    parse(z.array(designAssetDtoSchema), s.listAssets(MOCK_DESIGN_IDS.draftBag));
    const logo = parse(z.array(designAssetDtoSchema), s.listAssets(MOCK_DESIGN_IDS.approvedCup));
    expect(logo.map((a) => a.assetId)).toEqual([MOCK_DESIGN_IDS.logoAsset]);
    parse(
      downloadLinkDtoSchema,
      s.assetLink(MOCK_DESIGN_IDS.approvedCup, MOCK_DESIGN_IDS.logoAsset),
    );
  });

  it("the seeded checksums are the engine's checksum of the seeded documents", async () => {
    const s = studio();
    const doc = (id: string) => parse(designDocumentRecordDtoSchema, s.getDocument(id));
    const cup = doc(MOCK_DESIGN_IDS.approvedCup);
    const bag = doc(MOCK_DESIGN_IDS.draftBag);
    expect(cup.checksum).toBe(MOCK_SEED_CHECKSUMS.cupDocument);
    expect(bag.checksum).toBe(MOCK_SEED_CHECKSUMS.bagDocument);
    expect(await documentChecksum(cup.document)).toBe(cup.checksum);
    expect(await documentChecksum(bag.document)).toBe(bag.checksum);

    const snapshot = parse(designSnapshotDtoSchema, s.snapshot(MOCK_DESIGN_IDS.approvedCup));
    expect(snapshot.checksum).toBe(MOCK_SEED_CHECKSUMS.snapshot);
    expect(await snapshotChecksum(snapshot.artifacts, cup.checksum)).toBe(snapshot.checksum);
  });

  it("a new design holds the engine's empty document of its template, at the draft's version", async () => {
    const s = studio();
    for (const [sku, templateCode] of [
      ["CUP-PAPER-12OZ-WHT", "CUP12-BODY"],
      ["BAG-KRAFT-M", "BAGM-4F"],
    ] as const) {
      const slug = MOCK_DESIGN_PRODUCT_SLUGS[sku]!;
      const { productId, templates } = parse(customizationDtoSchema, s.customization(slug));
      const draft = parse(
        designDraftDtoSchema,
        await s.create({ productId, sku, templateCode, name: "A" }),
      );
      const record = parse(designDocumentRecordDtoSchema, s.getDocument(draft.id));
      expect(record.version).toBe(draft.version);
      expect(record.document).toEqual(emptyDocument(templates.find((t) => t.sku === sku)!));
      expect(record.checksum).toBe(await documentChecksum(record.document));
    }
  });

  it("a whole workflow: every answer parses and the document checksum is the engine's", async () => {
    const s = studio();
    const draft = parse(
      designDraftDtoSchema,
      await s.create({
        productId: parseProduct(s),
        sku: "CUP-PAPER-12OZ-WHT",
        templateCode: "CUP12-BODY",
        name: "Ly A",
      }),
    );
    const seeded = parse(designDocumentRecordDtoSchema, s.getDocument(MOCK_DESIGN_IDS.approvedCup));
    const saved = parse(
      designDocumentRecordDtoSchema,
      await s.putDocument(draft.id, { version: draft.version, document: seeded.document }),
    );
    expect(saved.checksum).toBe(await documentChecksum(saved.document));
    expect(saved.document).toEqual(seeded.document);

    const asset = parse(designAssetDtoSchema, await s.uploadAsset(draft.id, png(), "asset-key-01"));
    parse(downloadLinkDtoSchema, s.assetLink(draft.id, asset.assetId));
    parse(
      designArtifactDtoSchema,
      await s.uploadArtifact(draft.id, "CUSTOMER_PREVIEW", png(9), "preview-key-1"),
    );
    parse(
      designArtifactDtoSchema,
      await s.uploadArtifact(
        draft.id,
        "PRINT_READY",
        new File([new Uint8Array(4)], "p.pdf", { type: "application/pdf" }),
      ),
    );
    expect(parse(z.array(designArtifactDtoSchema), s.listArtifacts(draft.id))).toHaveLength(2);

    const revised = parse(
      designDraftDtoSchema,
      s.revise(draft.id, { version: current(s, draft.id), spec: "Tóm tắt" }),
    );
    expect(revised.spec).toBe("Tóm tắt");
    const requested = parse(
      designDraftDtoSchema,
      s.requestReview(draft.id, { version: revised.version }),
    );
    expect(requested.reviewRequestedAt).toBe(requested.updatedAt);
    const reviewed = parse(designDraftDtoSchema, s.completeReview(draft.id, true, "Đạt"));
    expect(reviewed).toMatchObject({ technicalReviewPassed: true, reviewNotes: "Đạt" });
    const submitted = parse(
      designDraftDtoSchema,
      s.submit(draft.id, { version: reviewed.version }),
    );
    expect(submitted.status).toBe("SUBMITTED");
    const snapshot = parse(
      designSnapshotDtoSchema,
      await s.confirm(draft.id, {
        version: submitted.version,
        artifactId: submitted.currentArtifactId,
      }),
    );
    expect(snapshot.artifacts.map((a) => a.role)).toEqual(["CUSTOMER_PREVIEW", "PRINT_READY"]);
    expect(await snapshotChecksum(snapshot.artifacts, saved.checksum)).toBe(snapshot.checksum);

    const fork = parse(designDraftDtoSchema, s.fork(draft.id));
    expect(fork.parentSnapshotId).toBe(snapshot.id);
    expect(parse(designDocumentRecordDtoSchema, s.getDocument(fork.id)).checksum).toBe(
      saved.checksum,
    );
    parse(designDecisionPageDtoSchema, s.history(draft.id));
    expect(
      parse(designPageDtoSchema, s.list({ status: "APPROVED" })).items.map((d) => d.id),
    ).toContain(draft.id);
  });
});

/** The id the catalogue gives the 12oz product (the store's default lookup is the seeded catalogue). */
function parseProduct(s: ReturnType<typeof studio>): string {
  return parse(customizationDtoSchema, s.customization("ly-giay-2-lop-12oz")).productId;
}

function current(s: ReturnType<typeof studio>, id: string): number {
  return parse(designDraftDtoSchema, s.get(id)).version;
}
