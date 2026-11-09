import { describe, expect, it } from "vitest";

import { formatDateTime } from "@/lib/format";

import { designEventDtoSchema } from "../schemas";
import { defaultDesignName, designCardView, eventView } from "../selectors";
import { approvedDto, design, eventDto, returnedDto } from "./fixtures";

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
