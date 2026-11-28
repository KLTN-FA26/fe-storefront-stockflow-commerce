import { describe, expect, it } from "vitest";

import { variantLabel } from "./variant-label";

describe("variantLabel", () => {
  it("reads the variant's name, not its SKU code", () => {
    expect(variantLabel({ sku: "LYG12-DA1", name: "Ly giấy 12 oz - Đáy 1" })).toBe(
      "Ly giấy 12 oz - Đáy 1",
    );
  });

  it("drops the product's title the name starts with, when the page shows it already", () => {
    expect(
      variantLabel(
        { sku: "LY-GIAY-DEMO-12OZ", name: "Ly giấy 2 lớp in logo - 12 oz" },
        "Ly giấy 2 lớp in logo",
      ),
    ).toBe("12 oz");
    expect(
      variantLabel({ sku: "HOP-XAM", name: "Hộp giấy in logo – Xám – Giấy" }, "hộp giấy in logo"),
    ).toBe("Xám – Giấy");
  });

  it("keeps the whole name when it is only the title, or does not start with it", () => {
    expect(variantLabel({ sku: "A", name: "Ly giấy" }, "Ly giấy")).toBe("Ly giấy");
    expect(variantLabel({ sku: "A", name: "Cốc 8 oz" }, "Ly giấy")).toBe("Cốc 8 oz");
  });

  it("falls back to the SKU when the BE sends no name", () => {
    expect(variantLabel({ sku: "LYG12-DA1" })).toBe("LYG12-DA1");
    expect(variantLabel({ sku: "LYG12-DA1", name: "  " }, "Ly giấy")).toBe("LYG12-DA1");
  });
});
