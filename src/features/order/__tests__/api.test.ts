import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { api } from "@/lib/api/client";

import { cancelMyOrder, getMyOrders, getOrder } from "../api";
import { beOrder, bePage, orderId } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

describe("order API (BE OrderController)", () => {
  it("calls /orders/me without /v1 and maps FE page 1 → BE page 0", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: bePage() });

    const result = await getMyOrders({ page: 1, size: 10 });

    expect(get).toHaveBeenCalledWith("/orders/me", { params: { page: 0, size: 10 } });
    expect(result.page).toBe(1);
  });

  it("maps FE page 3 → BE page 2 and keeps the BE paging flags", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({
      data: bePage({ page: 2, totalElements: 25, totalPages: 3, hasPrevious: true }),
    });

    const result = await getMyOrders({ page: 3, size: 10 });

    expect(get.mock.calls[0]?.[1]).toMatchObject({ params: { page: 2, size: 10 } });
    expect(result).toMatchObject({
      page: 3,
      totalPages: 3,
      totalElements: 25,
      hasNext: false,
      hasPrevious: true,
    });
  });

  it("never sends a negative page to the BE", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: bePage() });
    await getMyOrders({ page: 0, size: 10 });
    expect(get.mock.calls[0]?.[1]).toMatchObject({ params: { page: 0 } });
  });

  it("parses the order detail once at the boundary", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: beOrder });

    await expect(getOrder(orderId)).resolves.toMatchObject({ orderId, status: "PAID" });
    expect(get).toHaveBeenCalledWith(`/orders/${orderId}`, {});
  });

  it("rejects with a ZodError when the BE breaks the contract", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: { ...beOrder, totalAmount: "507000" } });
    await expect(getOrder(orderId)).rejects.toBeInstanceOf(z.ZodError);
  });

  it("sends the cancellation reason as a query param and ignores the Void body", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: { success: true, timestamp: "2026-10-08T00:00:00Z" } });

    await expect(cancelMyOrder({ orderId, reason: "CHANGED_MIND" })).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledWith(`/orders/${orderId}/cancellation`, undefined, {
      params: { reason: "CHANGED_MIND" },
    });
  });

  it("omits reason so the BE defaults to CUSTOMER_REQUEST", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: {} });
    await cancelMyOrder({ orderId });
    expect(post).toHaveBeenCalledWith(`/orders/${orderId}/cancellation`, undefined, { params: {} });
  });

  it("drops a blank reason so the BE records CUSTOMER_REQUEST instead of answering 400", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: {} });
    await cancelMyOrder({ orderId, reason: "   " });
    expect(post).toHaveBeenCalledWith(`/orders/${orderId}/cancellation`, undefined, { params: {} });
  });

  it("trims the reason before sending it", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: {} });
    await cancelMyOrder({ orderId, reason: "  Đặt nhầm size  " });
    expect(post.mock.calls[0]?.[2]).toEqual({ params: { reason: "Đặt nhầm size" } });
  });

  it.each([
    ["a reason longer than the 500-char column", { orderId, reason: "x".repeat(501) }],
    ["an order id that is not a UUID", { orderId: "SO-20260907-000431" }],
  ])("rejects %s without calling the BE", async (_case, input) => {
    const post = vi.spyOn(api, "post");
    await expect(cancelMyOrder(input)).rejects.toBeInstanceOf(z.ZodError);
    expect(post).not.toHaveBeenCalled();
  });
});
