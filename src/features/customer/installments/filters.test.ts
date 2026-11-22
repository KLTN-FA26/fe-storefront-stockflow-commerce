import { describe, expect, it } from "vitest";

import { INSTALLMENT_OVERDUE, INSTALLMENT_STATUS } from "@/lib/domain/status-map";

import { INSTALLMENT_FILTER_LABEL, PAYMENT_FILTER_LABEL } from "./filters";

describe("installment filter chips", () => {
  it("read as the status map's labels, so a chip and the badge it filters agree", () => {
    expect(INSTALLMENT_FILTER_LABEL.DUE).toBe(INSTALLMENT_STATUS.DUE.label);
    expect(INSTALLMENT_FILTER_LABEL.PARTIALLY_PAID).toBe("Đã trả một phần");
    expect(INSTALLMENT_FILTER_LABEL.NOT_DUE).toBe(INSTALLMENT_STATUS.NOT_DUE.label);
    expect(INSTALLMENT_FILTER_LABEL.PAID).toBe(INSTALLMENT_STATUS.PAID.label);
    expect(PAYMENT_FILTER_LABEL["qua-han"]).toBe(INSTALLMENT_OVERDUE.label);
    expect(PAYMENT_FILTER_LABEL["chua-den-han"]).toBe(INSTALLMENT_STATUS.NOT_DUE.label);
    expect(PAYMENT_FILTER_LABEL["da-tra"]).toBe(INSTALLMENT_STATUS.PAID.label);
  });
});
