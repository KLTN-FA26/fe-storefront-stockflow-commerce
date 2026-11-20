import { describe, expect, it } from "vitest";

import { quoteDtoSchema } from "../schemas";
import { customerHistory, previewAcceptance, shownLine, tierFor, vatOf } from "../selectors";
import { beSentQuote, beTwoLineQuote, cupLineId, lidLineId } from "./fixtures";

const quote = quoteDtoSchema.parse(beSentQuote);
const twoLines = quoteDtoSchema.parse(beTwoLineQuote);

describe("TC-F03-02: quote money (preview, as the BE computes it)", () => {
  it("line total = cartons × units per carton × unit price of the tier", () => {
    const preview = previewAcceptance(quote, { [cupLineId]: 60 });
    expect(preview.lines[0]).toMatchObject({
      cartons: 60,
      units: 60_000,
      unitPrice: 1150,
      lineTotal: 60 * 1000 * 1150,
      tax: 5_520_000,
    });
  });

  it("total = Σ lines + fees + VAT of lines and fees — the BE's 76.140.000 đ", () => {
    const preview = previewAcceptance(quote, {});
    expect(preview).toMatchObject({
      subtotal: 69_000_000,
      fees: 1_500_000,
      tax: 5_640_000,
      total: 76_140_000,
    });
    expect(preview.total).toBe(quote.proposed?.total);
  });

  it("sums two lines and their VAT line by line", () => {
    const preview = previewAcceptance(twoLines, {});
    expect(preview.subtotal).toBe(69_000_000 + 10_800_000);
    expect(preview.tax).toBe(5_520_000 + 864_000 + 120_000);
    expect(preview.total).toBe(79_800_000 + 1_500_000 + 6_504_000);
  });

  it("changes tier with the cartons: 100 cartons drop to 1.050 đ a cup", () => {
    const preview = previewAcceptance(quote, { [cupLineId]: 100 });
    expect(preview.lines[0]).toMatchObject({ unitPrice: 1050, lineTotal: 105_000_000 });
    expect(preview.lines[0]!.tier).toEqual({ minQuantity: 100, unitPrice: 1050 });
  });

  it("below the MOQ the line has no price and the total is unknown", () => {
    const preview = previewAcceptance(twoLines, { [cupLineId]: 10, [lidLineId]: 30 });
    expect(preview.lines[0]).toMatchObject({ belowMoq: true, moq: 20, unitPrice: null });
    expect(preview.total).toBeNull();
  });

  it("picks the tier from the cartons of the SKU over every line (BE Quote.accept)", () => {
    const sameSku = quoteDtoSchema.parse({
      ...beTwoLineQuote,
      lines: beTwoLineQuote.lines.map((line) => ({ ...line, sku: "SAME", tiers: line.tiers })),
    });
    // 40 + 15 = 55 cartons of one SKU: the 50-carton break of the first line's tiers.
    const preview = previewAcceptance(sameSku, { [cupLineId]: 40, [lidLineId]: 15 });
    expect(preview.lines[0]!.unitPrice).toBe(1150);
  });
});

describe("price helpers", () => {
  it("tierFor takes the break with the highest start not above the cartons", () => {
    const tiers = quote.lines[0]!.tiers;
    expect(tierFor(tiers, 19)).toBeNull();
    expect(tierFor(tiers, 20)?.unitPrice).toBe(1250);
    expect(tierFor(tiers, 99)?.unitPrice).toBe(1150);
  });

  it("vatOf rounds half up to the dong, rate a percentage", () => {
    expect(vatOf(69_000_000, 8)).toBe(5_520_000);
    expect(vatOf(1_005, 10)).toBe(101); // 100.5 → 101
    expect(vatOf(1_000, null)).toBeNull();
  });

  it("shows the accepted figures once accepted", () => {
    const accepted = quoteDtoSchema.parse({
      ...beSentQuote,
      status: "ACCEPTED",
      lines: [
        {
          ...beSentQuote.lines[0],
          acceptedCartons: 100,
          acceptedUnits: 100_000,
          acceptedUnitPrice: 1050,
          acceptedLineTotal: 105_000_000,
          acceptedTax: 8_400_000,
        },
      ],
    });
    expect(shownLine(accepted.lines[0]!)).toMatchObject({
      cartons: 100,
      unitPrice: 1050,
      lineTotal: 105_000_000,
    });
  });
});

describe("customerHistory", () => {
  const row = (revision: number, fromStatus: string | undefined, toStatus: string) => ({
    revision,
    ...(fromStatus ? { fromStatus } : {}),
    toStatus,
    changedAt: "2099-11-20T02:00:00Z",
  });

  it("customerHistory bỏ dòng Nháp (lập báo giá và Sale mở lại)", () => {
    const history = quoteDtoSchema.parse({
      ...beSentQuote,
      history: [
        row(1, undefined, "DRAFT"),
        row(1, "DRAFT", "SENT"),
        row(1, "SENT", "CHANGES_REQUESTED"),
        row(2, "CHANGES_REQUESTED", "DRAFT"),
      ],
    }).history;
    expect(customerHistory(history, 1).map((entry) => entry.toStatus)).toEqual([
      "SENT",
      "CHANGES_REQUESTED",
    ]);
  });

  it("Sale bỏ bản sửa: dòng Đã huỷ không ghi bản sửa 2", () => {
    const history = quoteDtoSchema.parse({
      ...beSentQuote,
      history: [row(1, "DRAFT", "SENT"), row(2, "DRAFT", "CANCELLED")],
    }).history;
    const [sent, cancelled] = customerHistory(history, 1);
    expect(sent?.revision).toBe(1);
    expect(cancelled).toMatchObject({ toStatus: "CANCELLED", revision: null });
  });
});
