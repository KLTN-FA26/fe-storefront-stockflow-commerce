import { describe, expect, it } from "vitest";

import { lastReturnDay, returnWindowEnd } from "./return-window";

describe("returnWindowEnd (BE ReturnPolicy.endOfDays)", () => {
  it("ends at Vietnam midnight after the 7th whole day following the delivery day", () => {
    // Giao 17:00 giờ VN ngày 01/11 → hết hạn 0 giờ VN ngày 09/11
    expect(returnWindowEnd("2026-11-01T10:00:00Z").toISOString()).toBe("2026-11-08T17:00:00.000Z");
    // 06:00 giờ VN ngày 02/11 (23:00Z ngày 01/11) là ngày 02/11 theo giờ VN
    expect(returnWindowEnd("2026-11-01T23:00:00Z").toISOString()).toBe("2026-11-09T17:00:00.000Z");
  });

  it("the last day to ask is the day before the window ends", () => {
    expect(lastReturnDay("2026-11-01T10:00:00Z").toISOString()).toBe("2026-11-08T16:59:59.999Z");
  });
});
