import { describe, expect, it } from "vitest";

import { imageFor, searchPageTitle, sortedImages } from "../selectors";
import { catalogGalleryDtoSchema } from "../schemas";
import { beGallery } from "./fixtures";

const gallery = catalogGalleryDtoSchema.parse(beGallery);

describe("gallery selectors", () => {
  it("puts the primary image first, then the BE's sort order", () => {
    expect(sortedImages(gallery).map((image) => image.url)).toEqual([
      "https://cdn.example.vn/p/white.jpg",
      "https://cdn.example.vn/p/kraft.jpg",
    ]);
  });

  it("prefers the picture of the chosen SKU, else the primary image", () => {
    expect(imageFor(gallery, "cup-paper-8oz-kraft")?.url).toBe(
      "https://cdn.example.vn/p/kraft.jpg",
    );
    expect(imageFor(gallery, "NO-SUCH-SKU")?.url).toBe("https://cdn.example.vn/p/white.jpg");
    expect(imageFor(gallery)?.url).toBe("https://cdn.example.vn/p/white.jpg");
  });

  it("titles the search page after the text searched", () => {
    expect(searchPageTitle(undefined)).toBe("Tìm kiếm");
    expect(searchPageTitle("   ")).toBe("Tìm kiếm");
    expect(searchPageTitle(" hộp pizza ")).toBe("Tìm “hộp pizza”");
    expect(searchPageTitle("a".repeat(150))).toBe(`Tìm “${"a".repeat(100)}”`);
  });

  it("has no image for an empty or missing gallery", () => {
    expect(imageFor({ images: [] })).toBeUndefined();
    expect(imageFor(undefined)).toBeUndefined();
  });
});
