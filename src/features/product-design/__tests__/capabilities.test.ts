import { describe, expect, it } from "vitest";

import { PROPOSED_ENDPOINTS_LIVE, designCapabilities } from "../capabilities";

describe("designCapabilities", () => {
  it("enables proposed endpoints only in mock mode", () => {
    expect(designCapabilities(true)).toEqual({
      selfService: true,
      document: true,
      assets: true,
      reviewRequest: true,
      statusFilter: true,
    });
    expect(designCapabilities(false).selfService).toBe(false);
  });

  it("keeps every proposed endpoint off against the real BE until it ships", () => {
    expect(PROPOSED_ENDPOINTS_LIVE).toEqual({
      selfService: false,
      document: false,
      assets: false,
      reviewRequest: false,
      statusFilter: false,
    });
    expect(designCapabilities(false)).toEqual(PROPOSED_ENDPOINTS_LIVE);
  });

  it("hands out a copy, so a caller cannot flip the constant", () => {
    const capabilities = designCapabilities(false);
    capabilities.document = true;
    expect(designCapabilities(false).document).toBe(false);
  });
});
