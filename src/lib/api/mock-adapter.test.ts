import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { InternalAxiosRequestConfig } from "axios";

import { api } from "./client";
import { ApiError } from "./error";
import { activateDesignMockAdapter, activateMockAdapter, isDesignMockPath } from "./mock-adapter";

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

describe("isDesignMockPath", () => {
  it.each([
    "/designs",
    "/designs/x/document",
    "/catalog/products/ly-a/variants/SKU1/print-config",
    "/__mock/reset",
    "/api/v1/designs?page=0",
  ])("is true for %s", (url) => {
    expect(isDesignMockPath(url)).toBe(true);
  });

  it.each(["/catalog/products/ly-a", "/designs-old", "/orders/me", undefined])(
    "is false for %s",
    (url) => {
      expect(isDesignMockPath(url)).toBe(false);
    },
  );
});

describe("activateDesignMockAdapter", () => {
  it("sends /designs to the mock and /catalog/products to the previous adapter", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const previous = vi.fn((config: InternalAxiosRequestConfig) =>
      Promise.resolve({ status: 200, statusText: "OK", data: { real: true }, headers: {}, config }),
    );
    api.defaults.adapter = previous;

    activateDesignMockAdapter();
    const wrapper = api.defaults.adapter;
    activateDesignMockAdapter(); // StrictMode runs the initializer twice: no second wrap
    expect(api.defaults.adapter).toBe(wrapper);

    const real = await api.get("/catalog/products/ly-a");
    expect(real.data).toEqual({ real: true });
    expect(previous).toHaveBeenCalledTimes(1);

    await api.get("/designs/draft-count").catch(() => undefined);
    expect(previous).toHaveBeenCalledTimes(1);
  });
});
