import { describe, expect, it } from "vitest";

import { formatDateTime } from "@/lib/format";

import { designEventDtoSchema, printConfigDtoSchema } from "../schemas";
import {
  defaultDesignName,
  designCardView,
  eventView,
  isPrintConfigUsable,
  templateOf,
} from "../selectors";
import { approvedDto, design, eventDto, printConfigDto, returnedDto } from "./fixtures";

const event = (overrides: Record<string, unknown>) =>
  designEventDtoSchema.parse(eventDto(overrides));

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
    expect(eventView(event({ type: "PREFLIGHT_FAILED", note: "Thiết kế trống" })).note).toBe(
      "Thiết kế trống",
    );
    const approval = "SKU X-KH0010-001 · snapshot s · checksum c";
    expect(eventView(event({ type: "APPROVED", note: approval })).note).toBeNull();
    expect(eventView(event({ type: "DERIVED_FROM_SNAPSHOT", note: "snap" })).note).toBeNull();
    expect(eventView(event({ type: "RETURNED", note: "  " })).note).toBeNull();
  });
});

const printConfig = (overrides: Record<string, unknown> = {}) =>
  printConfigDtoSchema.parse(printConfigDto(overrides));

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
