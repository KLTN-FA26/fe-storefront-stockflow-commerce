import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/error";

import { returnEligibility } from "../eligibility";
import { describeReturnError } from "../errors";
import { customerReturnDtoSchema } from "../schemas";
import { claimsByOrderLine } from "../selectors";
import { beReturn, ORDER_LINE_ID } from "./fixtures";

const S1 = "5e000000-0000-4000-8000-000000000001";
const S2 = "5e000000-0000-4000-8000-000000000002";
// 10/11 giờ VN → hạn 7 ngày hết lúc 0 giờ 18/11 giờ VN (17/11 17:00Z).
const FIRST = "2026-11-10T03:00:00Z";
const SECOND = "2026-11-14T03:00:00Z";
const NOW = new Date("2026-11-18T00:00:00Z");
const delivered = (shipmentId: string | null, outcomeAt: string) => ({
  shipmentId,
  shipmentCode: shipmentId ? `SO-1-${shipmentId.slice(-1)}` : null,
  status: "DELIVERED",
  outcomeAt,
});

describe("returnEligibility (BE ReturnRequest.deliveredShipment + requireReturnable, WF-05 TH-1)", () => {
  it("returns an order with no shipment recorded as a whole, from its delivery", () => {
    const open = returnEligibility(
      { status: "DELIVERED", shipments: [], deliveredAt: SECOND },
      7,
      NOW,
    );
    expect(open).toMatchObject({ kind: "open", shipments: [], needsChoice: false });
    expect(
      returnEligibility({ status: "DELIVERED", shipments: [], deliveredAt: FIRST }, 7, NOW),
    ).toEqual({ kind: "closed", reason: "WINDOW_CLOSED" });
  });

  it("needs the delivery named once the order was delivered in two, each with its own window", () => {
    const result = returnEligibility(
      { status: "DELIVERED", shipments: [delivered(S1, FIRST), delivered(S2, SECOND)] },
      7,
      NOW,
    );
    expect(result.kind).toBe("open");
    if (result.kind !== "open") return;
    expect(result.needsChoice).toBe(true);
    expect(result.shipments.map((s) => [s.shipmentId, s.windowOpen])).toEqual([
      [S1, false],
      [S2, true],
    ]);
  });

  it("runs the window for as many days as the contract agreed", () => {
    const result = returnEligibility(
      { status: "DELIVERED", shipments: [delivered(S1, FIRST), delivered(S2, SECOND)] },
      14,
      NOW,
    );
    expect(result.kind === "open" && result.shipments.every((s) => s.windowOpen)).toBe(true);
  });

  it("takes a delivered shipment back while a later one is still on its way", () => {
    const shipments = [delivered(S1, SECOND), { shipmentId: S2, status: "HANDED_OVER" }];
    expect(returnEligibility({ status: "SHIPPED", shipments }, 7, NOW)).toMatchObject({
      kind: "open",
      needsChoice: false,
    });
    expect(
      returnEligibility({ status: "SHIPPED", shipments: [{ status: "HANDED_OVER" }] }, 7, NOW),
    ).toEqual({ kind: "closed", reason: "NOT_DELIVERED" });
    expect(returnEligibility({ status: "REFUNDED", shipments }, 7, NOW)).toEqual({
      kind: "closed",
      reason: "NOT_RETURNABLE",
    });
  });

  it("carries what each delivery brought, or null from a BE that does not send it", () => {
    const lines = [{ orderLineId: ORDER_LINE_ID, quantity: 2, returnableQuantity: 1 }];
    const result = returnEligibility(
      {
        status: "DELIVERED",
        shipments: [{ ...delivered(S1, FIRST), lines }, delivered(S2, SECOND)],
      },
      7,
      NOW,
    );
    expect(result.kind === "open" && result.shipments.map((s) => s.lines)).toEqual([lines, null]);
  });

  it("sends the customer to Sales when several deliveries carry no id to name", () => {
    expect(
      returnEligibility(
        { status: "DELIVERED", shipments: [delivered(null, SECOND), delivered(null, SECOND)] },
        7,
        NOW,
      ),
    ).toEqual({ kind: "contactSales" });
  });
});

describe("returnEligibility reads the BE's returnableQuantity (SF-05, WF-05 Q-15)", () => {
  const withLines = (shipmentId: string, outcomeAt: string, returnable: number) => ({
    ...delivered(shipmentId, outcomeAt),
    lines: [{ orderLineId: ORDER_LINE_ID, quantity: 2, returnableQuantity: returnable }],
  });

  it("makes a delivery returnable only when one of its lines has units left", () => {
    const result = returnEligibility(
      { status: "DELIVERED", shipments: [withLines(S1, SECOND, 0), withLines(S2, SECOND, 2)] },
      7,
      NOW,
    );
    expect(result.kind === "open" && result.shipments.map((s) => s.returnable)).toEqual([
      false,
      true,
    ]);
  });

  it("closes the order when the BE takes nothing back, though the FE's window is open", () => {
    expect(
      returnEligibility({ status: "DELIVERED", shipments: [withLines(S1, SECOND, 0)] }, 7, NOW),
    ).toEqual({ kind: "closed", reason: "NOT_RETURNABLE" });
    // Past the FE's count as well: worded as the window.
    expect(
      returnEligibility({ status: "DELIVERED", shipments: [withLines(S1, FIRST, 0)] }, 7, NOW),
    ).toEqual({ kind: "closed", reason: "WINDOW_CLOSED" });
  });

  it("opens what the BE takes, past the FE's own window and whatever the order's status", () => {
    // A longer contract period than the FE read (or none read: 7 days), or a late claim accepted.
    const late = returnEligibility(
      { status: "DELIVERED", shipments: [withLines(S1, FIRST, 1)] },
      7,
      NOW,
    );
    expect(late).toMatchObject({ kind: "open", needsChoice: false });
    expect(late.kind === "open" && late.shipments[0]).toMatchObject({
      returnable: true,
      windowOpen: false,
    });
    // Q-15: a refund settled on one delivery leaves the other one returnable.
    expect(
      returnEligibility(
        {
          status: "PARTIALLY_REFUNDED",
          shipments: [withLines(S1, SECOND, 0), withLines(S2, SECOND, 1)],
        },
        7,
        NOW,
      ),
    ).toMatchObject({ kind: "open", needsChoice: true });
    // And a closed order is closed because the BE says 0, not because the FE knows CLOSED.
    expect(
      returnEligibility({ status: "CLOSED", shipments: [withLines(S1, SECOND, 0)] }, 7, NOW),
    ).toEqual({ kind: "closed", reason: "NOT_RETURNABLE" });
  });

  it("does not ask for a delivery the BE did not date when it sends its lines", () => {
    const undated = { shipmentId: S1, status: "DELIVERED", lines: withLines(S1, SECOND, 1).lines };
    const result = returnEligibility({ status: "DELIVERED", shipments: [undated] }, 7, NOW);
    expect(result.kind === "open" && result.shipments[0]).toMatchObject({
      deliveredAt: null,
      windowEnd: null,
      returnable: true,
    });
  });
});

describe("per-delivery claims and refusals", () => {
  it("blocks a line only for an open return on the same delivery", () => {
    const onFirst = customerReturnDtoSchema.parse(beReturn({ shipmentId: S1 }));
    expect(claimsByOrderLine([onFirst], { shipmentId: S1 }).open.has(ORDER_LINE_ID)).toBe(true);
    const onSecond = claimsByOrderLine([onFirst], { shipmentId: S2 });
    expect(onSecond.open.has(ORDER_LINE_ID)).toBe(false);
    // What the other delivery's return holds still counts against the line.
    expect(onSecond.claimed.get(ORDER_LINE_ID)).toBe(1);
  });

  it("explains the shipment refusals in Vietnamese", () => {
    expect(describeReturnError(new ApiError(422, "RETURN_SHIPMENT_REQUIRED", "x"))).toContain(
      "Vui lòng liên hệ Sale",
    );
    expect(describeReturnError(new ApiError(409, "RETURN_SHIPMENT_NOT_DELIVERED", "x"))).toContain(
      "chưa giao thành công",
    );
    expect(describeReturnError(new ApiError(409, "RETURN_GOODS_PARTLY_RECEIVED", "x"))).toContain(
      "không thể rút",
    );
    // WF-05 Q-15: the delivery chosen was settled by a return already.
    expect(describeReturnError(new ApiError(409, "RETURN_SHIPMENT_NOT_RETURNABLE", "x"))).toContain(
      "đã được xử lý trả hàng và hoàn tiền",
    );
    expect(describeReturnError(new ApiError(409, "RETURN_ORDER_NOT_RETURNABLE", "x"))).toContain(
      "đã đóng",
    );
  });

  it("explains the evidence, goods, rate-limit and conflict refusals in Vietnamese", () => {
    const text = (status: number, code: string) =>
      describeReturnError(new ApiError(status, code, "English developer text"));
    expect(text(409, "RETURN_EVIDENCE_REQUIRED")).toContain("ít nhất một ảnh");
    expect(text(409, "RETURN_GOODS_REQUIRED")).toContain("gửi về kho trước khi hoàn tiền");
    expect(text(429, "RATE_LIMITED")).toContain("thao tác quá nhanh");
    expect(text(409, "CONFLICT")).toContain("tải lại trang");
    for (const code of ["RETURN_EVIDENCE_REQUIRED", "RETURN_GOODS_REQUIRED", "CONFLICT"]) {
      expect(text(409, code)).not.toContain("English");
    }
  });
});
