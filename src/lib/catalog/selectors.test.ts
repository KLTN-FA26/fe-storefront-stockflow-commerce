import { describe, expect, it } from "vitest";

import { availabilityBySku, badgeStatus, bestAvailability, indexBySku } from "./selectors";

describe("card figures", () => {
  it("is as available as the best variant; unknown mixed with out of stock stays unknown", () => {
    expect(bestAvailability(["OUT_OF_STOCK", "LOW_STOCK", "IN_STOCK"])).toBe("IN_STOCK");
    expect(bestAvailability(["OUT_OF_STOCK", "LOW_STOCK"])).toBe("LOW_STOCK");
    expect(bestAvailability(["OUT_OF_STOCK", "OUT_OF_STOCK"])).toBe("OUT_OF_STOCK");
    expect(bestAvailability(["OUT_OF_STOCK", "UNKNOWN"])).toBe("UNKNOWN");
    expect(bestAvailability([])).toBeUndefined();
  });

  it("maps to the badge vocabulary and shows no badge for what it does not know", () => {
    expect(badgeStatus("LOW_STOCK")).toBe("low-stock");
    expect(badgeStatus("UNKNOWN")).toBeUndefined();
    expect(badgeStatus(undefined)).toBeUndefined();
  });

  it("indexes by upper-cased SKU", () => {
    expect(indexBySku([{ sku: "cup-1" }]).get("CUP-1")).toEqual({ sku: "cup-1" });
    expect(availabilityBySku([{ sku: "cup-1", availability: "IN_STOCK" }]).get("CUP-1")).toBe(
      "IN_STOCK",
    );
  });
});
