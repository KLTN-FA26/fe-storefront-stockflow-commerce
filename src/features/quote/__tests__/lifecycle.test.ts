import { describe, expect, it } from "vitest";

import {
  allowedQuoteActions,
  effectiveStatus,
  quoteListHint,
  quoteStatusHint,
  QUOTE_STATUS_META,
} from "../lifecycle";
import { QUOTE_STATUSES } from "../schemas";

const sent = { status: "SENT" as const, validUntil: "2026-12-04T02:00:00Z", legacy: false };
const before = new Date("2026-12-04T01:59:59Z");
const after = new Date("2026-12-04T02:00:00Z");

describe("TC-F03-03: a quote past its validity cannot be answered", () => {
  it("reads a SENT quote at or past validUntil as EXPIRED (BE Quote.statusAt)", () => {
    expect(effectiveStatus(sent, before)).toBe("SENT");
    expect(effectiveStatus(sent, after)).toBe("EXPIRED");
  });

  it("offers accept and change request only on a SENT quote still valid", () => {
    expect(allowedQuoteActions(sent, { canAnswer: true, now: before })).toEqual({
      accept: true,
      requestChanges: true,
    });
    expect(allowedQuoteActions(sent, { canAnswer: true, now: after }).accept).toBe(false);
  });

  it.each([
    "EXPIRED",
    "CANCELLED",
    "CONVERTED",
    "CHANGES_REQUESTED",
    "ACCEPTED",
    "UNKNOWN",
  ] as const)("keeps a %s quote read only", (status) => {
    expect(allowedQuoteActions({ ...sent, status }, { canAnswer: true, now: before })).toEqual({
      accept: false,
      requestChanges: false,
    });
  });

  it("offers nothing without sales-quotes:APPROVE, or on a legacy quote", () => {
    expect(allowedQuoteActions(sent, { canAnswer: false, now: before }).accept).toBe(false);
    expect(
      allowedQuoteActions({ ...sent, legacy: true }, { canAnswer: true, now: before }).accept,
    ).toBe(false);
  });
});

describe("status labels", () => {
  it("names every BE status in Vietnamese", () => {
    expect(QUOTE_STATUS_META.SENT.label).toBe("Đã gửi");
    expect(QUOTE_STATUS_META.CHANGES_REQUESTED.label).toBe("Yêu cầu sửa");
    expect(QUOTE_STATUS_META.ACCEPTED.label).toBe("Đã chấp nhận");
    expect(QUOTE_STATUS_META.EXPIRED.label).toBe("Hết hiệu lực");
    expect(QUOTE_STATUS_META.CANCELLED.label).toBe("Đã huỷ");
    expect(QUOTE_STATUS_META.CONVERTED.label).toBe("Đã tạo đơn");
    for (const status of QUOTE_STATUSES) expect(QUOTE_STATUS_META[status].label).not.toBe(status);
  });
});

describe("CONVERTED hint", () => {
  it("CONVERTED chưa có đơn: nhắc Sale đang lập hợp đồng", () => {
    expect(quoteStatusHint("CONVERTED", {})).toMatch(
      /Sale đang lập hợp đồng; bạn sẽ nhận hợp đồng để ký/,
    );
  });

  it("CONVERTED có đơn: nêu số đơn", () => {
    const convertedOrder = {
      orderId: "0c0e0000-0000-4000-8000-000000000001",
      orderNumber: "SO-20260910-900001",
      status: "PENDING_CONTRACT",
      total: 1,
    };
    expect(quoteStatusHint("CONVERTED", { convertedOrder })).toMatch(/SO-20260910-900001/);
  });

  it("the list uses one general sentence, since its order id is not filtered", () => {
    expect(quoteListHint("CONVERTED")).toBe(
      "Đơn hàng đã được tạo; Sale sẽ gửi hợp đồng để bạn ký.",
    );
    expect(quoteListHint("SENT")).toBe(QUOTE_STATUS_META.SENT.hint);
  });
});
