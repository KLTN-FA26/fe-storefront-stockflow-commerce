import { describe, expect, it } from "vitest";

import { toPreflightIssues } from "../design-mappers";
import {
  BE_PREFLIGHT_RULES,
  describePreflightRule,
  engineRuleOf,
  wordedPreflightRules,
} from "../preflight-messages";

// The BE's rules (`LayoutPreflight`, `DesignSubmissionService`) as the customer reads them.

/**
 * The BE's whole rule list, copied by hand from its code at origin/develop d47ed4ae (contract §8
 * calls it complete): `LayoutPreflight.check` (EMPTY_DESIGN, ASSET_INVALID, DPI_BELOW_MIN,
 * FONT_NOT_ALLOWED, ELEMENT_INVALID, OUTSIDE_PRINT_AREA, CROSSES_SAFE_AREA) and
 * `DesignSubmissionService` (VARIANT_UNAVAILABLE, CARTON_SPEC_MISSING, PRINT_FILE_INVALID). A rule
 * the BE adds or renames must be added here, and this test then names the one the table lacks.
 */
const BE_RULES_D47ED4AE = [
  "ASSET_INVALID",
  "CARTON_SPEC_MISSING",
  "CROSSES_SAFE_AREA",
  "DPI_BELOW_MIN",
  "ELEMENT_INVALID",
  "EMPTY_DESIGN",
  "FONT_NOT_ALLOWED",
  "OUTSIDE_PRINT_AREA",
  "PRINT_FILE_INVALID",
  "VARIANT_UNAVAILABLE",
];

describe("the BE's rule list", () => {
  it("is exactly the rules the table words: none missing, none the BE does not have", () => {
    expect(BE_PREFLIGHT_RULES.toSorted()).toEqual(BE_RULES_D47ED4AE);
    expect(wordedPreflightRules().toSorted()).toEqual(BE_RULES_D47ED4AE);
  });

  it("words each of them in Vietnamese, never with the generic sentence or a code", () => {
    for (const rule of BE_RULES_D47ED4AE) {
      const sentence = describePreflightRule({ rule });
      expect(sentence).not.toContain("mã:");
      expect(sentence).not.toContain(rule);
    }
  });
});

describe("a Vietnamese sentence per BE rule", () => {
  it.each([
    ["EMPTY_DESIGN", "Thiết kế chưa có nội dung."],
    ["OUTSIDE_PRINT_AREA", "Phần tử nằm ngoài vùng in và sẽ bị cắt mất."],
    ["CROSSES_SAFE_AREA", "Phần tử vượt vùng an toàn, có thể bị xén khi cắt."],
    ["ASSET_INVALID", "Ảnh không hợp lệ hoặc không tải được."],
    ["FONT_NOT_ALLOWED", "Phông chữ này không được phép in."],
    [
      "ELEMENT_INVALID",
      "Có phần tử trong thiết kế không đọc được. Hãy xoá phần tử đó và thêm lại.",
    ],
    ["VARIANT_UNAVAILABLE", "Quy cách này hiện không còn nhận thiết kế."],
    ["CARTON_SPEC_MISSING", "Sản phẩm này chưa có quy cách đóng thùng nên chưa gửi duyệt được."],
  ])("%s", (rule, sentence) => {
    expect(describePreflightRule({ rule })).toBe(sentence);
  });

  it("says the DPI the image reaches when the BE gives the numbers, a plain sentence when it does not", () => {
    expect(
      describePreflightRule({ rule: "DPI_BELOW_MIN", values: { dpi: 150, minDpi: 300 } }),
    ).toBe("Ảnh chỉ đạt 150 DPI, thấp hơn mức tối thiểu 300 DPI.");
    expect(describePreflightRule({ rule: "DPI_BELOW_MIN" })).toContain("độ phân giải");
  });

  it("explains a print file that is not the template's, and what to do", () => {
    const sentence = describePreflightRule({ rule: "PRINT_FILE_INVALID" });
    expect(sentence).toContain("PDF");
    expect(sentence).toContain("thử gửi lại");
  });

  it("gives a rule it does not know a generic sentence, without the raw code (SF-UX-12)", () => {
    const sentence = describePreflightRule({ rule: "BLEED_MISSING" });
    expect(sentence).toBe("Thiết kế chưa đạt một kiểm tra tự động.");
    expect(sentence).not.toContain("BLEED_MISSING");
  });

  it("names the carton spec as the studio does (F-3), both ways", () => {
    expect(engineRuleOf("CARTON_SPEC_MISSING")).toBe("NO_CARTON_SPEC");
    expect(engineRuleOf("EMPTY_DESIGN")).toBe("EMPTY_DESIGN");
  });
});

describe("the BE's findings as the studio's issue list", () => {
  it("makes every finding block, locates it, and never carries the BE's English", () => {
    const issues = toPreflightIssues([
      {
        rule: "DPI_BELOW_MIN",
        surfaceCode: "BODY",
        elementId: "el-1",
        message: "The image reaches only 90 DPI",
        values: { dpi: 90, minDpi: 300 },
      },
      { rule: "CARTON_SPEC_MISSING", message: "The variant has no carton specification yet" },
      { rule: "ASSET_INVALID", surfaceCode: "NOT_A_FACE", message: "English" },
    ]);

    expect(issues).toEqual([
      {
        ruleId: "DPI_BELOW_MIN",
        level: "fail",
        message: "Ảnh chỉ đạt 90 DPI, thấp hơn mức tối thiểu 300 DPI.",
        surfaceCode: "BODY",
        elementId: "el-1",
      },
      {
        ruleId: "NO_CARTON_SPEC",
        level: "fail",
        message: "Sản phẩm này chưa có quy cách đóng thùng nên chưa gửi duyệt được.",
      },
      // A face this build does not know is left out, the finding stays.
      { ruleId: "ASSET_INVALID", level: "fail", message: "Ảnh không hợp lệ hoặc không tải được." },
    ]);
    expect(JSON.stringify(issues)).not.toMatch(/The image|English|carton specification yet/);
  });
});
