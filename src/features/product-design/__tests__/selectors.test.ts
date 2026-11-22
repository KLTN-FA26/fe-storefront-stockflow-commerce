import { describe, expect, it } from "vitest";

import { formatDateTime } from "@/lib/format";

import { designEventSchema, printConfigSchema } from "../schemas";
import {
  defaultDesignName,
  designCardView,
  eventView,
  isPrintConfigUsable,
  templateOf,
} from "../selectors";
import { approvedDto, design, eventDto, printConfigDto, returnedDto } from "./fixtures";

const event = (overrides: Record<string, unknown>) => designEventSchema.parse(eventDto(overrides));

describe("designCardView", () => {
  it("shows the name, product · variant, last save, status and preview", () => {
    expect(designCardView(design())).toEqual({
      title: "Ly giấy logo quán",
      subtitle: "Ly giấy 2 lớp 12oz · CUP-PAPER-12OZ-WHT",
      updatedLabel: formatDateTime("2026-11-02T08:00:00Z"),
      status: "DRAFT",
      returnReason: null,
      previewUrl: null,
    });
    expect(designCardView(design(approvedDto())).previewUrl).toBe("/logo.png");
  });

  it("gives the return reason only for a returned draft", () => {
    expect(designCardView(design(returnedDto())).returnReason).toBe(
      "Logo bị mờ, hãy dùng ảnh rõ hơn",
    );
    expect(designCardView(design()).returnReason).toBeNull();
    expect(designCardView(design(returnedDto({ status: "PENDING_REVIEW" }))).returnReason).toBe(
      null,
    );
  });

  it("does not throw on a timestamp it cannot read", () => {
    expect(designCardView(design({ updatedAt: "not a date" })).updatedLabel).toBeNull();
  });
});

describe("defaultDesignName (spec §6.2)", () => {
  it("is '{product title} · {variant label}'", () => {
    expect(defaultDesignName("Ly giấy 2 lớp 12oz", "CUP-PAPER-12OZ-WHT")).toBe(
      "Ly giấy 2 lớp 12oz · CUP-PAPER-12OZ-WHT",
    );
  });

  it("cuts a long product title so the name is 200 characters and keeps the variant label", () => {
    const name = defaultDesignName("x".repeat(250), "CUP-PAPER-12OZ-WHT");
    expect(name).toHaveLength(200);
    expect(name.endsWith(" · CUP-PAPER-12OZ-WHT")).toBe(true);
  });

  it("never exceeds 200 characters, even for a label that long", () => {
    expect(defaultDesignName("Ly", "y".repeat(250)).length).toBeLessThanOrEqual(200);
  });
});

describe("eventView (spec §3.3)", () => {
  const element = "3f2a9c1e-7b4d-4e0a-9c55-0d1f2a3b4c5d";

  it("words the BE's failed checks: no rule code and no element id reaches the customer", () => {
    const note = `OUTSIDE_PRINT_AREA FRONT/${element}; EMPTY_DESIGN; DPI_BELOW_MIN FRONT/${element}`;
    const view = eventView(event({ type: "PREFLIGHT_FAILED", note }));
    expect(view.note).toBe(
      [
        "Phần tử nằm ngoài vùng in và sẽ bị cắt mất.",
        "Thiết kế chưa có nội dung.",
        "Ảnh có độ phân giải thấp hơn mức tối thiểu của quy cách này.",
      ].join("\n"),
    );
    expect(view.note).not.toMatch(/OUTSIDE_PRINT_AREA|DPI_BELOW_MIN|FRONT|3f2a9c1e/);
  });

  it("words the studio's own ON_SEAM, which the browser recorded, as the studio does", () => {
    const view = eventView(event({ type: "PREFLIGHT_FAILED", note: `ON_SEAM BODY/${element}` }));
    expect(view.note).toBe("Phần tử nằm trên mép dán của ly và sẽ bị che.");
    const mixed = eventView(
      event({ type: "PREFLIGHT_FAILED", note: `ON_SEAM BODY/${element}; EMPTY_DESIGN` }),
    );
    expect(mixed.note).toBe(
      "Phần tử nằm trên mép dán của ly và sẽ bị che.\nThiết kế chưa có nội dung.",
    );
    // The studio's notes are never reported; one in a note is not worded.
    expect(eventView(event({ type: "PREFLIGHT_FAILED", note: "TOO_THIN" })).note).toBe(
      "Bản thiết kế chưa đạt kiểm tra tự động.",
    );
  });

  it("words the mock's comma-joined note the same way, and a rule it lacks reads as a generic line", () => {
    expect(
      eventView(event({ type: "PREFLIGHT_FAILED", note: "EMPTY_DESIGN, CARTON_SPEC_MISSING" }))
        .note,
    ).toBe(
      "Thiết kế chưa có nội dung.\nSản phẩm này chưa có quy cách đóng thùng nên chưa gửi duyệt được.",
    );
    for (const note of ["BLEED_MISSING FRONT/" + element, "Something went wrong", element]) {
      const shown = eventView(event({ type: "PREFLIGHT_FAILED", note })).note;
      expect(shown).toBe("Bản thiết kế chưa đạt kiểm tra tự động.");
    }
    expect(eventView(event({ type: "PREFLIGHT_FAILED", note: "  " })).note).toBeNull();
  });

  it.each([
    ["CREATED", "Tạo thiết kế"],
    ["DERIVED_FROM_SNAPSHOT", "Tạo bản sửa từ thiết kế đã duyệt"],
    ["PREFLIGHT_FAILED", "Chưa đạt kiểm tra tự động"],
    ["SUBMITTED_FOR_REVIEW", "Gửi duyệt"],
    ["RETURNED", "Bị trả lại"],
    ["APPROVED", "Đã duyệt"],
    ["ARCHIVED", "Xoá bản nháp"],
  ])("labels %s as %s, with its time", (type, label) => {
    expect(eventView(event({ type }))).toMatchObject({
      label,
      atLabel: formatDateTime("2026-11-01T08:00:00Z"),
    });
  });

  it("shows the customer the return reason and the failed checks, not the internal notes", () => {
    expect(eventView(event({ type: "RETURNED", note: " Logo bị mờ " })).note).toBe("Logo bị mờ");
    const approval = "SKU X-KH0010-001 · snapshot s · checksum c";
    expect(eventView(event({ type: "APPROVED", note: approval })).note).toBeNull();
    expect(eventView(event({ type: "DERIVED_FROM_SNAPSHOT", note: "snap" })).note).toBeNull();
    expect(eventView(event({ type: "RETURNED", note: "  " })).note).toBeNull();
  });
});

const printConfig = (overrides: Record<string, unknown> = {}) =>
  printConfigSchema.parse(printConfigDto(overrides));

describe("templateOf", () => {
  it("takes the file limits from fileRules, not from the template (ruling R20)", () => {
    const config = printConfig({
      template: {
        ...printConfigDto().template,
        minDpi: 150,
        allowedFileFormats: ["image/png", "image/jpeg", "image/webp"],
        maxFileSizeMb: 100,
      },
      fileRules: { minDpi: 240, formats: ["image/png"], maxFileSizeMb: 20 },
    });

    expect(templateOf(config)).toMatchObject({
      minDpi: 240,
      allowedFileFormats: ["image/png"],
      maxFileSizeMb: 20,
    });
  });

  it("keeps the rest of the template as it is, and leaves the print configuration untouched", () => {
    const config = printConfig();
    const template = templateOf(config);

    expect(template).toEqual({
      ...config.template,
      minDpi: 300,
      allowedFileFormats: ["image/png", "image/jpeg"],
      maxFileSizeMb: 50,
    });
    expect(template.allowedFileFormats).not.toBe(config.fileRules.formats);
    expect(config.template.minDpi).toBe(printConfigDto().template.minDpi);
  });
});

describe("isPrintConfigUsable", () => {
  it.each(["APPROVED", "PUBLISHED"])("takes designs for an ACTIVE variant of a %s product", (s) => {
    expect(
      isPrintConfigUsable(printConfig({ product: { ...printConfigDto().product, status: s } })),
    ).toBe(true);
  });

  it.each(["DRAFT", "ARCHIVED", "published"])("refuses a product that is %s", (status) => {
    const product = { ...printConfigDto().product, status };
    expect(isPrintConfigUsable(printConfig({ product }))).toBe(false);
  });

  it.each(["BLOCKED", "OBSOLETE"])("refuses a %s variant", (variantStatus) => {
    expect(isPrintConfigUsable(printConfig({ variantStatus }))).toBe(false);
  });
});
