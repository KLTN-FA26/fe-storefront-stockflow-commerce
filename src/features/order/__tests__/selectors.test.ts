import { describe, expect, it } from "vitest";

import { customerTimeline } from "../selectors";
import type { OrderTimelineEntry } from "../types";

const at = (hour: number) => `2026-10-07T0${hour}:00:00Z`;
const entry = (
  status: OrderTimelineEntry["status"],
  statusGroup: OrderTimelineEntry["statusGroup"],
  hour: number,
  reasonCode?: OrderTimelineEntry["reasonCode"],
): OrderTimelineEntry => ({
  status,
  statusGroup,
  occurredAt: at(hour),
  ...(reasonCode ? { reasonCode } : {}),
});

describe("customerTimeline", () => {
  it("keeps the BE order (oldest first) and one step per customer-facing group", () => {
    const steps = customerTimeline([
      entry("PENDING_PAYMENT", "AWAITING_PAYMENT", 1),
      entry("CONFIRMED", "CONFIRMED", 2),
      entry("READY_TO_FULFILL", "PREPARING", 3),
      entry("IN_FULFILMENT", "PREPARING", 4),
      entry("SHIPPED", "SHIPPING", 5),
    ]);
    expect(steps.map((s) => s.statusGroup)).toEqual([
      "AWAITING_PAYMENT",
      "CONFIRMED",
      "PREPARING",
      "SHIPPING",
    ]);
    // The step shows when the group was entered, not when it last changed.
    expect(steps[2]?.occurredAt).toBe(at(3));
  });

  it("never merges UNKNOWN groups: they are not known to mean the same thing", () => {
    const steps = customerTimeline([
      entry("UNKNOWN", "UNKNOWN", 1),
      entry("UNKNOWN", "UNKNOWN", 2),
    ]);
    expect(steps).toHaveLength(2);
  });

  it("keeps a group that comes back later (ON_HOLD, released, ON_HOLD again)", () => {
    const steps = customerTimeline([
      entry("CONFIRMED", "CONFIRMED", 1),
      entry("ON_HOLD", "UNDER_REVIEW", 2),
      entry("CONFIRMED", "CONFIRMED", 3),
    ]);
    expect(steps.map((s) => s.statusGroup)).toEqual(["CONFIRMED", "UNDER_REVIEW", "CONFIRMED"]);
  });

  it("keeps the reason code of the cancellation step", () => {
    const [step] = customerTimeline([entry("CANCELLED", "CANCELLED", 1, "OUT_OF_STOCK")]);
    expect(step?.reasonCode).toBe("OUT_OF_STOCK");
  });

  it("is empty without a timeline (NON_NULL omits it)", () => {
    expect(customerTimeline(undefined)).toEqual([]);
    expect(customerTimeline(null)).toEqual([]);
  });
});
