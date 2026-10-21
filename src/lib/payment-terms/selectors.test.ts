import { describe, expect, it } from "vitest";

import { creditOutlook, creditSummary } from "./selectors";

const dto = (over: Record<string, unknown> = {}) => ({ allowedTerms: ["CREDIT"], ...over });

describe("creditSummary", () => {
  it("is undefined for a customer who may not order on credit and has no limit", () => {
    const prepaid = (over: Record<string, unknown> = {}) =>
      dto({ allowedTerms: ["PREPAID", "DEPOSIT"], ...over });
    expect(creditSummary(prepaid())).toBeUndefined();
    expect(creditSummary(prepaid({ creditLimit: 0 }))).toBeUndefined();
    expect(creditSummary(prepaid({ creditLimit: null }))).toBeUndefined();
  });

  it("is a zero limit for a customer allowed credit without one: every credit order is held", () => {
    for (const over of [{}, { creditLimit: 0 }, { creditLimit: null }]) {
      expect(creditSummary(dto(over))).toEqual({
        currency: "VND",
        limit: 0,
        exposure: 0,
        available: 0,
        termDays: undefined,
        overdue: false,
      });
    }
  });

  it("is undefined when the credit fields could not be read", () => {
    expect(creditSummary(dto({ creditLimit: 5_000, creditUnreadable: true }))).toBeUndefined();
  });

  it("reads the limit, what is owed, what is left, the days to pay and the overdue flag", () => {
    expect(
      creditSummary(
        dto({
          creditLimit: 50_000_000,
          exposure: 12_000_000,
          availableCredit: 38_000_000,
          creditTermDays: 30,
          hasOverdue: true,
          currency: "VND",
        }),
      ),
    ).toEqual({
      currency: "VND",
      limit: 50_000_000,
      exposure: 12_000_000,
      available: 38_000_000,
      termDays: 30,
      overdue: true,
    });
  });

  it("treats omitted (NON_NULL) fields as nothing owed, no overdue, and works the rest out", () => {
    expect(creditSummary(dto({ creditLimit: 10_000_000 }))).toEqual({
      currency: "VND",
      limit: 10_000_000,
      exposure: 0,
      available: 10_000_000,
      termDays: undefined,
      overdue: false,
    });
  });

  it("never shows less than nothing left, and falls back to VND for a currency it does not know", () => {
    const summary = creditSummary(
      dto({ creditLimit: 1_000, exposure: 1_500, availableCredit: -500, currency: "EUR" }),
    );
    expect(summary).toMatchObject({ available: 0, currency: "VND" });
  });
});

describe("creditOutlook", () => {
  const credit = creditSummary(dto({ creditLimit: 1_000, exposure: 400 }))!;

  it("is within the limit up to exactly what is left", () => {
    expect(creditOutlook(credit, 600)).toBe("WITHIN_LIMIT");
    expect(creditOutlook(credit, 601)).toBe("OVER_LIMIT");
  });

  it("says there is no limit for a zero limit, before comparing amounts", () => {
    expect(creditOutlook(creditSummary(dto())!, 1)).toBe("NO_LIMIT");
  });

  it("is held for an overdue receivable whatever the total", () => {
    expect(creditOutlook({ ...credit, overdue: true }, 1)).toBe("OVERDUE");
  });
});
