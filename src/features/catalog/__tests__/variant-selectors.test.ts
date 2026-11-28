import { describe, expect, it } from "vitest";

import { attributeText, valueOn, variantAxes, variantForPick } from "../selectors";
import type { CatalogAttribute, CatalogVariant } from "../types";

const option = (axisCode: string, axisName: string, valueCode: string, label: string) => ({
  axisCode,
  axisName,
  valueCode,
  label,
});
const variant = (sku: string, ...options: ReturnType<typeof option>[]): CatalogVariant => ({
  sku,
  availability: "IN_STOCK",
  options,
});
const size = (code: string) => option("SIZE", "Dung tích", code, code.toLowerCase());
const color = (code: string) => option("COLOR", "Màu", code, code === "W" ? "Trắng" : "Kraft");

const grid = [
  variant("8-W", size("8OZ"), color("W")),
  variant("8-K", size("8OZ"), color("K")),
  variant("12-W", size("12OZ"), color("W")),
];

describe("variant axes (BE #493 options)", () => {
  it("lists each axis once, its values in the order the variants bring them", () => {
    expect(variantAxes(grid)).toEqual([
      {
        code: "SIZE",
        name: "Dung tích",
        values: [
          { code: "8OZ", label: "8oz" },
          { code: "12OZ", label: "12oz" },
        ],
      },
      {
        code: "COLOR",
        name: "Màu",
        values: [
          { code: "W", label: "Trắng" },
          { code: "K", label: "Kraft" },
        ],
      },
    ]);
  });

  it("gives no axes when a variant carries none, or misses an axis", () => {
    expect(variantAxes([...grid, { sku: "X", availability: "IN_STOCK" }])).toEqual([]);
    expect(variantAxes([...grid, variant("16", size("16OZ"))])).toEqual([]);
    expect(variantAxes([])).toEqual([]);
  });

  it("keeps the other axes when one is picked, else takes the first variant with the value", () => {
    const [w8, k8, w12] = grid;
    expect(variantForPick(grid, k8, "SIZE", "8OZ")?.sku).toBe("8-K");
    expect(variantForPick(grid, w8, "SIZE", "12OZ")?.sku).toBe("12-W");
    // No 12oz kraft: the first 12oz.
    expect(variantForPick(grid, k8, "SIZE", "12OZ")?.sku).toBe("12-W");
    expect(variantForPick(grid, w12, "COLOR", "K")?.sku).toBe("8-K");
    expect(variantForPick(grid, w12, "COLOR", "NONE")).toBeUndefined();
    expect(valueOn(w12, "COLOR")).toBe("W");
    expect(valueOn(undefined, "COLOR")).toBeUndefined();
  });
});

describe("attributeText", () => {
  const attr = (more: Partial<CatalogAttribute>): CatalogAttribute => ({
    code: "A",
    name: "A",
    ...more,
  });

  it("writes a descriptive attribute by its data type", () => {
    expect(attributeText(attr({ values: ["Giấy", "PE"] }))).toBe("Giấy, PE");
    expect(attributeText(attr({ text: "2 lớp" }))).toBe("2 lớp");
    expect(attributeText(attr({ number: 1000, unit: "ml" }))).toBe("1.000 ml");
    expect(attributeText(attr({ number: 0 }))).toBe("0");
    expect(attributeText(attr({ bool: true }))).toBe("Có");
    expect(attributeText(attr({ bool: false }))).toBe("Không");
    expect(attributeText(attr({}))).toBe("");
  });
});
