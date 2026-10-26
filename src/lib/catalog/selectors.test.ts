import { describe, expect, it } from "vitest";

import {
  availabilityBySku,
  badgeStatus,
  bestAvailability,
  canBuy,
  indexBySku,
  lowestUnitPrice,
  unitPriceFor,
} from "./selectors";
import type { PriceSchedule } from "./types";

const schedule = (tiers: Array<[number, number]>): PriceSchedule => ({
  sku: "CUP-1",
  source: "CUSTOMER",
  moq: Math.min(...tiers.map(([min]) => min)),
  currency: "VND",
  tiers: tiers.map(([minQuantity, unitPrice]) => ({ minQuantity, unitPrice })),
});

describe("unitPriceFor (kltn-docs 13 BR-05: tiers and MOQ)", () => {
  const tiered = schedule([
    [5000, 720],
    [1000, 780], // the BE's order is not relied on
    [20000, 650],
  ]);

  it("takes the highest tier the quantity reaches", () => {
    expect(unitPriceFor(tiered, 1000)).toBe(780);
    expect(unitPriceFor(tiered, 4999)).toBe(780);
    expect(unitPriceFor(tiered, 5000)).toBe(720);
    expect(unitPriceFor(tiered, 19999)).toBe(720);
    expect(unitPriceFor(tiered, 20000)).toBe(650);
    expect(unitPriceFor(tiered, 1_000_000)).toBe(650);
  });

  it("has no price below the first tier: the BE refuses it and Sales quotes it", () => {
    expect(unitPriceFor(tiered, 999)).toBeUndefined();
    expect(unitPriceFor(tiered, 0)).toBeUndefined();
  });

  it("has no price without a schedule (a SKU the BE left out)", () => {
    expect(unitPriceFor(undefined, 10)).toBeUndefined();
    expect(unitPriceFor(schedule([]), 10)).toBeUndefined();
  });

  it("prices a flat list from one unit", () => {
    expect(unitPriceFor(schedule([[1, 189000]]), 1)).toBe(189000);
  });
});

describe("card figures", () => {
  it("shows the lowest unit price over every SKU's tiers", () => {
    expect(
      lowestUnitPrice([
        schedule([[1, 900]]),
        schedule([
          [1, 800],
          [10, 700],
        ]),
      ]),
    ).toBe(700);
    expect(lowestUnitPrice([])).toBeUndefined();
  });

  it("is as available as the best variant; unknown mixed with out of stock stays unknown", () => {
    expect(bestAvailability(["OUT_OF_STOCK", "LOW_STOCK", "IN_STOCK"])).toBe("IN_STOCK");
    expect(bestAvailability(["OUT_OF_STOCK", "LOW_STOCK"])).toBe("LOW_STOCK");
    expect(bestAvailability(["OUT_OF_STOCK", "OUT_OF_STOCK"])).toBe("OUT_OF_STOCK");
    expect(bestAvailability(["OUT_OF_STOCK", "UNKNOWN"])).toBe("UNKNOWN");
    expect(bestAvailability([])).toBeUndefined();
  });

  it("blocks buying only for OUT_OF_STOCK; the checkout decides for the rest", () => {
    expect(canBuy("OUT_OF_STOCK")).toBe(false);
    for (const a of ["IN_STOCK", "LOW_STOCK", "UNKNOWN", undefined] as const) {
      expect(canBuy(a)).toBe(true);
    }
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
