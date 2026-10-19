import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { api } from "@/lib/api/client";

import { cancelMyOrder, getMyOrders, getOrder } from "../api";
import type { CancelOrderInput } from "../types";
import { beOrder, bePage, orderId } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

describe("order API (BE OrderController)", () => {
  it("calls /orders/me without /v1 and maps FE page 1 → BE page 0", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: bePage() });

    const result = await getMyOrders({ page: 1, size: 10 });

    expect(get).toHaveBeenCalledWith("/orders/me", { params: { page: 0, size: 10 } });
    expect(result.page).toBe(1);
    expect(result.items[0]).toMatchObject({ orderId, statusGroup: "CONFIRMED", lineCount: 2 });
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

    await expect(getOrder(orderId)).resolves.toMatchObject({ orderId, status: "CONFIRMED" });
    expect(get).toHaveBeenCalledWith(`/orders/me/${orderId}`, {});
  });

  it("rejects with a ZodError when the BE breaks the contract", async () => {
    vi.spyOn(api, "get").mockResolvedValueOnce({ data: { ...beOrder, total: "507000" } });
    await expect(getOrder(orderId)).rejects.toBeInstanceOf(z.ZodError);
  });

  it("sends the cancellation as a JSON body and reads what it did (cancelled at once)", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: { result: "CANCELLED", order: { orderId } } });

    await expect(
      cancelMyOrder({ orderId, reasonCode: "DUPLICATE_ORDER", note: "Đặt trùng" }),
    ).resolves.toEqual({ result: "CANCELLED" });
    expect(post).toHaveBeenCalledWith(`/orders/${orderId}/cancellation`, {
      reasonCode: "DUPLICATE_ORDER",
      note: "Đặt trùng",
    });
  });

  it("reads the 202 answer as a request for Sales, with its id", async () => {
    const requestId = "c4a1ce11-0000-4000-8000-000000000001";
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: { result: "REQUESTED", requestId } });
    await expect(cancelMyOrder({ orderId })).resolves.toEqual({ result: "REQUESTED", requestId });
  });

  it("sends no body when there is neither a reason nor a note, so the BE defaults to CUSTOMER_REQUEST", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: { result: "CANCELLED" } });
    await cancelMyOrder({ orderId });
    expect(post).toHaveBeenCalledWith(`/orders/${orderId}/cancellation`, undefined);
  });

  it("drops a blank note and trims the rest", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { result: "CANCELLED" } });
    await cancelMyOrder({ orderId, reasonCode: "CUSTOMER_REQUEST", note: "   " });
    expect(post.mock.calls[0]?.[1]).toEqual({ reasonCode: "CUSTOMER_REQUEST", note: undefined });
    await cancelMyOrder({ orderId, reasonCode: "OTHER", note: "  Đặt nhầm size  " });
    expect(post.mock.calls[1]?.[1]).toEqual({ reasonCode: "OTHER", note: "Đặt nhầm size" });
  });

  it("parses a result newer than the FE as UNKNOWN instead of failing", async () => {
    vi.spyOn(api, "post").mockResolvedValueOnce({ data: { result: "SCHEDULED" } });
    await expect(cancelMyOrder({ orderId })).resolves.toEqual({ result: "UNKNOWN" });
  });

  it.each<[string, CancelOrderInput]>([
    ["a note longer than the BE's 1000 characters", { orderId, note: "x".repeat(1001) }],
    [
      "OTHER without a note (BE: other with no explanation is not a reason)",
      { orderId, reasonCode: "OTHER" },
    ],
    ["OTHER with a blank note", { orderId, reasonCode: "OTHER", note: "  " }],
    [
      "a reason code the BE does not have",
      { orderId, reasonCode: "CHANGED_MIND" } as unknown as CancelOrderInput,
    ],
    ["an order id that is not a UUID", { orderId: "SO-20260907-000431" }],
  ])("rejects %s without calling the BE", async (_case, input) => {
    const post = vi.spyOn(api, "post");
    await expect(cancelMyOrder(input)).rejects.toBeInstanceOf(z.ZodError);
    expect(post).not.toHaveBeenCalled();
  });
});
