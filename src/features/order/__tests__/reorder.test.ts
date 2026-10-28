import { describe, expect, it } from "vitest";

import { canRefillBasket, describeSkippedLine, planBasketReorder, reorderKindOf } from "../reorder";
import { orderDtoSchema } from "../schemas";
import { beOrder } from "./fixtures";

const DESIGN = "9c0d1e2f-0000-4000-8000-000000000002";
const line = (n: number, over: Record<string, unknown> = {}) => ({
  lineId: `1a2b3c4d-0000-4000-8000-00000000010${n}`,
  sku: `CUP-${n}`,
  quantity: 100 * n,
  unitPrice: 1000,
  lineTotal: 100_000 * n,
  productSlug: `ly-${n}`,
  productTitle: `Ly ${n}`,
  productImageUrl: `https://cdn.example/ly-${n}.jpg`,
  ...over,
});
const orderOf = (lines: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) =>
  orderDtoSchema.parse({ ...beOrder, lines, ...extra });

describe("planBasketReorder", () => {
  it("puts every stock line back with its SKU, quantity and the product to show, and no price", () => {
    const plan = planBasketReorder(orderOf([line(1), line(2)]));
    expect(plan.lines).toEqual([
      {
        sku: "CUP-1",
        slug: "ly-1",
        title: "Ly 1",
        imageUrl: "https://cdn.example/ly-1.jpg",
        quantity: 100,
      },
      {
        sku: "CUP-2",
        slug: "ly-2",
        title: "Ly 2",
        imageUrl: "https://cdn.example/ly-2.jpg",
        quantity: 200,
      },
    ]);
    expect(plan.skippedDesign).toEqual([]);
    expect(plan.skippedUnavailable).toEqual([]);
    // The basket reads the price live: nothing of the old deal is carried over.
    expect(JSON.stringify(plan.lines)).not.toContain("unitPrice");
  });

  it("leaves out design lines, which are quoted rather than put in the basket", () => {
    const plan = planBasketReorder(
      orderOf([line(1), line(2, { designSnapshotId: DESIGN, productSlug: null })]),
    );
    expect(plan.lines.map((l) => l.sku)).toEqual(["CUP-1"]);
    expect(plan.skippedDesign.map((l) => l.sku)).toEqual(["CUP-2"]);
    expect(plan.skippedUnavailable).toEqual([]);
  });

  it("leaves out a SKU that is no longer on sale and names it", () => {
    const plan = planBasketReorder(
      orderOf([line(1), line(2, { productSlug: null, productTitle: null, productImageUrl: null })]),
    );
    expect(plan.lines.map((l) => l.sku)).toEqual(["CUP-1"]);
    expect(plan.skippedUnavailable.map((l) => l.sku)).toEqual(["CUP-2"]);
  });

  it("adds up a SKU that is on two lines and keeps the image optional", () => {
    const plan = planBasketReorder(
      orderOf([line(1), line(1, { lineId: "1a2b3c4d-0000-4000-8000-000000000199", quantity: 50 })]),
    );
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]?.quantity).toBe(150);
    const noImage = planBasketReorder(orderOf([line(1, { productImageUrl: null })]));
    expect(noImage.lines[0]).not.toHaveProperty("imageUrl");
  });

  it("has nothing to refill when every line is a design or gone", () => {
    const plan = planBasketReorder(
      orderOf([line(1, { designSnapshotId: DESIGN }), line(2, { productSlug: null })]),
    );
    expect(plan.lines).toEqual([]);
  });
});

describe("reorderKindOf", () => {
  it("asks Sales for a quote only when the BE says the order came from one", () => {
    const allowed = (reorder: boolean) => ({
      allowedActions: { cancel: false, requestCancellation: false, reorder },
    });
    expect(reorderKindOf(orderOf([line(1)], allowed(true)))).toBe("quote");
    expect(reorderKindOf(orderOf([line(1)], allowed(false)))).toBe("basket");
    // An older BE sends no allowedActions: a price-list order is the common case.
    expect(reorderKindOf(orderOf([line(1)]))).toBe("basket");
  });
});

describe("canRefillBasket", () => {
  it("is false for an older BE that does not say where the SKUs are on sale", () => {
    expect(canRefillBasket(orderOf([{ ...line(1), productSlug: undefined }]))).toBe(false);
  });

  it("is true once the BE says, even if it says every SKU is gone (the notice explains)", () => {
    expect(canRefillBasket(orderOf([line(1, { productSlug: null })]))).toBe(true);
    expect(canRefillBasket(orderOf([line(1)]))).toBe(true);
  });
});

describe("describeSkippedLine", () => {
  it("names the product, the SKU and the quantity", () => {
    const [skipped] = planBasketReorder(
      orderOf([line(2, { designSnapshotId: DESIGN })]),
    ).skippedDesign;
    expect(describeSkippedLine(skipped!)).toBe("Ly 2 · CUP-2 × 200");
  });
});
