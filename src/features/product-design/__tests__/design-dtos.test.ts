import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import {
  createDesign,
  deleteDesign,
  getDesign,
  getDesignHistory,
  getDraftCount,
  listDesigns,
  renameDesign,
} from "../api";
import {
  designArtifactDtoSchema,
  designDecisionDtoSchema,
  designDraftDtoSchema,
  designDraftPageDtoSchema,
} from "../design-dtos";
import { toDesign, toDesignEvent, toDesignFiles } from "../design-mappers";
import { customizationDtoSchema } from "../print-config-dtos";
import { describeDesignError } from "../errors";
import {
  approvedDraftDto,
  artifactDto,
  decisionDto,
  designDraftDto,
  ids,
  pageDto,
  returnedDraftDto,
} from "./fixtures";
import { projectDto } from "./project-fixtures";

// The BE's design API as it really answers (`DesignDraftResponse`, `DesignDecisionResponse`): every
// null left out, its own field names. The mapping to the screens' `Design` is what is checked here;
// the mock serving the same shapes through the real client is in `lib/api/mock-design.test.ts`.

afterEach(() => vi.restoreAllMocks());

const project = { id: ids.project, name: "Bộ ly", status: "ACTIVE" } as const;

describe("a design as the BE sends it", () => {
  it("parses a draft that carries only what the BE sends, with every null omitted", () => {
    const dto = designDraftDtoSchema.parse(
      designDraftDto({ productName: undefined, variantName: undefined, templateCode: undefined }),
    );
    expect(toDesign(dto, null)).toEqual({
      id: ids.design,
      name: "Ly giấy logo quán",
      status: "DRAFT",
      // No product name or variant name: the slug and the SKU stand in (F-7).
      product: { id: null, slug: "ly-giay-2-lop-12oz", title: "ly-giay-2-lop-12oz" },
      variant: { sku: "CUP-PAPER-12OZ-WHT", label: "CUP-PAPER-12OZ-WHT" },
      version: 3,
      projectId: null,
      customerSku: null,
      project: null,
      sourceSnapshotId: null,
      lastReturn: null,
      previewUrl: null,
      updatedAt: "2026-11-02T08:00:00Z",
      submittedAt: null,
      approvedAt: null,
    });
  });

  it("names the product and the variant from productName and variantName (F-7)", () => {
    const design = toDesign(designDraftDtoSchema.parse(designDraftDto()), null);
    expect(design.product).toEqual({
      id: null,
      slug: "ly-giay-2-lop-12oz",
      title: "Ly giấy 2 lớp 12oz",
    });
    expect(design.variant).toEqual({ sku: "CUP-PAPER-12OZ-WHT", label: "Trắng 12oz" });
  });

  it("keeps the carton spec when the BE sends it (SF-UX-9), and leaves it out otherwise", () => {
    const withSpec = toDesign(
      designDraftDtoSchema.parse(designDraftDto({ unitsPerCarton: 1000 })),
      null,
    );
    expect(withSpec.unitsPerCarton).toBe(1000);
    const without = toDesign(designDraftDtoSchema.parse(designDraftDto()), null);
    expect(without).not.toHaveProperty("unitsPerCarton");
  });

  it("keeps the product id the BE sends, which a chat about the product names", () => {
    const productId = "9a1c0000-0000-4000-8000-0000000000b1";
    const design = toDesign(designDraftDtoSchema.parse(designDraftDto({ productId })), null);
    expect(design.product.id).toBe(productId);
  });

  it("renames the fields: parentSnapshotId, reviewRequestedAt (F-4)", () => {
    const dto = designDraftDtoSchema.parse(
      designDraftDto({
        status: "PENDING_REVIEW",
        parentSnapshotId: ids.snapshot,
        reviewRequestedAt: "2026-11-04T08:00:00Z",
      }),
    );
    expect(toDesign(dto, null)).toMatchObject({
      sourceSnapshotId: ids.snapshot,
      submittedAt: "2026-11-04T08:00:00Z",
      approvedAt: null,
    });
  });

  it("derives lastReturn from reviewNotes and reviewedAt on a DRAFT (F-5)", () => {
    const returned = toDesign(designDraftDtoSchema.parse(returnedDraftDto()), null);
    expect(returned.lastReturn).toEqual({
      reason: "Logo bị mờ, hãy dùng ảnh rõ hơn",
      returnedAt: "2026-11-03T09:00:00Z",
    });
    // A draft nobody returned has no notes: no return. Notes of a design not in DRAFT are not a return.
    expect(toDesign(designDraftDtoSchema.parse(designDraftDto()), null).lastReturn).toBeNull();
    const pending = returnedDraftDto({ status: "PENDING_REVIEW" });
    expect(toDesign(designDraftDtoSchema.parse(pending), null).lastReturn).toBeNull();
    // Without a review time the last change stands in for it.
    const noTime = returnedDraftDto({ reviewedAt: undefined });
    expect(toDesign(designDraftDtoSchema.parse(noTime), null).lastReturn?.returnedAt).toBe(
      "2026-11-02T08:00:00Z",
    );
  });

  it("reads reviewedAt as approvedAt once APPROVED, and not before (F-4)", () => {
    const approved = toDesign(designDraftDtoSchema.parse(approvedDraftDto()), null);
    expect(approved).toMatchObject({
      status: "APPROVED",
      approvedAt: "2026-11-05T08:00:00Z",
      submittedAt: "2026-11-04T08:00:00Z",
      previewUrl: "/logo.png",
      lastReturn: null,
    });
    const returned = toDesign(designDraftDtoSchema.parse(returnedDraftDto()), null);
    expect(returned.approvedAt).toBeNull();
  });

  it("carries the project it is given, and its id", () => {
    const dto = designDraftDtoSchema.parse(designDraftDto({ projectId: ids.project }));
    expect(toDesign(dto, project)).toMatchObject({ projectId: ids.project, project });
  });

  it("refuses what the BE never sends: an unknown status, no SKU, a bad id", () => {
    const refuses = (value: unknown) => expect(() => designDraftDtoSchema.parse(value)).toThrow();
    refuses(designDraftDto({ status: "SUBMITTED" }));
    refuses(designDraftDto({ sku: undefined }));
    refuses(designDraftDto({ id: "d-1" }));
    refuses(designDraftDto({ version: -1 }));
  });

  it("keeps a design whose product is gone (no productSlug) and the rest of its page, with no product link", () => {
    const page = designDraftPageDtoSchema.parse(
      pageDto([designDraftDto({ id: ids.design }), designDraftDto({ productSlug: undefined })]),
    );
    expect(page.items).toHaveLength(2);
    expect(toDesign(page.items[1]!, null).product).toEqual({
      id: null,
      slug: null,
      title: "Ly giấy 2 lớp 12oz", // productName, kept once the product is gone
    });
    expect(toDesign(page.items[0]!, null).product.slug).toEqual(expect.any(String));
  });

  it("parses a page whose items carry no null, 0-based", () => {
    const page = designDraftPageDtoSchema.parse(
      pageDto([designDraftDto()], { page: 2, hasPrevious: true }),
    );
    expect(page).toMatchObject({ page: 2, items: [{ id: ids.design }] });
  });
});

describe("the history as the BE sends it", () => {
  it("takes any decision as a string and maps the unknown ones to OTHER, keeping the row", () => {
    for (const decision of ["QUOTE_REQUESTED", "SENT_TO_CUSTOMER", "CUSTOMER_CONFIRMED"]) {
      expect(designDecisionDtoSchema.parse(decisionDto({ decision })).decision).toBe(decision);
    }
    expect(
      toDesignEvent(designDecisionDtoSchema.parse(decisionDto({ decision: "RETURNED" }))),
    ).toEqual({ type: "RETURNED", at: "2026-11-01T08:00:00Z", version: 0, note: null });
    expect(
      toDesignEvent(designDecisionDtoSchema.parse(decisionDto({ decision: "QUOTE_REQUESTED" })))
        .type,
    ).toBe("QUOTE_REQUESTED");
    const legacy = toDesignEvent(
      designDecisionDtoSchema.parse(decisionDto({ decision: "SENT_TO_CUSTOMER", notes: "x" })),
    );
    expect(legacy).toMatchObject({ type: "OTHER", note: "x" });
  });

  it("an unknown decision does not fail the whole list", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({
      data: pageDto([
        decisionDto({ decision: "SENT_TO_CUSTOMER", version: 2 }),
        decisionDto({ decision: "SUBMITTED_FOR_REVIEW", version: 1 }),
        decisionDto({ decision: "CREATED" }),
      ]),
    });
    const events = await getDesignHistory(ids.design);
    expect(events.map((event) => event.type)).toEqual(["CREATED", "SUBMITTED_FOR_REVIEW", "OTHER"]);
  });

  it("reads every page (200 a page, newest first) and presents the events oldest first (F-15)", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({
        data: pageDto([decisionDto({ decision: "RETURNED", version: 3 })], {
          page: 0,
          hasNext: true,
          totalPages: 2,
          totalElements: 2,
        }),
      })
      .mockResolvedValueOnce({
        data: pageDto([decisionDto({ decision: "CREATED" })], {
          page: 1,
          hasPrevious: true,
          totalPages: 2,
          totalElements: 2,
        }),
      });

    const events = await getDesignHistory(ids.design);

    expect(events.map((event) => event.type)).toEqual(["CREATED", "RETURNED"]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.map(([, config]) => config?.params)).toEqual([
      { page: 0, size: 200 },
      { page: 1, size: 200 },
    ]);
  });
});

describe("the draft count", () => {
  it("is totalElements of a one-row page of DRAFTs, against the limit of 50 (F-11)", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({
      data: pageDto([designDraftDto()], { size: 1, totalElements: 37, totalPages: 37 }),
    });
    expect(await getDraftCount()).toEqual({ drafts: 37, limit: 50 });
    expect(get).toHaveBeenCalledWith("/designs", { params: { status: "DRAFT", page: 0, size: 1 } });
  });
});

describe("the project of a design (F-8)", () => {
  it("asks for nothing when no design is in a project", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: pageDto([designDraftDto()]) });
    const page = await listDesigns({ page: 1, size: 12 });
    expect(page.items[0]?.project).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("reads the one project of a design by its id", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({ data: designDraftDto({ projectId: ids.project }) })
      .mockResolvedValueOnce({ data: projectDto({ id: ids.project, name: "Bộ ly" }) });
    const design = await getDesign(ids.design);
    expect(design.project).toEqual(project);
    expect(get).toHaveBeenLastCalledWith(`/design-projects/${ids.project}`, {});
  });

  it("reads the projects of a list in one read of the project list", async () => {
    const other = "7c1f0a00-0000-4000-8000-0000000000aa";
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({
        data: pageDto([
          designDraftDto({ projectId: ids.project }),
          designDraftDto({ id: ids.revision, projectId: other }),
          designDraftDto({ id: ids.asset }),
        ]),
      })
      .mockResolvedValueOnce({
        data: pageDto([
          projectDto({ id: ids.project, name: "Bộ ly" }),
          projectDto({ id: other, name: "Bộ túi", status: "ARCHIVED" }),
        ]),
      });

    const page = await listDesigns({ page: 1, size: 12 });

    expect(page.items.map((design) => design.project?.name ?? null)).toEqual([
      "Bộ ly",
      "Bộ túi",
      null,
    ]);
    expect(page.items[1]?.project?.status).toBe("ARCHIVED");
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenLastCalledWith("/design-projects", { params: { page: 0, size: 200 } });
  });

  it("still loads the design, without its project, when the project cannot be read, and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(api, "get")
      .mockResolvedValueOnce({ data: designDraftDto({ projectId: ids.project }) })
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "x"));

    const design = await getDesign(ids.design);

    expect(design).toMatchObject({ id: ids.design, projectId: ids.project, project: null });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("project"), expect.any(ApiError));
  });

  it("does the same for a list: every design loads, none with a project", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(api, "get")
      .mockResolvedValueOnce({
        data: pageDto([
          designDraftDto({ projectId: ids.project }),
          designDraftDto({ id: ids.asset }),
        ]),
      })
      .mockRejectedValue(new ApiError(503, "UNAVAILABLE", "x"));

    const page = await listDesigns({ page: 1, size: 12 });

    expect(page.items.map((design) => design.project)).toEqual([null, null]);
  });

  it("reads a project the list did not name by its own id", async () => {
    const other = "7c1f0a00-0000-4000-8000-0000000000aa";
    const get = vi
      .spyOn(api, "get")
      .mockResolvedValueOnce({
        data: pageDto([
          designDraftDto({ projectId: ids.project }),
          designDraftDto({ id: ids.revision, projectId: other }),
        ]),
      })
      .mockResolvedValueOnce({ data: pageDto([projectDto({ id: ids.project })]) })
      .mockResolvedValueOnce({ data: projectDto({ id: other, name: "Bộ cũ" }) });

    const page = await listDesigns({ page: 1, size: 12 });

    expect(page.items[1]?.project?.name).toBe("Bộ cũ");
    expect(get).toHaveBeenLastCalledWith(`/design-projects/${other}`, {});
  });
});

describe("writes", () => {
  it("renames with PUT /name {version, name} and archives with POST /archive {version}", async () => {
    const put = vi
      .spyOn(api, "put")
      .mockResolvedValueOnce({ data: designDraftDto({ name: "Mới" }) });
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: designDraftDto({ status: "ARCHIVED", version: 4 }) });

    expect((await renameDesign(ids.design, { name: " Mới ", version: 3 })).name).toBe("Mới");
    expect(put).toHaveBeenCalledWith(`/designs/${ids.design}/name`, { version: 3, name: "Mới" });
    expect((await deleteDesign(ids.design, { version: 3 })).status).toBe("ARCHIVED");
    expect(post).toHaveBeenCalledWith(`/designs/${ids.design}/archive`, { version: 3 });
  });

  it("starts a design with the product's id and the template's code read from its customization (F-12)", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({
      data: {
        productId: ids.project,
        kind: "CUSTOMIZABLE",
        // Only what is needed is read: the rest of a template is the print configuration's (SF2).
        templates: [
          { templateId: ids.asset, code: "BAG-4F", sku: "BAG-KRAFT-M", minDpi: 300 },
          { templateId: ids.snapshot, code: "CUP12-BODY", sku: "CUP-PAPER-12OZ-WHT" },
        ],
      },
    });
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: designDraftDto() });

    await createDesign({ productSlug: "ly", sku: "CUP-PAPER-12OZ-WHT", name: "Ly" });

    expect(post).toHaveBeenCalledWith("/designs/mine", {
      productId: ids.project,
      sku: "CUP-PAPER-12OZ-WHT",
      templateCode: "CUP12-BODY",
      name: "Ly",
    });
    expect(
      customizationDtoSchema.parse({ productId: ids.project, templates: [] }).templates,
    ).toEqual([]);
  });

  it("answers a SKU the customization does not list with 404 PRINT_CONFIG_NOT_FOUND, and sends nothing", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({
      data: { productId: ids.project, templates: [{ code: "BAG-4F", sku: "BAG-KRAFT-M" }] },
    });
    const post = vi.spyOn(api, "post");

    const error = await createDesign({ productSlug: "ly", sku: "CUP-X", name: "Ly" }).catch(
      (err: unknown) => err,
    );

    expect(error).toMatchObject({ status: 404, code: "PRINT_CONFIG_NOT_FOUND" });
    expect(post).not.toHaveBeenCalled();
  });

  it("breaks the contract loudly: an answer without a SKU is a ZodError, never half a design", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: designDraftDto({ sku: undefined }) });
    await expect(getDesign(ids.design)).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe("the BE's error codes, as the customer reads them (F-2)", () => {
  const read = (status: number, code: string) =>
    describeDesignError(new ApiError(status, code, "dev text"));

  it.each([
    [409, "CONFLICT", "Thiết kế đã thay đổi, hãy tải lại."],
    [409, "DESIGN_NOT_DRAFT", "Thiết kế đã chuyển trạng thái, hãy tải lại."],
    [
      409,
      "DESIGN_DRAFT_LIMIT_REACHED",
      "Bạn đã có 50 bản nháp. Hãy xoá bớt trước khi tạo bản mới.",
    ],
    [404, "PRINT_CONFIG_NOT_FOUND", "Quy cách này chưa nhận thiết kế."],
    [409, "PRODUCT_NOT_CUSTOMIZABLE", "Sản phẩm này hiện không nhận thiết kế."],
    [409, "CUSTOMER_NOT_ACTIVE", "Tài khoản của bạn hiện chưa thể bắt đầu thiết kế mới."],
    [400, "VALIDATION_FAILED", "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại."],
    [400, "UNSUPPORTED_PARAMETER", "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại."],
  ])("%i %s", (status, code, message) => {
    expect(read(status, code)).toBe(message);
  });
});

describe("the files of a design (F-21)", () => {
  const parse = (...rows: Array<ReturnType<typeof artifactDto>>) =>
    toDesignFiles(rows.map((row) => designArtifactDtoSchema.parse(row)));

  it("keeps the newest file of each role, in the role order, whatever order the BE lists them", () => {
    const files = parse(
      // The BE lists every upload, newest first.
      artifactDto("TECHNICAL_SPEC", { artifactId: "7c1f0a00-0000-4000-8000-0000000000a1" }),
      artifactDto("PRINT_READY", {
        artifactId: "7c1f0a00-0000-4000-8000-0000000000a2",
        originalName: "new.pdf",
      }),
      artifactDto("PRINT_READY", {
        artifactId: "7c1f0a00-0000-4000-8000-0000000000a3",
        originalName: "old.pdf",
      }),
      artifactDto("CUSTOMER_PREVIEW", { artifactId: "7c1f0a00-0000-4000-8000-0000000000a4" }),
    );
    expect(files.map((f) => [f.role, f.name])).toEqual([
      ["CUSTOMER_PREVIEW", "customer_preview.bin"],
      ["PRINT_READY", "new.pdf"],
      ["TECHNICAL_SPEC", "technical_spec.bin"],
    ]);
    expect(files[1]).toEqual({
      artifactId: "7c1f0a00-0000-4000-8000-0000000000a2",
      role: "PRINT_READY",
      name: "new.pdf",
      sizeBytes: 2048,
      sha256: "f".repeat(64),
    });
  });

  it("accepts the production instruction made at approval, and leaves out a role it does not know", () => {
    const files = parse(
      artifactDto("PRODUCTION_INSTRUCTION"),
      artifactDto("PRINT_READY"),
      artifactDto("A_FUTURE_ROLE"),
    );
    expect(files.map((f) => f.role)).toEqual(["PRINT_READY", "PRODUCTION_INSTRUCTION"]);
  });

  it("carries no link: it is asked for when the customer asks", () => {
    expect(Object.keys(parse(artifactDto("PRINT_READY"))[0]!)).not.toContain("url");
  });
});
