import { describe, expect, it } from "vitest";
import { z } from "zod";

import { describeError } from "../errors";
import { orderCardDtoSchema, orderDtoSchema, orderPageDtoSchema } from "../schemas";
import { beCard, beOrder, bePage } from "./fixtures";

describe("order list schema follows BE CustomerOrderCardResponse / PageResponse", () => {
  it("parses a real card: no lines, a line count, one customer-facing status group", () => {
    const parsed = orderCardDtoSchema.parse(beCard);
    expect(parsed).toMatchObject({
      orderNumber: "SO-20260907-000431",
      status: "CONFIRMED",
      statusGroup: "CONFIRMED",
      total: 507000,
      lineCount: 2,
      deliveryState: "NOT_SHIPPED",
    });
    expect(parsed).not.toHaveProperty("lines");
  });

  it("parses a whole /orders/me page", () => {
    const page = orderPageDtoSchema.parse(bePage());
    expect(page.items).toHaveLength(1);
    expect(page).toMatchObject({ page: 0, totalElements: 1, hasNext: false });
  });

  it("accepts a card whose deliveryState is absent (NON_NULL)", () => {
    const { deliveryState: _omit, ...card } = beCard;
    expect(orderCardDtoSchema.safeParse(card).success).toBe(true);
  });

  it("parses a status or group the FE does not know yet as UNKNOWN instead of failing the page", () => {
    const parsed = orderCardDtoSchema.parse({
      ...beCard,
      status: "SOMETHING_NEW",
      statusGroup: "SOMETHING_NEWER",
      deliveryState: "LOST_IN_SPACE",
    });
    expect(parsed).toMatchObject({
      status: "UNKNOWN",
      statusGroup: "UNKNOWN",
      deliveryState: "UNKNOWN",
    });
    expect(
      orderPageDtoSchema.safeParse(bePage({ items: [beCard, { ...beCard, status: "X" }] })).success,
    ).toBe(true);
  });

  it("still rejects a missing or non-string status", () => {
    const { status: _status, ...withoutStatus } = beCard;
    expect(orderCardDtoSchema.safeParse(withoutStatus).success).toBe(false);
    expect(orderCardDtoSchema.safeParse({ ...beCard, status: 3 }).success).toBe(false);
  });

  it("rejects a total that is not a number and the legacy totalAmount/lines shape", () => {
    expect(orderCardDtoSchema.safeParse({ ...beCard, total: "507000" }).success).toBe(false);
    const { total: _total, lineCount: _count, ...rest } = beCard;
    expect(orderCardDtoSchema.safeParse({ ...rest, totalAmount: 507000, lines: [] }).success).toBe(
      false,
    );
  });

  it("requires the PageResponse paging flags", () => {
    expect(orderPageDtoSchema.safeParse(bePage()).success).toBe(true);
    const { hasNext: _omit, ...withoutHasNext } = bePage();
    expect(orderPageDtoSchema.safeParse(withoutHasNext).success).toBe(false);
  });
});

describe("order detail schema follows BE CustomerOrderDetailResponse", () => {
  it("parses a real response with address, hold reason and contact data absent", () => {
    const parsed = orderDtoSchema.parse(beOrder);
    expect(parsed.shippingAddress).toBeUndefined();
    expect(parsed.holdReasonPublic).toBeUndefined();
    expect(parsed.lines[0]?.designSnapshotId).toBeUndefined();
    expect(parsed.lines[1]?.production).toEqual({ state: "IN_PROGRESS", goodQuantity: 0 });
    expect(parsed.timeline?.map((entry) => entry.statusGroup)).toEqual([
      "AWAITING_PAYMENT",
      "CONFIRMED",
    ]);
  });

  it("accepts a shipping address without line2/postalCode", () => {
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

  it("parses statuses the FE does not know yet as UNKNOWN, in the order and in its timeline", () => {
    const parsed = orderDtoSchema.parse({
      ...beOrder,
      status: "SOMETHING_NEW",
      statusGroup: "SOMETHING_NEWER",
      timeline: [
        { status: "SOMETHING_NEW", statusGroup: "SOMETHING_NEWER", occurredAt: beOrder.placedAt },
      ],
    });
    expect(parsed).toMatchObject({ status: "UNKNOWN", statusGroup: "UNKNOWN" });
    expect(parsed.timeline?.[0]).toMatchObject({ status: "UNKNOWN", statusGroup: "UNKNOWN" });
  });

  it("rejects a total that is not a number and the staff OrderResponse field totalAmount", () => {
    expect(orderDtoSchema.safeParse({ ...beOrder, total: "507000" }).success).toBe(false);
    const { total: _omit, ...legacy } = beOrder;
    expect(orderDtoSchema.safeParse({ ...legacy, totalAmount: 507000 }).success).toBe(false);
  });

  it("turns a contract failure into a customer message, not the raw zod issues", () => {
    const result = orderDtoSchema.safeParse({ ...beOrder, total: "507000" });
    expect(result.success).toBe(false);
    const message = describeError(result.error);
    expect(message).toContain("Dữ liệu trả về không đúng định dạng");
    expect(message).not.toContain("invalid_value");
    expect(result.error).toBeInstanceOf(z.ZodError);
  });
});
