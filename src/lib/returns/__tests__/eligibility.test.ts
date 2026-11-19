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
  });
});
