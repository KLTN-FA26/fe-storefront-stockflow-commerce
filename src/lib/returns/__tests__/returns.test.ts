import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import { addMyReturnPhoto, cancelMyReturn, getMyReturn, listMyReturns, openMyReturn } from "../api";
import { describeReturnError } from "../errors";
import { customerReturnDtoSchema, openReturnInputSchema, returnRowDtoSchema } from "../schemas";
import {
  RETURN_REFUSAL_REASON_LABEL,
  acceptsPhotos,
  canOpenReturn,
  canWithdrawReturn,
  claimedUnits,
  claimsByOrderLine,
  refundOutcome,
  returnStatusMeta,
} from "../selectors";
import { beReturn, ORDER_ID, ORDER_LINE_ID, RETURN_ID } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

const REQUEST_ID = "5b2f8a10-0000-4000-8000-000000000001";

describe("customer returns — contract (BE ReturnRequestController)", () => {
  it("parses the customer's view and reads a newer status as UNKNOWN", () => {
    expect(customerReturnDtoSchema.parse(beReturn()).lines[0]?.approvedQuantity).toBe(1);
    expect(customerReturnDtoSchema.parse(beReturn({ status: "ARCHIVED" })).status).toBe("UNKNOWN");
  });

  it("lists the customer's own returns, 1-based, with repeated status params", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({
      data: {
        items: [],
        page: 0,
        size: 20,
        totalElements: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false,
      },
    });
    const page = await listMyReturns({ page: 1, size: 20, status: ["REQUESTED"] });
    expect(page.page).toBe(1);
    const [url, config] = get.mock.calls[0]!;
    expect(url).toBe("/returns/me");
    expect(config?.params).toEqual({
      page: 0,
      size: 20,
      orderId: undefined,
      status: ["REQUESTED"],
    });
    expect(config?.paramsSerializer).toEqual({ indexes: null });
  });

  it("reads one of the customer's returns", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: beReturn() });
    await getMyReturn(RETURN_ID);
    expect(get).toHaveBeenCalledWith(`/returns/me/${RETURN_ID}`, {});
  });

  it("opens a return with its request id, always asking for a refund", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beReturn() });
    await openMyReturn({
      orderId: ORDER_ID,
      requestId: REQUEST_ID,
      reasonCode: "PRINT_DEFECT",
      description: "  ",
      lines: [{ orderLineId: ORDER_LINE_ID, quantity: 2 }],
    });
    expect(post).toHaveBeenCalledWith(`/orders/${ORDER_ID}/returns`, {
      requestId: REQUEST_ID,
      reasonCode: "PRINT_DEFECT",
      description: undefined,
      requestedResolution: "REFUND",
      lines: [{ orderLineId: ORDER_LINE_ID, quantity: 2 }],
    });
  });

  it("names the delivery the goods came on (WF-05 TH-1, RETURN_SHIPMENT_REQUIRED)", async () => {
    const shipmentId = "5e000000-0000-4000-8000-000000000002";
    const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beReturn({ shipmentId }) });
    const opened = await openMyReturn({
      orderId: ORDER_ID,
      requestId: REQUEST_ID,
      reasonCode: "WRONG_ITEM",
      lines: [{ orderLineId: ORDER_LINE_ID, quantity: 1 }],
      shipmentId,
    });
    expect(post.mock.calls[0]?.[1]).toMatchObject({ shipmentId });
    expect(opened.shipmentId).toBe(shipmentId);
  });

  it("refuses OTHER without a description before anything is sent (BE ReturnRequest.open)", () => {
    const result = openReturnInputSchema.safeParse({
      orderId: ORDER_ID,
      requestId: REQUEST_ID,
      reasonCode: "OTHER",
      lines: [{ orderLineId: ORDER_LINE_ID, quantity: 1 }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["description"]);
  });

  it("sends a photo as multipart and a withdrawal with its reason", async () => {
    const post = vi
      .spyOn(api, "post")
      .mockResolvedValueOnce({ data: beReturn({ status: "REQUESTED" }) })
      .mockResolvedValueOnce({ data: beReturn({ status: "CANCELLED" }) });
    await addMyReturnPhoto(RETURN_ID, new File(["x"], "loi.jpg", { type: "image/jpeg" }));
    const [url, body, config] = post.mock.calls[0]!;
    expect(url).toBe(`/returns/${RETURN_ID}/evidence`);
    expect(body).toBeInstanceOf(FormData);
    expect(config?.headers).toEqual({ "Content-Type": "multipart/form-data" });
    await cancelMyReturn(RETURN_ID, " Đã tự xử lý ");
    expect(post).toHaveBeenLastCalledWith(`/returns/${RETURN_ID}/cancellation`, {
      reason: "Đã tự xử lý",
    });
  });
});

describe("customer returns — rules", () => {
  it("opens only on a delivered order inside the 7-day window (BR-RMA-001)", () => {
    const delivered = "2026-11-10T03:00:00Z"; // 10/11 giờ VN → hết hạn 0 giờ 18/11 giờ VN
    expect(canOpenReturn("DELIVERED", delivered, new Date("2026-11-17T16:59:00Z"))).toBe(true);
    expect(canOpenReturn("DELIVERED", delivered, new Date("2026-11-17T17:00:00Z"))).toBe(false);
    expect(canOpenReturn("RETURN_REQUESTED", delivered, new Date("2026-11-12T00:00:00Z"))).toBe(
      true,
    );
    expect(canOpenReturn("COMPLETED", delivered, new Date("2026-11-12T00:00:00Z"))).toBe(false);
    expect(canOpenReturn("SHIPPED", undefined)).toBe(false);
  });

  it("counts the units other returns hold as the BE does (ReturnLine.claimedUnits)", () => {
    const line = { requestedQuantity: 3, approvedQuantity: 2, refundQuantity: 1 };
    expect(claimedUnits(line, "REQUESTED")).toBe(3);
    expect(claimedUnits(line, "AWAITING_RETURN")).toBe(2);
    expect(claimedUnits({ ...line, approvedQuantity: null }, "RECEIVED")).toBe(0);
    expect(claimedUnits(line, "RESOLVED")).toBe(1);
    expect(claimedUnits(line, "REJECTED")).toBe(0);
    const parsed = customerReturnDtoSchema.parse(beReturn());
    const { claimed, open } = claimsByOrderLine([parsed]);
    expect(claimed.get(ORDER_LINE_ID)).toBe(1);
    expect(open.has(ORDER_LINE_ID)).toBe(true);
  });

  it("explains the BE refusals in Vietnamese, by code", () => {
    expect(
      describeReturnError(new ApiError(409, "RETURN_WINDOW_CLOSED", "The return window closed")),
    ).toContain("quá hạn đổi / trả");
    expect(
      describeReturnError(new ApiError(409, "RETURN_CUSTOM_ITEM_NOT_DEFECTIVE", "printed")),
    ).toContain("in theo thiết kế");
  });
});

describe("canWithdrawReturn (BE cancel: RETURN_GOODS_PARTLY_RECEIVED, WF-05 TH-3)", () => {
  const ret = (over: Record<string, unknown>) => customerReturnDtoSchema.parse(beReturn(over));
  const received = (quantity: number) => [{ ...beReturn().lines[0], receivedQuantity: quantity }];

  it("lets the customer withdraw while nothing of the goods is back", () => {
    expect(canWithdrawReturn(ret({ status: "REQUESTED" }))).toBe(true);
    expect(canWithdrawReturn(ret({ status: "AWAITING_RETURN" }))).toBe(true);
    expect(canWithdrawReturn(ret({ status: "AWAITING_RETURN", lines: received(0) }))).toBe(true);
  });

  it("stops once a parcel reached the warehouse, though the status is still AWAITING_RETURN", () => {
    expect(canWithdrawReturn(ret({ receivedAt: "2026-11-15T03:00:00Z" }))).toBe(false);
    expect(canWithdrawReturn(ret({ lines: received(1) }))).toBe(false);
  });

  it("never offers it past the withdrawable statuses", () => {
    expect(canWithdrawReturn(ret({ status: "RECEIVED" }))).toBe(false);
    expect(canWithdrawReturn(ret({ status: "REJECTED" }))).toBe(false);
  });
});

describe("a return closed without a refund never reads 'Đã hoàn tiền' (SF-01, WF-05 Q-4)", () => {
  const resolved = (over: Record<string, unknown> = {}) =>
    customerReturnDtoSchema.parse(
      beReturn({
        status: "RESOLVED",
        refundedAmount: 0,
        offsetAmount: 0,
        lines: [
          { ...beReturn().lines[0], receivedQuantity: 1, refundQuantity: 0, refundAmount: 0 },
        ],
        ...over,
      }),
    );

  it("reads the BE's outcome and refusal reason, with the fixed Vietnamese labels", () => {
    const refused = resolved({ outcome: "REFUSED", refusalReason: "CUSTOMER_DAMAGE" });
    expect(refundOutcome(refused)).toBe("REFUSED");
    expect(returnStatusMeta(refused).label).toBe("Đã xử lý — không hoàn tiền");
    expect(RETURN_REFUSAL_REASON_LABEL[refused.refusalReason!]).toBe("Hư hỏng do bảo quản/sử dụng");
    expect(RETURN_REFUSAL_REASON_LABEL.NOT_DEFECTIVE).toBe("Không phát hiện lỗi");
    expect(RETURN_REFUSAL_REASON_LABEL.OUT_OF_POLICY).toBe("Ngoài chính sách đổi trả");
    expect(RETURN_REFUSAL_REASON_LABEL.OTHER).toBe("Lý do khác");
    // A reason newer than the FE: no guessed wording.
    const newer = resolved({ outcome: "REFUSED", refusalReason: "SOMETHING_NEW" });
    expect(newer.refusalReason).toBe("UNKNOWN");
    expect(RETURN_REFUSAL_REASON_LABEL.UNKNOWN).toBeNull();
    expect(refundOutcome(resolved({ outcome: "NOTHING_TO_REFUND" }))).toBe("NOTHING_TO_REFUND");
  });

  it("falls back to the money on a BE that sends no outcome: 0 refunded is not a refund", () => {
    expect(refundOutcome(resolved())).toBe("NOTHING_TO_REFUND");
    expect(refundOutcome(resolved({ refundedAmount: null, offsetAmount: null }))).toBe(
      "NOTHING_TO_REFUND",
    );
    expect(returnStatusMeta(resolved()).label).not.toBe("Đã hoàn tiền");
    // Only the deduction from installments still owed is still a refund to the customer.
    const offset = resolved({ offsetAmount: 150_000 });
    expect(refundOutcome(offset)).toBe("REFUNDED");
    expect(returnStatusMeta(offset).label).toBe("Đã hoàn tiền");
  });

  it("never trusts a REFUNDED outcome that carries no money", () => {
    expect(refundOutcome(resolved({ outcome: "REFUNDED" }))).toBe("NOTHING_TO_REFUND");
    expect(refundOutcome(resolved({ outcome: "REFUNDED", refundedAmount: 200_000 }))).toBe(
      "REFUNDED",
    );
  });

  it("reads a list row the same way, from its own amounts", () => {
    const row = (over: Record<string, unknown>) =>
      returnRowDtoSchema.parse({
        ...beReturn({ status: "RESOLVED" }),
        settlementAmount: 0,
        refundedAmount: 0,
        offsetAmount: 0,
        ...over,
      });
    expect(returnStatusMeta(row({})).label).toBe("Đã xử lý — không hoàn tiền");
    expect(
      returnStatusMeta(row({ settlementAmount: 300_000, refundedAmount: 300_000 })).label,
    ).toBe("Đã hoàn tiền");
    expect(returnStatusMeta(row({ outcome: "REFUSED", settlementAmount: 0 })).label).toBe(
      "Đã xử lý — không hoàn tiền",
    );
  });

  it("leaves every other status to the status table", () => {
    const open = customerReturnDtoSchema.parse(beReturn({ status: "SETTLEMENT_PENDING" }));
    expect(refundOutcome(open)).toBeNull();
    expect(returnStatusMeta(open).label).toBe("Đang duyệt hoàn tiền");
  });
});

describe("claim photos and claimed units (SF-04, BE-21)", () => {
  it("takes claim photos while the return waits for approval or for its goods, as the BE does", () => {
    expect(acceptsPhotos("REQUESTED")).toBe(true);
    expect(acceptsPhotos("AWAITING_RETURN")).toBe(true);
    for (const status of ["RECEIVED", "SETTLEMENT_PENDING", "RESOLVED", "REJECTED"] as const) {
      expect(acceptsPhotos(status)).toBe(false);
    }
  });

  it("holds the units that came back, even when nothing was refunded for them", () => {
    const line = {
      requestedQuantity: 3,
      approvedQuantity: 2,
      refundQuantity: 0,
      receivedQuantity: 3,
    };
    expect(claimedUnits(line, "RECEIVED")).toBe(3);
    expect(claimedUnits(line, "RESOLVED")).toBe(3);
    expect(claimedUnits({ ...line, receivedQuantity: 1 }, "EXPIRED")).toBe(1);
    expect(claimedUnits({ ...line, receivedQuantity: null }, "CANCELLED")).toBe(0);
  });
});
