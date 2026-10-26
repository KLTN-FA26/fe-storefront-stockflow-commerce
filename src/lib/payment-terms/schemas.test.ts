import { describe, expect, it } from "vitest";

import { parsePaymentTerms } from "./schemas";

describe("parsePaymentTerms balance policy and overdue fields", () => {
  it("reads the balance policies and the overdue figures", () => {
    const dto = parsePaymentTerms({
      allowedTerms: ["DEPOSIT", "CREDIT"],
      depositPercent: 30,
      depositBalancePolicy: "ON_CREDIT",
      allowedBalancePolicies: ["BEFORE_DELIVERY", "ON_CREDIT"],
      creditLimit: 5_000_000,
      hasOverdue: true,
      overdueAmount: 1_300_000,
      oldestOverdueDueDate: "2026-10-13",
    });
    expect(dto).toMatchObject({
      depositBalancePolicy: "ON_CREDIT",
      allowedBalancePolicies: ["BEFORE_DELIVERY", "ON_CREDIT"],
      overdueAmount: 1_300_000,
      oldestOverdueDueDate: "2026-10-13",
    });
  });

  it("accepts a response from before the new fields (all optional)", () => {
    const dto = parsePaymentTerms({ allowedTerms: ["PREPAID"] });
    expect(dto.allowedBalancePolicies).toBeUndefined();
    expect(dto.creditUnreadable).toBeUndefined();
  });

  it("keeps the terms usable when only the overdue figures are malformed", () => {
    const dto = parsePaymentTerms({ allowedTerms: ["DEPOSIT"], overdueAmount: "lots" });
    expect(dto.allowedTerms).toEqual(["DEPOSIT"]);
    expect(dto.creditUnreadable).toBe(true);
  });
});
