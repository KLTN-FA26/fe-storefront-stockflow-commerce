import { describe, expect, it } from "vitest";

import { catalogListInputSchema } from "@/features/catalog/schemas";

import { designableSearchText } from "../designable-catalogue";

describe("designableSearchText", () => {
  it("sends what the catalogue takes: trimmed, at most 100 code points", () => {
    expect(designableSearchText("  ly giấy  ")).toBe("ly giấy");
    expect(designableSearchText("   ")).toBe("");
    expect(designableSearchText("a".repeat(101))).toBe("a".repeat(100));
    // Counted in code points, as the BE counts: an astral character is never split in half.
    expect(designableSearchText("𝒜".repeat(101))).toBe("𝒜".repeat(100));
  });

  it("never sends a text the catalogue's own input rule refuses", () => {
    const q = designableSearchText("𝒜".repeat(150));
    expect(catalogListInputSchema.safeParse({ q, page: 0, size: 12 }).success).toBe(true);
  });
});
