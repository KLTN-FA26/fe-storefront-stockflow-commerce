import { describe, expect, it } from "vitest";

import type { PriceSchedule, SkuAvailability } from "@/lib/catalog/types";
import type { CartLine } from "@/lib/store/use-cart-store";

import { buildCartView, ISSUE_MESSAGE } from "../selectors";

const line = (sku: string, quantity: number): CartLine => ({
  sku,
  slug: sku.toLowerCase(),
  title: sku,
  quantity,
});
const schedule = (sku: string, tiers: Array<[number, number]>): PriceSchedule => ({
  sku,
  source: "CUSTOMER",
  moq: Math.min(...tiers.map(([min]) => min)),
  currency: "VND",
  tiers: tiers.map(([minQuantity, unitPrice]) => ({ minQuantity, unitPrice })),
});
const stock = (sku: string, availability: SkuAvailability["availability"]): SkuAvailability => ({
  sku,
  availability,
});

describe("buildCartView", () => {
  it("prices a line at the tier its quantity reaches and totals the lines", () => {
    const view = buildCartView(
      [line("CUP-1", 5000), line("BOX-1", 200)],
      [
        schedule("CUP-1", [
          [1000, 780],
          [5000, 720],
        ]),
        schedule("BOX-1", [[200, 2100]]),
      ],
      [stock("CUP-1", "IN_STOCK"), stock("BOX-1", "LOW_STOCK")],
    );
    expect(view.lines.map((row) => [row.unitPrice, row.lineTotal])).toEqual([
      [720, 3_600_000],
      [2100, 420_000],
    ]);
    expect(view.subtotal).toBe(4_020_000);
    expect(view.blocked).toBe(false);
    expect(view.lines.every((row) => row.issue === undefined)).toBe(true);
  });

  it("matches SKUs whatever their case", () => {
    const view = buildCartView(
      [line("cup-1", 1)],
      [schedule("CUP-1", [[1, 100]])],
      [stock("CUP-1", "IN_STOCK")],
    );
    expect(view.lines[0]?.unitPrice).toBe(100);
  });

  it("blocks an out-of-stock line first, even when it is also unpriced", () => {
    const view = buildCartView([line("CUP-1", 1000)], [], [stock("CUP-1", "OUT_OF_STOCK")]);
    expect(view.lines[0]?.issue).toBe("OUT_OF_STOCK");
    expect(view.blocked).toBe(true);
  });

  it("blocks a SKU the BE left out of /prices (NO_PRICE): it cannot be ordered either", () => {
    const view = buildCartView(
      [line("CUP-1", 10), line("BOX-1", 200)],
      [schedule("BOX-1", [[200, 2100]])],
      [stock("CUP-1", "IN_STOCK"), stock("BOX-1", "IN_STOCK")],
    );
    expect(view.lines[0]).toMatchObject({
      issue: "NO_PRICE",
      unitPrice: undefined,
      lineTotal: undefined,
    });
    // An unpriced line adds nothing to the total.
    expect(view.subtotal).toBe(420_000);
    expect(view.blocked).toBe(true);
  });

  it("blocks a quantity under the first tier (BELOW_MOQ), as the BE does with CUSTOMER_PRICE_BELOW_MOQ", () => {
    const view = buildCartView(
      [line("CUP-1", 999)],
      [schedule("CUP-1", [[1000, 780]])],
      [stock("CUP-1", "IN_STOCK")],
    );
    expect(view.lines[0]?.issue).toBe("BELOW_MOQ");
    expect(ISSUE_MESSAGE.BELOW_MOQ(1000)).toContain("1000");
  });

  it("blocks a price that is not whole VND: the BE would answer 400", () => {
    const view = buildCartView(
      [line("CUP-1", 1)],
      [schedule("CUP-1", [[1, 99.5]])],
      [stock("CUP-1", "IN_STOCK")],
    );
    expect(view.lines[0]?.issue).toBe("PRICE_NOT_WHOLE");
  });

  it("leaves a LOW_STOCK or UNKNOWN line orderable: the checkout decides", () => {
    const view = buildCartView(
      [line("A", 1), line("B", 1)],
      [schedule("A", [[1, 10]]), schedule("B", [[1, 10]])],
      [stock("A", "LOW_STOCK"), stock("B", "UNKNOWN")],
    );
    expect(view.blocked).toBe(false);
  });

  it("is empty and not blocked for an empty cart", () => {
    expect(buildCartView([], [], [])).toEqual({ lines: [], subtotal: 0, blocked: false });
  });

  it("has a Vietnamese message for every issue", () => {
    for (const message of Object.values(ISSUE_MESSAGE))
      expect(message(500).length).toBeGreaterThan(10);
  });
});
