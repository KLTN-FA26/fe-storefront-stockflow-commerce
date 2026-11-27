import { describe, expect, it } from "vitest";

import { isPlaceholderImage, productShapeOf, realImage } from "./product-image";

describe("isPlaceholderImage (sf-01)", () => {
  it("knows the placeholder services the demo seed uses", () => {
    expect(isPlaceholderImage("https://placehold.co/800x600?text=HOP-BANH-M")).toBe(true);
    expect(isPlaceholderImage("https://via.placeholder.com/600")).toBe(true);
  });

  it("keeps real media, local assets and nothing as they are", () => {
    expect(isPlaceholderImage("https://media.stockflow.vn/p/ly-12oz.webp")).toBe(false);
    expect(isPlaceholderImage("/logo.png")).toBe(false);
    expect(isPlaceholderImage(undefined)).toBe(false);
  });

  it("gives no image for a placeholder, the URL otherwise", () => {
    expect(realImage("https://placehold.co/800x600?text=LY-GIAY-12OZ")).toBeUndefined();
    expect(realImage("https://media.stockflow.vn/p/ly.webp")).toBe(
      "https://media.stockflow.vn/p/ly.webp",
    );
    expect(realImage(null)).toBeUndefined();
  });
});

describe("productShapeOf", () => {
  it.each([
    ["Ly giấy 2 lớp in logo", "cup"],
    ["Ly nhựa PET in logo", "cup"],
    ["Cốc giấy 8oz", "cup"],
    ["Hộp giấy đựng bánh in logo", "box"],
    ["Túi kraft quai xoắn", "bag"],
    ["Tô giấy kraft 750ml", "bowl"],
    ["Ống hút giấy", "generic"],
  ] as const)("%s → %s", (name, shape) => {
    expect(productShapeOf(name)).toBe(shape);
  });
});
