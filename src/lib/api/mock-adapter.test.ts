import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { api } from "./client";
import { ApiError } from "./error";
import { activateMockAdapter } from "./mock-adapter";

const originalAdapter = api.defaults.adapter;

beforeAll(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  activateMockAdapter();
});

afterEach(() => vi.restoreAllMocks());

afterAll(() => {
  if (originalAdapter) api.defaults.adapter = originalAdapter;
});

describe("mock adapter settles like a real HTTP adapter", () => {
  it("resolves 2xx handler responses", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const response = await api.get("/customers/me");

    expect(response.status).toBe(200);
  });

  it("rejects a 409 handler response as ApiError with the BE error fields", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const error = await api
      .put("/customers/me", { fullName: "Tên", phone: null, version: 999 })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "OPTIMISTIC_LOCK",
      correlationId: "mock-customer-conflict",
    });
  });

  it("rejects the simulated random server error", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);

    const error = await api.get("/customers/me").catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500, code: "MOCK_RANDOM_ERROR" });
  });

  it("rejects an unmatched route with 404", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const error = await api.get("/does-not-exist").catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404 });
  });
});
