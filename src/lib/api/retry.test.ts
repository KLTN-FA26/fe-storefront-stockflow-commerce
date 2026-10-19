import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApiError } from "./error";
import { retryTransient } from "./retry";

describe("retryTransient", () => {
  it("retries a network blip and a 5xx, twice", () => {
    expect(retryTransient(0, new ApiError(0, "NETWORK_ERROR", "x"))).toBe(true);
    expect(retryTransient(1, new ApiError(503, "X", "x"))).toBe(true);
    expect(retryTransient(2, new ApiError(503, "X", "x"))).toBe(false);
  });

  it("does not retry what answers the same again: a 4xx or a contract break", () => {
    expect(retryTransient(0, new ApiError(403, "FORBIDDEN", "x"))).toBe(false);
    expect(retryTransient(0, new ApiError(404, "NOT_FOUND", "x"))).toBe(false);
    expect(retryTransient(0, z.object({}).safeParse(1).error)).toBe(false);
  });
});
