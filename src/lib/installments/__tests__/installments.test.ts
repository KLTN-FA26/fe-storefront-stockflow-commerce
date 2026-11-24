import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

import { getMyInstallmentTransfer, getMyOrderInstallments, listMyInstallments } from "../api";
import { installmentDtoSchema, orderInstallmentsDtoSchema } from "../schemas";
import {
  installmentMilestoneNote,
  installmentShortName,
  installmentStatusMeta,
  installmentTitle,
  isFeeItem,
  isPayable,
} from "../selectors";
import { ORDER_ID, beInstallment, beOrderInstallments } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

describe("installment schemas", () => {
  it("parses an order's installments as the BE sends them", () => {
    const plan = orderInstallmentsDtoSchema.parse(beOrderInstallments());
    expect(plan.outstanding).toBe(354_900);
    expect(plan.installments.map((i) => i.milestone)).toEqual(["ON_SIGNING", "AFTER_DELIVERY"]);
    expect(plan.installments[1]?.overdue).toBe(true);
  });

  it("reads a milestone or status newer than this FE as UNKNOWN", () => {
    const parsed = installmentDtoSchema.parse(
      beInstallment({ milestone: "ON_DEMAND", status: "SUSPENDED" }),
    );
    expect(parsed.milestone).toBe("UNKNOWN");
    expect(parsed.status).toBe("UNKNOWN");
  });

  it("allows the fields the BE leaves out (NON_NULL)", () => {
    const {
      dueDate: _due,
      reachedAt: _reached,
      paidAt: _paid,
      transferReference: _ref,
      ...rest
    } = beInstallment({ status: "NOT_DUE" });
    expect(installmentDtoSchema.safeParse(rest).success).toBe(true);
  });

  it("is a contract error when the outstanding amount is missing", () => {
    const { outstanding: _o, ...rest } = beInstallment();
    expect(installmentDtoSchema.safeParse(rest).success).toBe(false);
  });
});

describe("installment api", () => {
  it("asks the customer's own endpoints", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: beOrderInstallments() });
    await getMyOrderInstallments(ORDER_ID);
    expect(get).toHaveBeenLastCalledWith(`/installments/me/orders/${ORDER_ID}`, {});

    get.mockResolvedValueOnce({
      data: {
        installmentId: ORDER_ID,
        contractNumber: "HD-1",
        orderNumber: "SO-1",
        seq: 1,
        name: "Đặt cọc",
        bankName: "VCB",
        accountNumber: "1",
        accountName: "A",
        amountDue: 1,
        currency: "VND",
        reference: "HD-1 DOT1",
      },
    });
    await getMyInstallmentTransfer(ORDER_ID);
    expect(get).toHaveBeenLastCalledWith(`/installments/me/${ORDER_ID}/transfer-instructions`, {});

    get.mockResolvedValueOnce({
      data: {
        items: [beInstallment()],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
    await listMyInstallments({ page: 0, size: 20 });
    expect(get).toHaveBeenLastCalledWith("/installments/me", { params: { page: 0, size: 20 } });
  });
});

describe("installment selectors", () => {
  const parse = (over: Record<string, unknown>) => installmentDtoSchema.parse(beInstallment(over));

  it("reads an overdue installment as overdue whatever its status (overdue is a flag)", () => {
    expect(installmentStatusMeta(parse({ status: "PARTIALLY_PAID", overdue: true }))).toEqual({
      label: "Quá hạn",
      tone: "danger",
    });
    expect(installmentStatusMeta(parse({ status: "DUE", overdue: false })).label).toBe("Đến hạn");
  });

  it("offers transfer details only while money is owed (15 §4.2: paying early is allowed)", () => {
    expect(isPayable(parse({ status: "NOT_DUE", outstanding: 100 }))).toBe(true);
    expect(isPayable(parse({ status: "DUE", outstanding: 100 }))).toBe(true);
    expect(isPayable(parse({ status: "PARTIALLY_PAID", outstanding: 50 }))).toBe(true);
    expect(isPayable(parse({ status: "PAID", outstanding: 0 }))).toBe(false);
    expect(isPayable(parse({ status: "CANCELLED", outstanding: 100 }))).toBe(false);
    expect(isPayable(parse({ status: "DUE", outstanding: 0 }))).toBe(false);
  });

  it("titles an installment by its number and name", () => {
    expect(installmentTitle({ seq: 2, name: "Đặt cọc", milestone: "ON_SIGNING" })).toBe(
      "Đợt 2 · Đặt cọc",
    );
    expect(installmentTitle({ seq: 3, name: " ", milestone: "BEFORE_DELIVERY" })).toBe("Đợt 3");
  });

  describe("a fee item (WF-02 FE-7): its name, never 'Đợt 21'", () => {
    const fee = (over: Record<string, unknown>) => parse({ seq: 21, ...over });

    it("is told by its milestone, not by its number", () => {
      expect(isFeeItem(fee({ milestone: "CANCELLATION_FEE" }))).toBe(true);
      expect(isFeeItem(fee({ milestone: "FAILED_TRIP_FEE" }))).toBe(true);
      expect(isFeeItem(fee({ milestone: "AFTER_DELIVERY" }))).toBe(false);
    });

    it("titles and refers to a fee by its name in Vietnamese", () => {
      const cancellation = fee({ milestone: "CANCELLATION_FEE", name: "Cancellation fee" });
      expect(installmentTitle(cancellation)).toBe("Phí huỷ đơn");
      expect(installmentShortName(cancellation)).toBe("Phí huỷ đơn");
      expect(installmentTitle(cancellation)).not.toMatch(/Đợt/);
    });

    it("falls back to the milestone's label when the BE sent no name", () => {
      const trip = fee({ milestone: "FAILED_TRIP_FEE", name: "" });
      expect(installmentTitle(trip)).toBe("Phí chuyến giao không thành");
    });

    it("keeps an ordinary installment's number", () => {
      expect(installmentShortName(parse({ seq: 2, milestone: "BEFORE_DELIVERY" }))).toBe("Đợt 2");
    });

    it("does not repeat the title in the milestone line", () => {
      const cancellation = fee({ milestone: "CANCELLATION_FEE", name: "Cancellation fee" });
      expect(installmentMilestoneNote(cancellation)).toBeNull();
      const carried = fee({ milestone: "CANCELLATION_FEE", name: "Fee for the rest closed" });
      expect(installmentMilestoneNote(carried)).toBe("Khoản phải trả khi đóng phần còn lại");
      expect(installmentMilestoneNote(parse({ milestone: "ON_SIGNING" }))).toBe("Khi ký hợp đồng");
    });
  });
});
