import { describe, expect, it } from "vitest";
import { z } from "zod";

import { describeError } from "../errors";
import { orderDtoSchema, orderPageDtoSchema } from "../schemas";
import { beOrder, bePage } from "./fixtures";

describe("order schemas follow the BE OrderResponse / PageResponse contract", () => {
  it("accepts a real NON_NULL response with contact, addresses and design fields absent", () => {
    const parsed = orderDtoSchema.parse(beOrder);
    expect(parsed.contactName).toBeUndefined();
    expect(parsed.shippingAddress).toBeUndefined();
    expect(parsed.lines[0]?.designSnapshotId).toBeUndefined();
  });

  it("accepts an order never modified after insert and a guest order (nullable columns)", () => {
    // ordering.customer_order.last_modified_at / customer_id are nullable; NON_NULL drops the keys.
    const { lastModifiedAt: _modified, customerId: _customer, ...untouched } = beOrder;
    const parsed = orderDtoSchema.parse(untouched);
    expect(parsed.lastModifiedAt).toBeUndefined();
    expect(parsed.customerId).toBeUndefined();
  });

  it("accepts addresses without line2/postalCode", () => {
    const shippingAddress = {
      recipientName: "Nguyễn Hoài Nam",
      phone: "+84908111222",
      line1: "12 Nguyễn Huệ",
      wardCode: "26734",
      wardName: "Phường Sài Gòn",
      provinceCode: "79",
      provinceName: "Thành phố Hồ Chí Minh",
      countryCode: "VN",
    };
    expect(orderDtoSchema.parse({ ...beOrder, shippingAddress }).shippingAddress).toEqual(
      shippingAddress,
    );
  });

  it("parses a status the FE does not know yet as UNKNOWN instead of failing the order", () => {
    // Sprint 2 B2B adds CONFIRMED / IN_PRODUCTION (SCRUM-423/427) to the BE OrderStatus.
    expect(orderDtoSchema.parse({ ...beOrder, status: "CONFIRMED" }).status).toBe("UNKNOWN");
    expect(orderDtoSchema.parse({ ...beOrder, status: "IN_PRODUCTION" }).status).toBe("UNKNOWN");
    expect(orderDtoSchema.parse({ ...beOrder, status: "PAID" }).status).toBe("PAID");
  });

  it("still rejects a missing or non-string status", () => {
    const { status: _status, ...withoutStatus } = beOrder;
    expect(orderDtoSchema.safeParse(withoutStatus).success).toBe(false);
    expect(orderDtoSchema.safeParse({ ...beOrder, status: 3 }).success).toBe(false);
  });

  it("rejects a totalAmount that is not a number", () => {
    expect(orderDtoSchema.safeParse({ ...beOrder, totalAmount: "507000" }).success).toBe(false);
  });

  it("rejects the legacy FE field grandTotal in place of totalAmount", () => {
    const { totalAmount: _omit, ...legacy } = beOrder;
    expect(orderDtoSchema.safeParse({ ...legacy, grandTotal: 507000 }).success).toBe(false);
  });

  it("requires the PageResponse paging flags", () => {
    expect(orderPageDtoSchema.safeParse(bePage()).success).toBe(true);
    const { hasNext: _omit, ...withoutHasNext } = bePage();
    expect(orderPageDtoSchema.safeParse(withoutHasNext).success).toBe(false);
  });

  it("turns a contract failure into a customer message, not the raw zod issues", () => {
    const result = orderDtoSchema.safeParse({ ...beOrder, totalAmount: "507000" });
    expect(result.success).toBe(false);
    const message = describeError(result.error);
    expect(message).toContain("Dữ liệu trả về không đúng định dạng");
    expect(message).not.toContain("invalid_value");
    expect(result.error).toBeInstanceOf(z.ZodError);
  });
});
