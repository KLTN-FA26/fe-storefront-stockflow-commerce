import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { cup12oz } from "../engine/__tests__/fixtures";
import {
  createDesignInputSchema,
  designAssetDtoSchema,
  designDocumentRecordDtoSchema,
  designDtoSchema,
  designEventDtoSchema,
  designFileDtoSchema,
  designPageDtoSchema,
  designStatusSchema,
  downloadLinkDtoSchema,
  draftCountDtoSchema,
  preflightIssueSchema,
  printConfigDtoSchema,
  renameDesignInputSchema,
  returnReasonInputSchema,
} from "../schemas";
import {
  approvedDto,
  assetDto,
  designDto,
  documentRecordDto,
  downloadDto,
  eventDto,
  fileDto,
  ids,
  pageDto,
  printConfigDto,
  returnedDto,
} from "./fixtures";

const refuses = (schema: z.ZodType, value: unknown) =>
  expect(() => schema.parse(value)).toThrow(z.ZodError);

describe("a design (spec §4.1 DesignDto)", () => {
  it("knows the four statuses of the docs' lifecycle", () => {
    expect(designStatusSchema.options).toEqual(["DRAFT", "PENDING_REVIEW", "APPROVED", "ARCHIVED"]);
  });

  it("parses a draft, a returned draft and an approved design", () => {
    expect(designDtoSchema.parse(designDto())).toMatchObject({
      status: "DRAFT",
      version: 3,
      product: { slug: "ly-giay-2-lop-12oz" },
      variant: { sku: "CUP-PAPER-12OZ-WHT" },
      projectId: null,
      lastReturn: null,
    });
    expect(designDtoSchema.parse(returnedDto()).lastReturn?.reason).toContain("Logo bị mờ");
    expect(designDtoSchema.parse(approvedDto()).approval).toMatchObject({
      snapshotId: ids.snapshot,
      skuCode: "CUP-PAPER-12OZ-WHT-KH0010-001",
    });
  });

  it("refuses an unknown status, a bad id or a negative version", () => {
    refuses(designDtoSchema, designDto({ status: "SUBMITTED" }));
    refuses(designDtoSchema, designDto({ id: "d-1" }));
    refuses(designDtoSchema, designDto({ version: -1 }));
  });

  it("holds a name of 1–200 characters and a return reason of 1–2000 (docs 12 §3)", () => {
    expect(designDtoSchema.parse(designDto({ name: "a".repeat(200) })).name).toHaveLength(200);
    refuses(designDtoSchema, designDto({ name: "a".repeat(201) }));
    const returnOf = (reason: string) => ({ reason, returnedAt: "2026-11-03T09:00:00Z" });
    expect(
      designDtoSchema.parse(returnedDto({ lastReturn: returnOf("r".repeat(2000)) })).lastReturn
        ?.reason,
    ).toHaveLength(2000);
    refuses(designDtoSchema, returnedDto({ lastReturn: returnOf("r".repeat(2001)) }));
  });

  it("needs every nullable field present: null is allowed, absent is a contract break", () => {
    expect(designDtoSchema.parse(designDto({ projectId: null })).projectId).toBeNull();
    const { projectId: _projectId, ...withoutProject } = designDto();
    refuses(designDtoSchema, withoutProject);
    const { lastReturn: _lastReturn, ...withoutReturn } = designDto();
    refuses(designDtoSchema, withoutReturn);
  });

  it("parses a page and keeps its 0-based numbering for the API layer to shift", () => {
    const page = designPageDtoSchema.parse(pageDto([designDto()], { page: 2, hasPrevious: true }));
    expect(page.items).toHaveLength(1);
    expect(page.page).toBe(2);
  });

  it("parses the draft count", () => {
    expect(draftCountDtoSchema.parse({ drafts: 2, limit: 50 })).toEqual({ drafts: 2, limit: 50 });
    refuses(draftCountDtoSchema, { drafts: -1, limit: 50 });
  });
});

describe("history events (spec §3.3)", () => {
  it.each([
    "CREATED",
    "DERIVED_FROM_SNAPSHOT",
    "PREFLIGHT_FAILED",
    "SUBMITTED_FOR_REVIEW",
    "RETURNED",
    "APPROVED",
    "ARCHIVED",
  ])("parses %s", (type) => {
    expect(designEventDtoSchema.parse(eventDto({ type })).type).toBe(type);
  });

  it("refuses an event the docs do not list, and a missing note", () => {
    refuses(designEventDtoSchema, eventDto({ type: "TECHNICAL_ACCEPTED" }));
    const { note: _note, ...withoutNote } = eventDto();
    refuses(designEventDtoSchema, withoutNote);
  });
});

describe("document, images, files and links", () => {
  it("parses a stored document through the engine's document schema", () => {
    const record = designDocumentRecordDtoSchema.parse(documentRecordDto());
    expect(record).toMatchObject({ version: 3, document: { templateCode: "CUP12-BODY" } });
    refuses(designDocumentRecordDtoSchema, documentRecordDto({ document: { schemaVersion: 2 } }));
  });

  it("parses an image with its pixel size", () => {
    expect(designAssetDtoSchema.parse(assetDto)).toMatchObject({ widthPx: 1200, heightPx: 800 });
    refuses(designAssetDtoSchema, { ...assetDto, widthPx: 0 });
  });

  it("parses the three files of a submission and refuses any other role", () => {
    for (const role of ["CUSTOMER_PREVIEW", "PRINT_READY", "TECHNICAL_SPEC"]) {
      expect(designFileDtoSchema.parse(fileDto(role)).role).toBe(role);
    }
    refuses(designFileDtoSchema, fileDto("PRODUCTION_INSTRUCTION"));
  });

  it("parses a short-lived link", () => {
    expect(downloadLinkDtoSchema.parse(downloadDto).url).toContain("https://");
    refuses(downloadLinkDtoSchema, { expiresAt: downloadDto.expiresAt });
  });
});

describe("print configuration (spec §4.1 PrintConfigDto)", () => {
  it("parses the variant's template with the engine's schema and its file rules as MIME types", () => {
    const config = printConfigDtoSchema.parse(printConfigDto());
    expect(config).toMatchObject({ variantStatus: "ACTIVE", hasCartonSpec: true });
    expect(config.template.model.kind).toBe("parametric-cup");
    expect(config.fileRules).toEqual({
      minDpi: 300,
      formats: ["image/png", "image/jpeg"],
      maxFileSizeMb: 50,
    });
  });

  it("keeps the template's own checks: a cup whose print shape disagrees with its model fails", () => {
    const template = {
      ...cup12oz,
      printAreas: cup12oz.printAreas.map((area) => ({ ...area, shape: { type: "rect" } })),
    };
    refuses(printConfigDtoSchema, printConfigDto({ template }));
  });

  it("refuses a variant status outside ACTIVE / BLOCKED / OBSOLETE", () => {
    expect(printConfigDtoSchema.parse(printConfigDto({ variantStatus: "BLOCKED" }))).toBeTruthy();
    refuses(printConfigDtoSchema, printConfigDto({ variantStatus: "DRAFT" }));
  });

  describe("model3d (the .glb link): a bad one is dropped, never blocks the config", () => {
    const model3d = {
      url: "/models/cup.glb",
      surfaces: [{ printAreaCode: "BODY", meshName: "print:BODY" }],
    };
    const without = () => printConfigDtoSchema.parse(printConfigDto());
    const warn = vi.spyOn(console, "warn");

    beforeEach(() => warn.mockReset().mockImplementation(() => undefined));
    afterAll(() => warn.mockRestore());

    /** Parses with the bad link: it becomes null, one warning, the rest equals the payload without it. */
    const degrades = (bad: unknown) => {
      const config = printConfigDtoSchema.parse(printConfigDto({ model3d: bad }));
      expect(config.model3d).toBeNull();
      expect(config).toEqual(without());
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain("model3d");
    };

    it("is null when the key is missing, without a warning", () => {
      expect(without().model3d).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    });

    it("keeps an explicit null, without a warning", () => {
      expect(printConfigDtoSchema.parse(printConfigDto({ model3d: null })).model3d).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    });

    it("keeps a valid link, without a warning", () => {
      expect(printConfigDtoSchema.parse(printConfigDto({ model3d })).model3d).toEqual(model3d);
      expect(warn).not.toHaveBeenCalled();
    });

    it("drops a print area code that is not one of the template's", () => {
      degrades({ ...model3d, surfaces: [{ printAreaCode: "FRONT", meshName: "print:FRONT" }] });
    });

    it("drops a link that leaves a print area of the template unmapped", () => {
      const front = { ...cup12oz.printAreas[0], code: "FRONT", name: "Front" };
      const template = { ...cup12oz, printAreas: [...cup12oz.printAreas, front] };
      const config = printConfigDtoSchema.parse(printConfigDto({ template, model3d }));
      expect(config.model3d).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it("drops a repeated print area code", () => {
      degrades({ ...model3d, surfaces: [...model3d.surfaces, ...model3d.surfaces] });
    });

    it("drops an empty mesh name", () => {
      degrades({ ...model3d, surfaces: [{ printAreaCode: "BODY", meshName: "" }] });
    });

    it("drops a mesh name other than print: plus the print area code", () => {
      degrades({ ...model3d, surfaces: [{ printAreaCode: "BODY", meshName: "body" }] });
    });

    it("drops a link of the wrong shape", () => {
      degrades({ url: "", surfaces: [] });
      warn.mockClear();
      degrades("cup.glb");
    });

    it("still throws for an error anywhere else, with or without a model3d", () => {
      refuses(printConfigDtoSchema, printConfigDto({ variantStatus: "DRAFT", model3d }));
      refuses(printConfigDtoSchema, printConfigDto({ variantStatus: "DRAFT", model3d: 7 }));
    });
  });
});

describe("preflight issues (the details of 422 PREFLIGHT_FAILED)", () => {
  it("parses an element issue and a document issue", () => {
    expect(
      preflightIssueSchema.parse({
        ruleId: "ASSET_INVALID",
        level: "fail",
        message: "Ảnh không hợp lệ hoặc không tải được.",
        surfaceCode: "BODY",
        elementId: "el-1",
      }),
    ).toMatchObject({ surfaceCode: "BODY", elementId: "el-1" });
    expect(
      preflightIssueSchema.parse({ ruleId: "EMPTY_DESIGN", level: "fail", message: "Trống" }),
    ).toEqual({ ruleId: "EMPTY_DESIGN", level: "fail", message: "Trống" });
  });

  it("refuses an unknown rule or level", () => {
    refuses(preflightIssueSchema, { ruleId: "DPI_LOW", level: "fail", message: "x" });
    refuses(preflightIssueSchema, { ruleId: "EMPTY_DESIGN", level: "warning", message: "x" });
  });
});

describe("inputs", () => {
  // docs 12 §3: a name of 1–200 characters.
  it("trims the name and takes 1–200 characters", () => {
    expect(renameDesignInputSchema.parse({ name: "  a  " }).name).toBe("a");
    expect(renameDesignInputSchema.parse({ name: "x".repeat(200) }).name).toHaveLength(200);
    refuses(renameDesignInputSchema, { name: "" });
    refuses(renameDesignInputSchema, { name: "   " });
    refuses(renameDesignInputSchema, { name: "x".repeat(201) });
  });

  it("says why a name is refused, in Vietnamese", () => {
    const message = (name: string) =>
      renameDesignInputSchema.safeParse({ name }).error?.issues[0]?.message;
    expect(message("")).toBe("Hãy đặt tên cho thiết kế");
    expect(message("x".repeat(201))).toBe("Tên tối đa 200 ký tự");
  });

  it("creates from a product slug, a SKU and a name", () => {
    const input = { productSlug: "ly-giay-2-lop-12oz", sku: "CUP-PAPER-12OZ-WHT", name: "  a  " };
    expect(createDesignInputSchema.parse(input)).toEqual({ ...input, name: "a" });
    refuses(createDesignInputSchema, { ...input, productSlug: "" });
    refuses(createDesignInputSchema, { ...input, sku: " " });
    refuses(createDesignInputSchema, { ...input, name: "x".repeat(201) });
  });

  // docs 12 BR-06: a return needs a reason of 1–2,000 characters.
  it("takes a return reason of 1–2000 characters", () => {
    expect(returnReasonInputSchema.parse({ reason: "x".repeat(2000) }).reason).toHaveLength(2000);
    expect(returnReasonInputSchema.parse({ reason: "  Đổi logo " }).reason).toBe("Đổi logo");
    const message = (reason: string) =>
      returnReasonInputSchema.safeParse({ reason }).error?.issues[0]?.message;
    expect(message("  ")).toBe("Hãy nhập lý do");
    expect(message("x".repeat(2001))).toBe("Lý do tối đa 2000 ký tự");
  });
});
