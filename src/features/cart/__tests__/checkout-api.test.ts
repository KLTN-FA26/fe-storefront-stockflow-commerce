import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import { placeOrder } from "../checkout-api";
import { describeCheckoutError, describePlacedStatus, isStaleCartError } from "../checkout-errors";

afterEach(() => vi.restoreAllMocks());

const requestId = "11111111-1111-4111-8111-111111111111";
const customerId = "c0ffee00-0000-4000-8000-000000000010";
const shippingAddressId = "6f1c2a3b-4d5e-4f60-8a71-0b2c3d4e5f60";
const input = {
  requestId,
  customerId,
  shippingAddressId,
  lines: [{ sku: "cup-paper-8oz-wht", quantity: 1000, unitPrice: 780 }],
};
const placed = {
  orderId: "0b7d3c1e-0000-4000-8000-00000000f001",
  orderNumber: "SO-20261019-001432",
  customerId,
  status: "PENDING_PAYMENT",
  totalAmount: 780000,
  currency: "VND",
  lines: [{ lineId: "x", sku: "CUP-PAPER-8OZ-WHT", reservationIds: ["r"] }],
  placedAt: "2026-10-19T03:00:00Z",
};

describe("placeOrder (BE POST /orders)", () => {
  it("posts the checkout request and parses the order the BE returns", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: placed });

    const order = await placeOrder(input);

    expect(post).toHaveBeenCalledWith("/orders", {
      requestId,
      customerId,
      shippingAddressId,
      lines: [{ sku: "cup-paper-8oz-wht", quantity: 1000, unitPrice: 780 }],
    });
    expect(order).toEqual({
      orderId: placed.orderId,
      orderNumber: placed.orderNumber,
      status: "PENDING_PAYMENT",
      totalAmount: 780000,
      currency: "VND",
    });
  });

  it("never sends a payment term or a deposit: the customer cannot read which terms they have", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: placed });
    await placeOrder(input);
    const body = post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("paymentTerm");
    expect(body).not.toHaveProperty("depositPercent");
    expect(body).not.toHaveProperty("billingAddressId");
  });

  it("never calls the guest checkout the BE denies", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: placed });
    await placeOrder(input);
    expect(post.mock.calls[0]?.[0]).toBe("/orders");
  });

  it.each([
    ["no lines", { ...input, lines: [] }],
    ["a quantity of 0", { ...input, lines: [{ sku: "A", quantity: 0, unitPrice: 1 }] }],
    ["a fractional quantity", { ...input, lines: [{ sku: "A", quantity: 1.5, unitPrice: 1 }] }],
    [
      "a price that is not whole VND",
      { ...input, lines: [{ sku: "A", quantity: 1, unitPrice: 99.5 }] },
    ],
    ["a negative price", { ...input, lines: [{ sku: "A", quantity: 1, unitPrice: -1 }] }],
    ["a malformed SKU", { ...input, lines: [{ sku: "a b", quantity: 1, unitPrice: 1 }] }],
    ["a request id that is not a UUID", { ...input, requestId: "abc" }],
    [
      "a customer id that is not a UUID (the mock's old CUS-0010)",
      { ...input, customerId: "CUS-0010" },
    ],
    ["no shipping address", { ...input, shippingAddressId: "" }],
  ])("refuses %s without calling the BE", async (_name, bad) => {
    const post = vi.spyOn(api, "post");
    await expect(placeOrder(bad)).rejects.toBeInstanceOf(z.ZodError);
    expect(post).not.toHaveBeenCalled();
  });

  it("rejects with a ZodError when the BE answers something that is not an order", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: { ...placed, totalAmount: "780000" } });
    await expect(placeOrder(input)).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe("checkout errors by BE errorCode", () => {
  const err = (code: string, status = 409, message = "English developer text") =>
    new ApiError(status, code, message, undefined, "corr-1");

  it.each([
    ["INSUFFICIENT_STOCK", "không đủ tồn kho"],
    ["CHECKOUT_PRICE_CHANGED", "Giá đã thay đổi"],
    ["PRICE_NOT_AVAILABLE", "chưa có giá bán"],
    ["CUSTOMER_PRICE_BELOW_MOQ", "số lượng tối thiểu"],
    ["PRODUCT_NOT_PURCHASABLE", "ngừng bán"],
    ["SKU_NOT_SELLABLE", "ngừng bán"],
    ["PAYMENT_TERM_NOT_ALLOWED", "Điều khoản thanh toán"],
    ["CUSTOMER_CREDIT_OVERDUE", "công nợ quá hạn"],
    ["CUSTOMER_NOT_ACTIVE", "chưa được kích hoạt"],
    ["SHIPPING_ADDRESS_REQUIRED", "địa chỉ giao hàng"],
    ["ADDRESS_NOT_FOUND", "không còn trong sổ địa chỉ"],
    ["DESIGN_QUOTE_REQUIRED", "báo giá"],
    ["DESIGN_SAMPLE_NOT_APPROVED", "mẫu được duyệt"],
    ["IDEMPOTENCY_KEY_REUSED", "nội dung khác"],
    ["IDEMPOTENT_REQUEST_IN_PROGRESS", "đang được xử lý"],
    ["LOCK_TIMEOUT", "đang bận"],
    ["GUEST_CHECKOUT_DISABLED", "đã đăng nhập"],
    ["CUSTOMER_NOT_FOUND", "chưa được liên kết"],
    ["VALIDATION_FAILED", "chưa hợp lệ"],
    ["FORBIDDEN", "không có quyền"],
    ["RATE_LIMITED", "quá nhanh"],
  ])("says %s in Vietnamese, never the English message", (code, text) => {
    const message = describeCheckoutError(err(code, code === "FORBIDDEN" ? 403 : 409));
    expect(message).toContain(text);
    expect(message).not.toContain("English developer text");
    expect(message).toContain("Mã tra cứu: corr-1");
  });

  it("falls back to a general message for a code it does not know, and for a server fault", () => {
    expect(describeCheckoutError(err("SOMETHING_NEW", 409))).toContain(
      "Không thực hiện được yêu cầu",
    );
    expect(describeCheckoutError(err("INTERNAL_ERROR", 500))).toContain("Hệ thống đang gặp sự cố");
    expect(
      describeCheckoutError(new ApiError(0, "NETWORK_ERROR", "Không kết nối được máy chủ.")),
    ).toBe("Không kết nối được máy chủ.");
  });

  it("re-reads the cart only after the failures that mean its prices or stock are out of date", () => {
    for (const code of [
      "INSUFFICIENT_STOCK",
      "CHECKOUT_PRICE_CHANGED",
      "PRICE_NOT_AVAILABLE",
      "CUSTOMER_PRICE_BELOW_MOQ",
      "PRODUCT_NOT_PURCHASABLE",
      "SKU_NOT_SELLABLE",
    ]) {
      expect(isStaleCartError(err(code))).toBe(true);
    }
    for (const code of ["PAYMENT_TERM_NOT_ALLOWED", "SHIPPING_ADDRESS_REQUIRED", "LOCK_TIMEOUT"]) {
      expect(isStaleCartError(err(code))).toBe(false);
    }
    expect(isStaleCartError(new Error("x"))).toBe(false);
  });

  it("treats a credit order over its limit as a placed order waiting for approval, not an error", () => {
    expect(describePlacedStatus("ON_HOLD").title).toContain("chờ duyệt công nợ");
    expect(describePlacedStatus("PENDING_PAYMENT").description).toContain("Hàng đã được giữ");
    expect(describePlacedStatus("CONFIRMED").title).toBe("Đã đặt hàng");
  });
});

describe("ids the dev BE really sends (no RFC version/variant bits)", () => {
  it("places an order for such a customer and address, and reads such an order id", async () => {
    const odd = "e5c50b95-014a-18a3-7a2b-5fd7a1dcb8ed";
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: { ...placed, orderId: odd } });
    const order = await placeOrder({ ...input, customerId: odd, shippingAddressId: odd });
    expect(post).toHaveBeenCalledOnce();
    expect(order.orderId).toBe(odd);
  });
});
