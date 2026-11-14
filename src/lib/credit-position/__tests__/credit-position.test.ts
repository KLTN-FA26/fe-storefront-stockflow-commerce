import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

import { getMyCreditPosition } from "../api";
import { creditPositionDtoSchema } from "../schemas";
import { creditSummary } from "../selectors";

const dto = {
  customerId: "5a1f6f0e-3c36-4e0e-9a43-2b0f0d6a1c33",
  creditLimit: 10_000_000,
  creditTermDays: 30,
  exposure: 4_000_000,
  availableCredit: 6_000_000,
  currency: "VND",
  hasOverdue: false,
  overdueAmount: 0,
};

afterEach(() => vi.restoreAllMocks());

describe("credit position", () => {
  it("asks the customer's own endpoint and parses the answer", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: dto });
    expect(await getMyCreditPosition()).toMatchObject({ creditLimit: 10_000_000 });
    expect(get).toHaveBeenCalledWith("/orders/credit-position/me", {});
  });

  it("allows the credit fields the BE leaves out for a customer without credit", () => {
    const { creditLimit: _l, creditTermDays: _d, availableCredit: _a, ...rest } = dto;
    expect(creditPositionDtoSchema.safeParse(rest).success).toBe(true);
  });

  it("is a contract error without the exposure", () => {
    const { exposure: _e, ...rest } = dto;
    expect(creditPositionDtoSchema.safeParse(rest).success).toBe(false);
  });

  it("summarises a customer with credit", () => {
    expect(creditSummary(creditPositionDtoSchema.parse(dto))).toMatchObject({
      hasCredit: true,
      limit: 10_000_000,
      available: 6_000_000,
      termDays: 30,
      overdue: false,
    });
  });

  it("shows a customer without credit only when something is owed or overdue", () => {
    const { creditLimit: _l, creditTermDays: _d, availableCredit: _a, ...rest } = dto;
    const none = creditPositionDtoSchema.parse({ ...rest, exposure: 0 });
    expect(creditSummary(none)).toBeUndefined();
    const owing = creditPositionDtoSchema.parse({ ...rest, exposure: 100 });
    expect(creditSummary(owing)).toMatchObject({ hasCredit: false, exposure: 100, limit: 0 });
    const overdue = creditPositionDtoSchema.parse({ ...rest, exposure: 0, hasOverdue: true });
    expect(creditSummary(overdue)?.overdue).toBe(true);
  });
});
