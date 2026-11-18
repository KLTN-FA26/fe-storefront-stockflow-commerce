import { describe, expect, it } from "vitest";

import {
  quoteAcceptanceFormSchema,
  quoteAcceptanceInputSchema,
  quoteChangeRequestInputSchema,
  quoteDtoSchema,
  quotePageDtoSchema,
} from "../schemas";
import { beQuoteRow, beSentQuote, bePage, cupLineId, quoteId } from "./fixtures";

describe("quote DTO schemas", () => {
  it("parses a BE QuoteResponse whose null fields are absent (NON_NULL)", () => {
    const quote = quoteDtoSchema.parse(beSentQuote);
    expect(quote.terms).toBeUndefined();
    expect(quote.accepted).toBeUndefined();
    expect(quote.convertedOrder).toBeUndefined();
    expect(quote.lines[0]).toMatchObject({
      cartons: 60,
      unitsPerCarton: 1000,
      moq: 20,
      taxRate: 8,
    });
    expect(quote.lines[0]!.acceptedCartons).toBeUndefined();
    expect(quote.fees[0]).toMatchObject({ kind: "PLATE_FEE", amount: 1500000, tax: 120000 });
    expect(quote.history.at(-1)).toMatchObject({ fromStatus: "DRAFT", toStatus: "SENT" });
  });

  it("parses explicit nulls the same way", () => {
    const quote = quoteDtoSchema.parse({
      ...beSentQuote,
      terms: null,
      accepted: null,
      convertedOrder: null,
      customerFeedback: null,
    });
    expect(quote.terms).toBeNull();
  });

  it("keeps a page with lists left out: a quote without fees or history", () => {
    const { fees: _fees, history: _history, ...bare } = beSentQuote;
    const quote = quoteDtoSchema.parse(bare);
    expect(quote.fees).toEqual([]);
    expect(quote.history).toEqual([]);
  });

  it("reads a status newer than the FE as UNKNOWN, not a contract error", () => {
    expect(quoteDtoSchema.parse({ ...beSentQuote, status: "ARCHIVED" }).status).toBe("UNKNOWN");
  });

  it("parses the list page of QuoteRowResponse (no total, no lines)", () => {
    const page = quotePageDtoSchema.parse(bePage([beQuoteRow]));
    expect(page.items[0]).toMatchObject({ quoteNumber: "QT-20261120-9001", status: "SENT" });
    expect(page.items[0]!.convertedOrderId).toBeUndefined();
  });
});

describe("quote input schemas", () => {
  it("accepts { version, lines: [{ lineId, cartons ≥ 1 }] } and refuses 0 cartons", () => {
    const body = { quoteId, version: 3, lines: [{ lineId: cupLineId, cartons: 60 }] };
    expect(quoteAcceptanceInputSchema.safeParse(body).success).toBe(true);
    expect(
      quoteAcceptanceInputSchema.safeParse({ ...body, lines: [{ lineId: cupLineId, cartons: 0 }] })
        .success,
    ).toBe(false);
  });

  it("requires feedback of 1–2000 characters once trimmed", () => {
    const base = { quoteId, version: 3 };
    expect(quoteChangeRequestInputSchema.safeParse({ ...base, feedback: "   " }).success).toBe(
      false,
    );
    expect(
      quoteChangeRequestInputSchema.safeParse({ ...base, feedback: "x".repeat(2001) }).success,
    ).toBe(false);
    expect(quoteChangeRequestInputSchema.parse({ ...base, feedback: " Giảm giá " }).feedback).toBe(
      "Giảm giá",
    );
  });

  it("refuses cartons below the MOQ of the line's SKU, summed over its lines (14 BR-07)", () => {
    const schema = quoteAcceptanceFormSchema([
      { lineId: cupLineId, lineNo: 1, sku: "CUP", moq: 20 },
    ]);
    const below = schema.safeParse({ lines: [{ lineId: cupLineId, cartons: 10 }] });
    expect(below.success).toBe(false);
    expect(below.error?.issues[0]).toMatchObject({
      path: ["lines", 0, "cartons"],
      message: "Dòng 1: tối thiểu 20 thùng (MOQ).",
    });
    expect(schema.safeParse({ lines: [{ lineId: cupLineId, cartons: 20 }] }).success).toBe(true);
  });
});
