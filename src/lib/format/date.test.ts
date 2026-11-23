import { describe, expect, it } from "vitest";

import { daysLeftText, daysUntil, formatDate, formatDateTime, vnDayOf } from "./date";

describe("date formatting (dd/MM/yyyy, SF-UX-3)", () => {
  it("formats a calendar day as dd/MM/yyyy", () => {
    expect(formatDate("2026-12-05")).toBe("05/12/2026");
  });

  it("formats an instant as its day in Vietnam", () => {
    // 20:00 UTC on 14/12 is already 03:00 on 15/12 in Vietnam.
    expect(formatDate("2026-12-14T20:00:00Z")).toBe("15/12/2026");
  });

  it("formats a date-time as dd/MM/yyyy HH:mm on a 24-hour clock", () => {
    expect(formatDateTime("2026-12-15T03:05:00Z")).toBe("15/12/2026 10:05");
    expect(formatDateTime("2026-12-15T13:30:00Z")).toBe("15/12/2026 20:30");
    expect(formatDateTime("2026-12-14T17:00:00Z")).toBe("15/12/2026 00:00");
  });

  it("gives the Vietnam calendar day of an instant", () => {
    expect(vnDayOf(new Date("2026-12-14T17:30:00Z"))).toBe("2026-12-15");
  });

  it("counts whole Vietnam calendar days until a deadline", () => {
    const now = new Date("2026-11-23T02:00:00Z"); // 09:00 on 23/11 in Vietnam
    expect(daysUntil("2026-11-23T16:59:59Z", now)).toBe(0);
    expect(daysUntil("2026-11-24T16:59:59Z", now)).toBe(1);
    expect(daysUntil("2026-11-26T03:00:00Z", now)).toBe(3);
    expect(daysUntil("2026-11-22T10:00:00Z", now)).toBe(-1);
  });

  it("words the days left, and nothing once the day has passed", () => {
    const now = new Date("2026-11-23T02:00:00Z");
    expect(daysLeftText("2026-11-23T16:59:59Z", now)).toBe("hết hạn hôm nay");
    expect(daysLeftText("2026-11-25T10:00:00Z", now)).toBe("còn 2 ngày");
    expect(daysLeftText("2026-11-20T10:00:00Z", now)).toBeNull();
  });
});
