import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { MOCK_PRINT_CONFIGS } from "@/lib/api/mock-fixtures/design-print-configs";
import type { MockResult } from "@/lib/api/mock-fixtures/design-rows";
import { MOCK_DESIGN_IDS } from "@/lib/api/mock-fixtures/design-seed";
import { createMemoryStorage } from "@/lib/api/mock-fixtures/design-storage";
import { createDesignMockStore, type DesignMockStore } from "@/lib/api/mock-fixtures/design-store";

import { pngBytes } from "../engine/__tests__/fixtures";
import { sha256Hex } from "../engine/export/checksum";
import {
  designAssetDtoSchema,
  designDocumentRecordDtoSchema,
  designDtoSchema,
  designEventDtoSchema,
  designFileDtoSchema,
  designPageDtoSchema,
  downloadLinkDtoSchema,
  draftCountDtoSchema,
  preflightIssueSchema,
  printConfigDtoSchema,
} from "../schemas";

// The mock must answer what the feature's schemas parse: a contract drift between the design mock
// (src/lib/api/mock-fixtures/design-*) and schemas.ts fails here, not in a screen. The store's own
// rules are tested next to it; this file only parses what it answers.

const { returned, pending, approved } = MOCK_DESIGN_IDS;
const uuid = (n: number) => `5e5e0000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

let store: DesignMockStore;
beforeEach(async () => {
  let n = 0;
  store = await createDesignMockStore({
    storage: createMemoryStorage(),
    newId: () => uuid(0x1000 + n++),
    readImageSize: async () => ({ widthPx: 1200, heightPx: 800 }),
    toUrl: (key) => `blob:mock/${key}`,
  });
});

/** The body of a 2xx answer, unwrapped from its envelope. */
function body(result: MockResult): unknown {
  expect(result.status, JSON.stringify(result.data)).toBeLessThan(300);
  return (result.data as { data: unknown }).data;
}
const parse = <S extends z.ZodType>(schema: S, result: MockResult): z.infer<S> =>
  schema.parse(body(result));

describe("reads", () => {
  it("every listed design, its history, document, images and files parse", async () => {
    const page = parse(designPageDtoSchema, await store.list({ page: 0, size: 200 }));
    expect(page.items.map((d) => d.status).sort()).toEqual([
      "APPROVED",
      "DRAFT",
      "DRAFT",
      "PENDING_REVIEW",
    ]);
    for (const { id } of page.items) {
      expect(parse(designDtoSchema, await store.get(id)).id).toBe(id);
      parse(z.array(designEventDtoSchema), await store.history(id));
      parse(designDocumentRecordDtoSchema, await store.getDocument(id));
      parse(z.array(designAssetDtoSchema), await store.listAssets(id));
      parse(z.array(designFileDtoSchema), await store.files(id));
    }
    expect(parse(draftCountDtoSchema, await store.draftCount())).toEqual({ drafts: 2, limit: 50 });
  });

  it("the approved design's image link parses", async () => {
    const [logo] = parse(z.array(designAssetDtoSchema), await store.listAssets(approved));
    expect(logo?.assetId).toBe(MOCK_DESIGN_IDS.logoAsset);
    parse(downloadLinkDtoSchema, await store.assetLink(approved, logo!.assetId));
  });

  it.each(Object.values(MOCK_PRINT_CONFIGS).map((c) => [c.sku, c.product.slug] as const))(
    "the print configuration of %s parses",
    async (sku, slug) => {
      expect(parse(printConfigDtoSchema, await store.printConfig(slug, sku)).sku).toBe(sku);
    },
  );

  it("the default print configuration of a product the mock does not know parses", async () => {
    parse(printConfigDtoSchema, await store.printConfig("tui-giay-la", "TUI-1"));
    parse(printConfigDtoSchema, await store.printConfig("ly-nhua-la", "LY-1"));
  });
});

describe("writes", () => {
  it("create, rename, save, upload, revision and delete answer what the schemas parse", async () => {
    const created = parse(
      designDtoSchema,
      await store.create({ productSlug: "tui-giay-kraft", sku: "BAG-KRAFT-M", name: "Túi" }),
    );
    const renamed = parse(
      designDtoSchema,
      await store.rename(created.id, { name: "Túi mới", version: created.version }),
    );
    const record = parse(designDocumentRecordDtoSchema, await store.getDocument(created.id));
    parse(
      designDocumentRecordDtoSchema,
      await store.putDocument(created.id, { version: renamed.version, document: record.document }),
    );
    const png = new Blob([pngBytes(1200, 800)], { type: "image/png" });
    parse(designAssetDtoSchema, await store.uploadAsset(created.id, png, "logo.png", "k-1"));
    parse(designDtoSchema, await store.revise(approved));
    const current = parse(designDtoSchema, await store.get(created.id));
    const removed = parse(
      designDtoSchema,
      await store.remove(created.id, { version: current.version }),
    );
    expect(removed.status).toBe("ARCHIVED");
  });

  it("a submission, a simulated return and approval, and a refused preflight parse", async () => {
    const issues = [{ ruleId: "EMPTY_DESIGN", level: "fail", message: "Thiết kế trống." }];
    const before = parse(designDtoSchema, await store.get(returned));
    parse(
      designEventDtoSchema,
      await store.recordPreflightFailure(returned, { version: before.version, issues }),
    );

    const refused = await store.submit(returned, {
      version: before.version,
      preflight: { result: "Fail", issues },
      checksums: {},
      files: {},
    });
    expect(refused.status).toBe(422);
    const details = (refused.data as { details?: { issues?: unknown } }).details;
    expect(z.array(preflightIssueSchema).parse(details?.issues)).toEqual(issues);

    const files = {
      CUSTOMER_PREVIEW: new Blob([pngBytes(1600, 900)], { type: "image/png" }),
      PRINT_READY: new Blob(["%PDF print"], { type: "application/pdf" }),
      TECHNICAL_SPEC: new Blob(["%PDF spec"], { type: "application/pdf" }),
    };
    const checksums = Object.fromEntries(
      await Promise.all(
        Object.entries(files).map(async ([role, file]) => [
          role,
          await sha256Hex(new Uint8Array(await file.arrayBuffer())),
        ]),
      ),
    );
    const submitted = parse(
      designDtoSchema,
      await store.submit(returned, {
        version: before.version,
        preflight: { result: "Pass", issues: [] },
        checksums,
        files,
      }),
    );
    expect(submitted.status).toBe("PENDING_REVIEW");
    parse(z.array(designFileDtoSchema), await store.files(returned));

    const back = parse(designDtoSchema, await store.simulateReturn(returned, { reason: "Mờ" }));
    expect(back.lastReturn?.reason).toBe("Mờ");
    const approvedNow = parse(designDtoSchema, await store.simulateApprove(pending));
    expect(approvedNow.approval).not.toBeNull();
    parse(z.array(designEventDtoSchema), await store.history(pending));
  });
});
